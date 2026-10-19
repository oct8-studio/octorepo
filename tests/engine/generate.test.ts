import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { generateProject } from '../../src/engine/generate'
import { CLI_VERSION } from '../../src/meta'
import { CliError } from '../../src/model/errors'
import type { StackConfig } from '../../src/model/stack'
import { parseManifest } from '../../src/model/stack'
import { defaultRegistry } from '../../src/plugins/registry'
import type { FrameworkPlugin, UiFamily } from '../../src/plugins/types'

const stack: StackConfig = {
  name: 'acme',
  monorepoTool: 'turbo',
  packageManager: 'pnpm',
  apps: [
    { name: 'web', kind: 'frontend', framework: 'react-vite', uses: ['api'], port: 3000 },
    { name: 'api', kind: 'backend', framework: 'express', apiStyle: 'rest', port: 4000 },
  ],
  services: ['postgres'],
}

describe('generateProject', () => {
  const tree = generateProject(stack, defaultRegistry())
  it('merges workspace, monorepo, clients, ui, apps and compose', () => {
    for (const key of [
      'apps/web/package.json',
      'apps/api/Dockerfile',
      'apps/web/Dockerfile',
      'packages/api-client/package.json',
      'packages/ui-react/package.json',
      'turbo.json',
      '.octorepo.json',
      'docker-compose.yml',
      '.env.example',
    ]) {
      expect(tree[key], key).toBeDefined()
    }
    const root = JSON.parse(tree['package.json'] as string)
    expect(root.scripts.build).toBe('turbo run build')
    expect(root.devDependencies.typescript).toBeDefined()
  })
  it('gives node-typed shared packages @types/node', () => {
    for (const p of ['packages/types/package.json', 'packages/api-client/package.json']) {
      expect(JSON.parse(tree[p] as string).devDependencies['@types/node'], p).toBeDefined()
    }
  })
  it('writes the manifest', () => {
    const m = parseManifest(JSON.parse(tree['.octorepo.json'] as string))
    expect(m.schemaVersion).toBe(1)
    expect(m.cliVersion).toBe(CLI_VERSION)
    expect(m.apps.map((a) => a.name)).toEqual(['web', 'api'])
  })
  it('wires the affected build into CI', () => {
    const ci = tree['.github/workflows/ci.yml'] as string
    expect(ci).toContain('fetch-depth: 0')
    expect(ci).toContain('pnpm turbo run build --affected')
    const nx = generateProject({ ...stack, monorepoTool: 'nx' }, defaultRegistry())
    expect(nx['.github/workflows/ci.yml']).toContain(
      'run: pnpm nx affected -t build --base=origin/main --head=HEAD',
    )
    expect(nx['nx.json']).toBeDefined()
    expect(nx['turbo.json']).toBeUndefined()
  })
  it('allows dependency builds in pnpm-workspace.yaml', () => {
    const ws = parse(tree['pnpm-workspace.yaml'] as string)
    expect(ws.strictDepBuilds).toBe(false)
    expect(ws.allowBuilds).toEqual({ esbuild: true })
  })
  it('documents each backend CORS_ORIGINS default and adds service URLs', () => {
    expect(tree['apps/api/.env.example']).toContain('# CORS_ORIGINS=http://localhost:3000\n')
    expect(tree['apps/api/.env.example']).toContain('DATABASE_URL=postgres://')
  })
  it('writes a local .env next to every app .env.example', () => {
    for (const app of ['api', 'web']) {
      expect(tree[`apps/${app}/.env`], app).toBe(tree[`apps/${app}/.env.example`])
    }
    expect(tree['.env']).toBeUndefined()
  })
  it('generates ui-react only with a react frontend and one client per backend', () => {
    const backendOnly = generateProject(
      { ...stack, apps: [stack.apps[1] as StackConfig['apps'][number]], services: [] },
      defaultRegistry(),
    )
    expect(Object.keys(backendOnly).some((k) => k.startsWith('packages/ui-react/'))).toBe(false)
    expect(backendOnly['packages/api-client/package.json']).toBeDefined()
    expect(JSON.stringify(tree)).not.toMatch(/\{\{\w+\}\}/)
  })

  describe('shared UI packages per family', () => {
    const stub = (id: string, uiFamily: UiFamily): FrameworkPlugin => ({
      id,
      kind: 'frontend',
      label: id,
      apiStyles: [],
      defaultPort: 3000,
      uiFamily,
      rendering: 'ssr',
      generate: (ctx) => ({ [`apps/${ctx.app.name}/package.json`]: '{}' }),
      dockerfile: () => '',
    })
    const reg = () =>
      defaultRegistry()
        .registerFramework(stub('vue-stub', 'vue'))
        .registerFramework(stub('svelte-stub', 'svelte'))
        .registerFramework(stub('solid-stub', 'solid'))
        .registerUi('vue', () => ({ 'packages/ui-vue/package.json': '{}' }))
        .registerUi('svelte', () => ({ 'packages/ui-svelte/package.json': '{}' }))
    const mixed: StackConfig = {
      ...stack,
      apps: [
        { name: 'a', kind: 'frontend', framework: 'vue-stub', uses: ['api'], port: 3000 },
        { name: 'b', kind: 'frontend', framework: 'svelte-stub', uses: ['api'], port: 3001 },
        { name: 'c', kind: 'frontend', framework: 'vue-stub', uses: [], port: 3002 },
        stack.apps[1] as StackConfig['apps'][number],
      ],
    }

    it('emits one package per distinct family and nothing for unused families', () => {
      const t = generateProject(mixed, reg())
      expect(t['packages/ui-vue/package.json']).toBe('{}')
      expect(t['packages/ui-svelte/package.json']).toBe('{}')
      expect(Object.keys(t).some((k) => k.startsWith('packages/ui-react/'))).toBe(false)
    })
    it('fails when a family has no registered generator', () => {
      const bad: StackConfig = {
        ...stack,
        apps: [
          { name: 'a', kind: 'frontend', framework: 'solid-stub', uses: [], port: 3000 },
          stack.apps[1] as StackConfig['apps'][number],
        ],
      }
      const noSolid = reg()
      noSolid.uiPackages.delete('solid')
      expect(() => generateProject(bad, noSolid)).toThrow(CliError)
      expect(() => generateProject(bad, noSolid)).toThrow(/solid/)
    })
  })

  describe('with an ORM', () => {
    const backends: StackConfig['apps'] = [
      { name: 'api', kind: 'backend', framework: 'express', apiStyle: 'rest', port: 4000 },
      { name: 'core', kind: 'backend', framework: 'nest', apiStyle: 'rest', port: 4001 },
    ]
    const ormStack = (orm: 'drizzle' | 'prisma'): StackConfig => ({
      ...stack,
      apps: [stack.apps[0] as StackConfig['apps'][number], ...backends],
      orm,
    })

    it.each(['drizzle', 'prisma'] as const)(
      '%s: packages/db, backend deps, compose migrate',
      (orm) => {
        const t = generateProject(ormStack(orm), defaultRegistry())
        expect(JSON.parse(t['packages/db/package.json'] as string).name).toBe('@acme/db')
        expect(
          t[orm === 'drizzle' ? 'packages/db/drizzle.config.ts' : 'packages/db/prisma.config.ts'],
        ).toBeDefined()
        for (const b of ['api', 'core']) {
          const pkg = JSON.parse(t[`apps/${b}/package.json`] as string)
          expect(pkg.dependencies['@acme/db'], b).toBe('workspace:*')
          expect(t[`apps/${b}/src/db.ts`], b).toBeDefined()
        }
        expect(
          JSON.parse(t['apps/web/package.json'] as string).dependencies['@acme/db'],
        ).toBeUndefined()
        const compose = parse(t['docker-compose.yml'] as string)
        expect(compose.services.migrate).toBeDefined()
        expect(compose.services.core.depends_on.migrate.condition).toBe(
          'service_completed_successfully',
        )
        expect(parseManifest(JSON.parse(t['.octorepo.json'] as string)).orm).toBe(orm)
      },
    )

    it('lets pnpm run the prisma install scripts only for prisma', () => {
      const ws = (orm: 'drizzle' | 'prisma') =>
        parse(generateProject(ormStack(orm), defaultRegistry())['pnpm-workspace.yaml'] as string)
      expect(ws('prisma').allowBuilds).toEqual({
        esbuild: true,
        prisma: true,
        '@prisma/engines': true,
      })
      expect(ws('drizzle').allowBuilds).toEqual({ esbuild: true })
      expect(ws('prisma').packages).toEqual(['apps/*', 'packages/*'])
    })

    it('generates no db package without an ORM', () => {
      expect(Object.keys(tree).some((p) => p.startsWith('packages/db/'))).toBe(false)
    })
  })
})

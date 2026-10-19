import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { workspaceFiles } from '../../src/engine/workspace'
import type { Manifest } from '../../src/model/stack'
import { parseManifest } from '../../src/model/stack'
import type { ProjectContext } from '../../src/plugins/types'
import { VERSIONS } from '../../src/versions'

const stack = {
  name: 'acme',
  monorepoTool: 'turbo' as const,
  packageManager: 'pnpm' as const,
  apps: [{ name: 'api', kind: 'backend' as const, framework: 'express', port: 4000 }],
  services: [],
}
const ctx: ProjectContext = { stack, scope: '@acme', versions: VERSIONS }
const manifest: Manifest = { ...stack, schemaVersion: 1, cliVersion: '0.1.0' }

describe('workspaceFiles', () => {
  const tree = workspaceFiles(ctx, manifest)
  it('types package is dual format', () => {
    const pkg = JSON.parse(tree['packages/types/package.json'] as string)
    expect(pkg.name).toBe('@acme/types')
    expect(pkg.exports).toEqual({
      '.': {
        import: { types: './dist/index.d.ts', default: './dist/index.js' },
        require: { types: './dist/index.d.cts', default: './dist/index.cjs' },
      },
    })
    expect([pkg.main, pkg.module, pkg.types]).toEqual([
      './dist/index.cjs',
      './dist/index.js',
      './dist/index.d.ts',
    ])
    expect(tree['packages/types/tsdown.config.ts']).toContain('fixedExtension: false')
    expect(tree['packages/types/src/index.ts']).toContain('HelloResponseSchema')
    // Watch without cleaning: dev runs alongside the upstream build that consumers wait for.
    expect(pkg.scripts.dev).toBe('tsdown --watch --no-clean')
  })
  it('config package exports tsconfigs', () => {
    const pkg = JSON.parse(tree['packages/config/package.json'] as string)
    expect(pkg.name).toBe('@acme/config')
    expect(Object.keys(pkg.exports)).toContain('./tsconfig.react.json')
  })
  it('manifest round-trips', () => {
    expect(parseManifest(JSON.parse(tree['.octorepo.json'] as string)).name).toBe('acme')
  })
  it('lets openapi-typescript accept the pinned TypeScript major', () => {
    const ws = parse(tree['pnpm-workspace.yaml'] as string)
    expect(ws.peerDependencyRules).toEqual({ allowedVersions: { typescript: '6' } })
  })
  it('root files', () => {
    expect(tree['pnpm-workspace.yaml']).toContain('apps/*')
    expect(tree['.nvmrc']).toBe('24\n')
    expect(tree['.dockerignore']).toContain('**/node_modules')
    // Local .env files hold dev settings and must never be baked into images.
    expect(tree['.dockerignore']?.split('\n')).toEqual(
      expect.arrayContaining(['.env', '**/.env', '**/.env.local', '**/.env.*']),
    )
    // ...but .env.example (documentation only) stays in the build context; the negation comes last.
    const lines = tree['.dockerignore']?.trim().split('\n') ?? []
    expect(lines.at(-1)).toBe('!**/.env.example')
    expect(lines.indexOf('**/.env.*')).toBeLessThan(lines.indexOf('!**/.env.example'))
    expect(tree['README.md']).toContain('pnpm --filter @acme/api dev')
    const root = JSON.parse(tree['package.json'] as string)
    expect(root.private).toBe(true)
    expect(root.packageManager).toMatch(/^pnpm@/)
    expect(root.scripts).toBeUndefined()
    expect(tree['.github/workflows/ci.yml']).toContain('pnpm install')
    expect(tree['README.md']).toContain('4000')
    expect(tree['README.md']).toContain('gitignored copy of\n`.env.example`')
    const biome = JSON.parse(tree['biome.json'] as string)
    expect(biome.files.includes).toContain('!**/openapi.json')
    // Every framework's build/generated output is ignored at the root, so apps need no nested config.
    for (const dir of [
      '.output',
      '.nuxt',
      '.svelte-kit',
      '.astro',
      '.react-router',
      '.tanstack',
      '.nitro',
      '.turbo',
    ]) {
      expect(biome.files.includes).toContain(`!**/${dir}`)
      expect(tree['.gitignore']?.split('\n')).toContain(dir)
    }
    // `build` is anchored to apps so unrelated build dirs (scripts, docs) stay tracked and linted.
    expect(biome.files.includes).toContain('!apps/*/build')
    expect(biome.files.includes).not.toContain('!**/build')
    expect(tree['.gitignore']?.split('\n')).toContain('apps/*/build')
    expect(tree['.gitignore']?.split('\n')).not.toContain('build')
    expect(biome.files.includes).toContain('!**/routeTree.gen.ts')
    expect(biome.html).toEqual({ experimentalFullSupportEnabled: true })
    for (const dir of [
      '.output',
      '.nuxt',
      '.svelte-kit',
      '.astro',
      '.react-router',
      'build',
      '.solid',
      '.data',
    ]) {
      expect(tree['.dockerignore']?.split('\n')).toContain(`**/${dir}`)
    }
  })
  it('AGENTS.md lists apps inside markers, with one kbee hint; CLAUDE.md imports it', () => {
    const agents = tree['AGENTS.md'] as string
    const inner = agents.slice(
      agents.indexOf('<!-- octorepo:begin -->'),
      agents.indexOf('<!-- octorepo:end -->'),
    )
    expect(inner).toContain('| api | backend | express | 4000 | - |')
    expect(inner).toContain('pnpm --filter @acme/api dev')
    expect(inner).toContain('src/generated/**')
    expect(inner.match(/oct8-studio\/kbee/g)).toHaveLength(1)
    expect(agents.match(/oct8-studio\/kbee/g)).toHaveLength(1)
    expect(tree['CLAUDE.md']).toBe('@AGENTS.md\n')
  })
  it('AGENTS.md mentions packages/db when orm is set', () => {
    const orm = { ...manifest, orm: 'drizzle' as const }
    const agents = workspaceFiles({ ...ctx, stack: orm }, orm)['AGENTS.md'] as string
    expect(agents).toContain('packages/db')
    // Drizzle generates nothing under packages/db/src/generated; only Prisma's client lives there.
    expect(agents).not.toContain('packages/db/src/generated/**')
    expect(agents).toContain('`db:migration`: create a migration')
    expect(agents).toContain('`db:migrate`: apply committed migrations')
    expect(agents).toContain('pnpm --filter @acme/db <script>')
    expect(agents).toContain('drizzle-kit generate')
    expect(agents).not.toContain('migrate, studio')
    const prisma = { ...manifest, orm: 'prisma' as const }
    const prismaAgents = workspaceFiles({ ...ctx, stack: prisma }, prisma)['AGENTS.md'] as string
    expect(prismaAgents).toContain('regenerate the Prisma Client')
    expect(prismaAgents).toContain(', `packages/db/src/generated/**`. Don')
  })
  it('README and AGENTS.md explain bringing up services and the database', () => {
    const db = { ...manifest, services: ['postgres', 'valkey'], orm: 'drizzle' as const }
    const files = workspaceFiles({ ...ctx, stack: db }, db)
    for (const doc of [files['README.md'], files['AGENTS.md']] as string[]) {
      expect(doc).toContain('Database & services')
      expect(doc).toContain('`docker compose up -d postgres valkey`')
      expect(doc).toContain('`pnpm --filter @acme/db db:migrate && pnpm --filter @acme/db db:seed`')
      expect(doc).toContain(
        '`docker compose up`: or run the full stack in containers (migrate runs automatically)',
      )
    }
    const svc = { ...manifest, services: ['redis'] }
    const plain = workspaceFiles({ ...ctx, stack: svc }, svc)['README.md'] as string
    expect(plain).toContain('`docker compose up -d redis`')
    expect(plain).not.toContain('db:migrate')
    expect(tree['README.md']).not.toContain('Database & services')
    expect(tree['AGENTS.md']).not.toContain('Database & services')
  })
})

import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { runAddApp } from '../../src/commands/add-app'
import { runCreate } from '../../src/commands/create'
import { CliError, ManifestError } from '../../src/model/errors'
import type { StackConfig } from '../../src/model/stack'
import { defaultRegistry } from '../../src/plugins/registry'

const config: StackConfig = {
  name: 'demo',
  monorepoTool: 'turbo',
  packageManager: 'pnpm',
  apps: [
    { name: 'web', kind: 'frontend', framework: 'react-vite', uses: ['api'] },
    { name: 'api', kind: 'backend', framework: 'express' },
  ],
  services: [],
}
const reg = defaultRegistry()

async function list(root: string): Promise<string[]> {
  return (await readdir(root, { recursive: true })).sort()
}
const read = (root: string, p: string) => readFile(join(root, p), 'utf8')

let root: string
beforeEach(async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'octo-add-'))
  const r = await runCreate(
    { config, cwd, dir: 'repo', install: false, git: false, force: false, json: true, yes: true },
    reg,
  )
  root = r.root
})

describe('runAddApp', () => {
  it('adds a backend, regenerates tool-owned files, leaves user files alone', async () => {
    const appBefore = await read(root, 'apps/web/src/App.tsx')
    const pkg = JSON.parse(await read(root, 'package.json'))
    pkg.scripts.foo = 'bar'
    await writeFile(join(root, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)

    const r = await runAddApp(
      { cwd: root, json: true, app: { name: 'billing', kind: 'backend', framework: 'express' } },
      reg,
    )
    expect(r.written.length).toBeGreaterThan(0)
    expect(existsSync(join(root, 'apps/billing/src/app.ts'))).toBe(true)
    expect(await read(root, 'docker-compose.yml')).toContain('billing')
    const manifest = JSON.parse(await read(root, '.octorepo.json'))
    expect(manifest.apps).toHaveLength(3)
    expect(await read(root, 'apps/web/src/App.tsx')).toBe(appBefore)
    expect(JSON.parse(await read(root, 'package.json')).scripts.foo).toBe('bar')
    expect(existsSync(join(root, 'packages/billing-client'))).toBe(true)
  })

  it('adds a frontend using two backends', async () => {
    await runAddApp(
      { cwd: root, json: true, app: { name: 'billing', kind: 'backend', framework: 'express' } },
      reg,
    )
    const ui = await read(root, 'packages/ui-react/package.json')
    await runAddApp(
      {
        cwd: root,
        json: true,
        app: { name: 'admin', kind: 'frontend', framework: 'next', uses: ['api', 'billing'] },
      },
      reg,
    )
    expect(await read(root, 'packages/ui-react/package.json')).toBe(ui)
    const gen = await read(root, 'apps/admin/src/generated/api.ts')
    expect(gen).toContain('@demo/api-client')
    expect(gen).toContain('@demo/billing-client')
    // Backends' CORS defaults are tool-owned and pick up the new frontend; their .env is not touched.
    const admin = JSON.parse(await read(root, '.octorepo.json')).apps.find(
      (a: { name: string }) => a.name === 'admin',
    )
    expect(await read(root, 'apps/api/src/generated/cors.ts')).toContain(
      `['http://localhost:3000', 'http://localhost:${admin.port}']`,
    )
    expect(await read(root, 'apps/api/.env')).toContain('# CORS_ORIGINS=http://localhost:3000\n')
    expect(existsSync(join(root, 'apps/admin/.env'))).toBe(true)
  })

  it('rejects a missing manifest and writes nothing', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'octo-add-empty-'))
    const app = { name: 'x', kind: 'backend' as const, framework: 'express' }
    const err = await runAddApp({ cwd: empty, json: true, app }, reg).catch((e) => e)
    expect(err).toBeInstanceOf(ManifestError)
    expect(err.reason).toBe('missing')
    expect(await list(empty)).toEqual([])
  })

  it('rejects an unsupported schemaVersion and writes nothing', async () => {
    const m = JSON.parse(await read(root, '.octorepo.json'))
    await writeFile(join(root, '.octorepo.json'), JSON.stringify({ ...m, schemaVersion: 2 }))
    const before = await list(root)
    const app = { name: 'x', kind: 'backend' as const, framework: 'express' }
    const err = await runAddApp({ cwd: root, json: true, app }, reg).catch((e) => e)
    expect(err).toBeInstanceOf(ManifestError)
    expect(err.reason).toBe('unsupported-schema')
    expect(err.message).toContain('2')
    expect(err.message).toContain('1')
    expect(await list(root)).toEqual(before)
  })

  it('rejects a duplicate name and writes nothing', async () => {
    const before = await list(root)
    const app = { name: 'api', kind: 'backend' as const, framework: 'express' }
    const err = await runAddApp({ cwd: root, json: true, app }, reg).catch((e) => e)
    expect(err).toBeInstanceOf(CliError)
    expect(err.message).toContain('duplicate')
    expect(await list(root)).toEqual(before)
  })

  it('refuses when apps/<name> already exists on disk', async () => {
    await mkdir(join(root, 'apps/billing/src'), { recursive: true })
    await writeFile(join(root, 'apps/billing/src/app.ts'), 'USER')
    const before = await list(root)
    const app = { name: 'billing', kind: 'backend' as const, framework: 'express' }
    await expect(runAddApp({ cwd: root, json: true, app }, reg)).rejects.toBeInstanceOf(CliError)
    expect(await list(root)).toEqual(before)
    expect(await read(root, 'apps/billing/src/app.ts')).toBe('USER')
  })

  it('refuses invalid JSON in a tool-owned file and writes nothing', async () => {
    const turbo = await read(root, 'turbo.json')
    await writeFile(join(root, 'turbo.json'), `// note\n${turbo}`)
    const before = await list(root)
    const app = { name: 'billing', kind: 'backend' as const, framework: 'express' }
    const err = await runAddApp({ cwd: root, json: true, app }, reg).catch((e) => e)
    expect(err).toBeInstanceOf(CliError)
    expect(err.message).toContain('turbo.json')
    expect(await list(root)).toEqual(before)
    expect(await read(root, 'turbo.json')).toBe(`// note\n${turbo}`)
  })

  it('keeps user-changed values and adds missing generated keys', async () => {
    const pkg = JSON.parse(await read(root, 'package.json'))
    pkg.scripts.build = 'echo USER'
    const dep = Object.keys(pkg.devDependencies)[0] as string
    pkg.devDependencies[dep] = '0.0.1-user'
    delete pkg.scripts.lint
    await writeFile(join(root, 'package.json'), JSON.stringify(pkg))
    await runAddApp(
      { cwd: root, json: true, app: { name: 'billing', kind: 'backend', framework: 'express' } },
      reg,
    )
    const after = JSON.parse(await read(root, 'package.json'))
    expect(after.scripts.build).toBe('echo USER')
    expect(after.devDependencies[dep]).toBe('0.0.1-user')
    expect(after.scripts.lint).toBeDefined()
  })

  it('creates packages/ui-react when the first React frontend is added', async () => {
    const m = JSON.parse(await read(root, '.octorepo.json'))
    // simulate a backend-only repo
    m.apps = m.apps.filter((a: { kind: string }) => a.kind === 'backend')
    await writeFile(join(root, '.octorepo.json'), JSON.stringify(m))
    await rm(join(root, 'packages/ui-react'), { recursive: true })
    await runAddApp(
      {
        cwd: root,
        json: true,
        app: { name: 'admin', kind: 'frontend', framework: 'react-vite', uses: ['api'] },
      },
      reg,
    )
    expect(existsSync(join(root, 'packages/ui-react/package.json'))).toBe(true)
  })

  it('creates the UI package of a new family and leaves ui-react untouched', async () => {
    const vueReg = defaultRegistry()
      .registerFramework({
        id: 'vue-stub',
        kind: 'frontend',
        label: 'Vue stub',
        apiStyles: [],
        defaultPort: 3000,
        uiFamily: 'vue',
        rendering: 'spa',
        generate: (ctx) => ({ [`apps/${ctx.app.name}/package.json`]: '{}\n' }),
        dockerfile: () => 'FROM scratch\n',
      })
      .registerUi('vue', () => ({
        'packages/ui-vue/package.json': '{"name":"@demo/ui-vue"}\n',
        'packages/ui-vue/src/index.ts': 'export {}\n',
      }))
    const uiDir = join(root, 'packages/ui-react')
    const before = await Promise.all(
      (await list(uiDir)).map(async (f) => [f, await read(uiDir, f).catch(() => '')]),
    )
    await runAddApp(
      {
        cwd: root,
        json: true,
        app: { name: 'vue', kind: 'frontend', framework: 'vue-stub', uses: ['api'] },
      },
      vueReg,
    )
    expect(await read(root, 'packages/ui-vue/package.json')).toBe('{"name":"@demo/ui-vue"}\n')
    expect(existsSync(join(root, 'packages/ui-vue/src/index.ts'))).toBe(true)
    const after = await Promise.all(
      (await list(uiDir)).map(async (f) => [f, await read(uiDir, f).catch(() => '')]),
    )
    expect(after).toEqual(before)
  })

  it('adds the first SvelteKit frontend to a React repo: creates ui-svelte, ui-react byte-identical', async () => {
    const uiDir = join(root, 'packages/ui-react')
    const snapshot = async () =>
      Promise.all((await list(uiDir)).map(async (f) => [f, await read(uiDir, f).catch(() => '')]))
    const before = await snapshot()
    await runAddApp(
      {
        cwd: root,
        json: true,
        app: { name: 'blog', kind: 'frontend', framework: 'sveltekit', uses: ['api'] },
      },
      reg,
    )
    expect(JSON.parse(await read(root, 'packages/ui-svelte/package.json')).name).toBe(
      '@demo/ui-svelte',
    )
    expect(existsSync(join(root, 'packages/ui-svelte/src/Card.svelte'))).toBe(true)
    expect(existsSync(join(root, 'apps/blog/src/routes/+page.svelte'))).toBe(true)
    expect(await snapshot()).toEqual(before)
  })

  it('keeps the ORM: the new backend uses @demo/db and packages/db is left alone', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'octo-add-orm-'))
    const created = await runCreate(
      {
        config: { ...config, orm: 'drizzle' },
        cwd,
        dir: 'repo',
        install: false,
        git: false,
        force: false,
        json: true,
        yes: true,
      },
      reg,
    )
    const schema = join(created.root, 'packages/db/src/schema.ts')
    await writeFile(schema, '// user schema\n')
    const r = await runAddApp(
      { cwd: created.root, json: true, app: { name: 'core', kind: 'backend', framework: 'koa' } },
      reg,
    )
    expect(r.written.some((p) => p.startsWith('packages/db/'))).toBe(false)
    expect(await read(created.root, 'packages/db/src/schema.ts')).toBe('// user schema\n')
    const pkg = JSON.parse(await read(created.root, 'apps/core/package.json'))
    expect(pkg.dependencies['@demo/db']).toBe('workspace:*')
    expect(JSON.parse(await read(created.root, '.octorepo.json')).orm).toBe('drizzle')
    expect(await read(created.root, 'docker-compose.yml')).toContain(
      'service_completed_successfully',
    )
  })

  it('add app refreshes only the AGENTS.md section; user text and kbee-once survive', async () => {
    const path = join(root, 'AGENTS.md')
    const orig = await readFile(path, 'utf8')
    await writeFile(path, `ABOVE\n\n${orig}\nBELOW no newline`)
    await runAddApp(
      { cwd: root, json: true, app: { name: 'billing', kind: 'backend', framework: 'express' } },
      reg,
    )
    const out = await readFile(path, 'utf8')
    expect(out.startsWith('ABOVE\n\n# AGENTS.md')).toBe(true)
    expect(out.endsWith('\nBELOW no newline')).toBe(true)
    const inner = out.slice(
      out.indexOf('<!-- octorepo:begin -->'),
      out.indexOf('<!-- octorepo:end -->'),
    )
    expect(inner).toContain('| billing | backend | express |')
    expect(inner).toContain('| web | frontend | react-vite |')
    expect(inner.match(/oct8-studio\/kbee/g)).toHaveLength(1)
    expect(out.match(/octorepo:begin/g)).toHaveLength(1)
  })

  it('add app appends the section when AGENTS.md has no markers', async () => {
    const path = join(root, 'AGENTS.md')
    await writeFile(path, '# Mine\n')
    await runAddApp(
      { cwd: root, json: true, app: { name: 'billing', kind: 'backend', framework: 'express' } },
      reg,
    )
    const out = await readFile(path, 'utf8')
    expect(out.startsWith('# Mine\n\n<!-- octorepo:begin -->')).toBe(true)
    expect(out).toContain('| billing |')
  })

  describe('upgrading a repo generated by 0.1.x', () => {
    // Root files exactly as octorepo 0.1.0 generated them (src/engine/workspace.ts at b06b5a5),
    // plus one line the user added to each.
    const gitignore01 =
      'node_modules\ndist\n.next\n.turbo\n.nx\n.env\n*.log\ncoverage\n.DS_Store\nmy-local-dir\n'
    const dockerignore01 =
      'node_modules\n**/node_modules\n**/dist\n**/.next\n.git\n.turbo\n.nx\n.env\n**/.env\n**/.env.local\nsecrets'
    const biome01 = {
      $schema: 'https://biomejs.dev/schemas/2.0.0/schema.json',
      files: {
        includes: [
          '**',
          '!**/dist',
          '!**/.next',
          '!**/node_modules',
          '!**/openapi.json',
          '!**/*.d.ts',
          '!my-vendor',
        ],
      },
      formatter: { indentStyle: 'space', indentWidth: 2, lineWidth: 120 },
      javascript: { formatter: { quoteStyle: 'single', semicolons: 'asNeeded' } },
      linter: { enabled: true },
    }
    const addNuxt = (name: string) =>
      runAddApp(
        {
          cwd: root,
          json: true,
          app: { name, kind: 'frontend', framework: 'nuxt', uses: ['api'] },
        },
        reg,
      )

    beforeEach(async () => {
      await writeFile(join(root, '.gitignore'), gitignore01)
      await writeFile(join(root, '.dockerignore'), dockerignore01)
      await writeFile(join(root, 'biome.json'), `${JSON.stringify(biome01, null, 2)}\n`)
    })

    it('appends missing ignore lines and merges biome.json, keeping user content', async () => {
      await addNuxt('shop')
      const gi = await read(root, '.gitignore')
      expect(gi.startsWith(gitignore01)).toBe(true)
      expect(gi.split('\n')).toEqual(expect.arrayContaining(['.nuxt', '.output', '.svelte-kit']))
      const di = await read(root, '.dockerignore')
      expect(di.startsWith(`${dockerignore01}\n`)).toBe(true)
      expect(di.split('\n')).toEqual(
        expect.arrayContaining(['**/.nuxt', '**/.output', '**/.env.*', '!**/.env.example']),
      )
      const biome = JSON.parse(await read(root, 'biome.json'))
      expect(biome.files.includes.slice(0, biome01.files.includes.length)).toEqual(
        biome01.files.includes,
      )
      expect(biome.files.includes).toEqual(
        expect.arrayContaining(['!**/.nuxt', '!**/.output', '!**/.nitro', '!apps/*/build']),
      )
      expect(biome.html).toEqual({ experimentalFullSupportEnabled: true })
      expect(biome.formatter.lineWidth).toBe(120)
      expect(biome.$schema).toBe(biome01.$schema)
    })

    it('is idempotent on a second add', async () => {
      await addNuxt('shop')
      const snapshot = () =>
        Promise.all(['.gitignore', '.dockerignore', 'biome.json'].map((f) => read(root, f)))
      const first = await snapshot()
      await addNuxt('shop2')
      expect(await snapshot()).toEqual(first)
    })

    it('keeps a user-set html.experimentalFullSupportEnabled', async () => {
      await writeFile(
        join(root, 'biome.json'),
        JSON.stringify({ ...biome01, html: { experimentalFullSupportEnabled: false } }),
      )
      await addNuxt('shop')
      expect(JSON.parse(await read(root, 'biome.json')).html.experimentalFullSupportEnabled).toBe(
        false,
      )
    })

    it('warns instead of failing when biome.json has comments', async () => {
      const jsonc = '// mine\n{ "linter": { "enabled": true } }\n'
      await writeFile(join(root, 'biome.json'), jsonc)
      const r = await addNuxt('shop')
      expect(await read(root, 'biome.json')).toBe(jsonc)
      expect(r.warnings.map((w) => w.message).join('\n')).toContain('biome.json')
    })

    it('leaves current-version root files unchanged', async () => {
      const fresh = await mkdtemp(join(tmpdir(), 'octo-add-fresh-'))
      const created = await runCreate(
        {
          config,
          cwd: fresh,
          dir: 'repo',
          install: false,
          git: false,
          force: false,
          json: true,
          yes: true,
        },
        reg,
      )
      const files = ['.gitignore', '.dockerignore', 'biome.json']
      const before = await Promise.all(files.map((f) => read(created.root, f)))
      const r = await runAddApp(
        {
          cwd: created.root,
          json: true,
          app: { name: 'shop', kind: 'frontend', framework: 'nuxt', uses: ['api'] },
        },
        reg,
      )
      expect(await Promise.all(files.map((f) => read(created.root, f)))).toEqual(before)
      for (const f of files) expect(r.written).not.toContain(join(created.root, f))
      await rm(fresh, { recursive: true, force: true })
    })
  })
})

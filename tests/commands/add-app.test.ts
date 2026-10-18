import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
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
})

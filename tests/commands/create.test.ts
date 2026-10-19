import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { runCreate } from '../../src/commands/create'
import { CliError } from '../../src/model/errors'
import type { StackConfig } from '../../src/model/stack'
import { defaultRegistry } from '../../src/plugins/registry'

const run = promisify(execFile)

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
const base = { install: false, git: false, force: false, json: true, yes: true }

describe('runCreate', () => {
  it('writes the project and reports fixes', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'octo-create-'))
    const r = await runCreate({ ...base, config, cwd, dir: 'out' }, defaultRegistry())
    expect(r.root).toBe(join(cwd, 'out'))
    expect(existsSync(join(cwd, 'out/.octorepo.json'))).toBe(true)
    const manifest = JSON.parse(await readFile(join(cwd, 'out/.octorepo.json'), 'utf8'))
    expect(manifest.apps.find((a: { name: string }) => a.name === 'api').port).toBe(4000)
    expect(r.fixes.length).toBeGreaterThan(0)
    expect(r.manual).toContain('pnpm install')
  })
  it('rejects an invalid stack without creating the directory', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'octo-create-'))
    await expect(
      runCreate({ ...base, config: { ...config, apps: [] }, cwd, dir: 'bad' }, defaultRegistry()),
    ).rejects.toBeInstanceOf(CliError)
    expect(existsSync(join(cwd, 'bad'))).toBe(false)
  })
})

describe('cli create --preset', () => {
  const tsx = join(process.cwd(), 'node_modules/.bin/tsx')
  const cli = join(process.cwd(), 'src/cli.ts')
  const create = async (cwd: string, ...args: string[]) =>
    run(tsx, [cli, 'create', 'x', '--no-install', '--no-git', '--json', ...args], { cwd })

  it('preset apps first, extra --app appended, preset recorded in the manifest', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'octo-preset-'))
    await create(cwd, '--preset', 'api-platform', '--app', 'backend:jobs:express')
    const m = JSON.parse(await readFile(join(cwd, 'x/.octorepo.json'), 'utf8'))
    expect(m.preset).toBe('api-platform')
    expect(m.schemaVersion).toBe(1)
    expect(m.apps.map((a: { name: string }) => a.name)).toEqual([
      'gateway',
      'users',
      'billing',
      'docs',
      'jobs',
    ])
    expect(m.orm).toBe('prisma')
    expect(m.services).toEqual(expect.arrayContaining(['postgres', 'rabbitmq']))
  })

  it('rejects a name collision with the preset and writes nothing', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'octo-preset-'))
    await expect(
      create(
        cwd,
        '--preset',
        'saas',
        '--app',
        'backend:web-api:express',
        '--app',
        'backend:api:express',
      ),
    ).rejects.toThrow(/collides with preset "saas"/)
    expect(existsSync(join(cwd, 'x'))).toBe(false)
  })
})

describe('cli create', () => {
  it('prints JSON only with --json', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'octo-cli-'))
    const tsx = join(process.cwd(), 'node_modules/.bin/tsx')
    const cli = join(process.cwd(), 'src/cli.ts')
    const { stdout } = await run(
      tsx,
      [
        cli,
        'create',
        'x',
        '--tool',
        'nx',
        '--app',
        'backend:api:express',
        '--no-install',
        '--no-git',
        '--json',
      ],
      { cwd },
    )
    const out = JSON.parse(stdout)
    expect(out.root.endsWith('x')).toBe(true)
    expect(Object.keys(out).sort()).toEqual(['fixes', 'manual', 'root', 'warnings'])
    expect(existsSync(join(cwd, 'x/nx.json'))).toBe(true)
  }, 30_000)
  it('exits 1 with a message on invalid input', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'octo-cli-'))
    const tsx = join(process.cwd(), 'node_modules/.bin/tsx')
    const cli = join(process.cwd(), 'src/cli.ts')
    const err = await run(
      tsx,
      [cli, 'create', 'y', '--tool', 'nx', '--app', 'backend:api:nope', '--yes'],
      {
        cwd,
      },
    ).catch((e) => e)
    expect(err.code).toBe(1)
    expect(err.stderr).toContain('nope')
    expect(existsSync(join(cwd, 'y'))).toBe(false)
  }, 30_000)
})

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { nextSteps, runCreate } from '../../src/commands/create'
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
      'edge',
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

describe('cli create --app named like a service', () => {
  it('rejects an app named like a registered service id and writes nothing', async () => {
    const tsx = join(process.cwd(), 'node_modules/.bin/tsx')
    const cli = join(process.cwd(), 'src/cli.ts')
    const cwd = await mkdtemp(join(tmpdir(), 'octo-svcname-'))
    await expect(
      run(
        tsx,
        [
          cli,
          'create',
          'x',
          '--no-install',
          '--no-git',
          '--json',
          '--tool',
          'turbo',
          '--app',
          'backend:mailpit:hono',
        ],
        { cwd },
      ),
    ).rejects.toThrow(/App name "mailpit" collides with the compose service "mailpit"/)
    expect(existsSync(join(cwd, 'x'))).toBe(false)
  })
})

describe('nextSteps', () => {
  const s = { ...config, services: ['postgres'], orm: 'prisma' as const }
  it('lists services, migrate + seed before pnpm dev, then the full-stack alternative', () => {
    expect(nextSteps('x', ['pnpm install'], s)).toEqual([
      'cd x',
      'pnpm install',
      'docker compose up -d postgres',
      'pnpm --filter @demo/db db:migrate && pnpm --filter @demo/db db:seed',
      'pnpm dev',
      '',
      'Or run the full stack in Docker (migrations run automatically):',
      '  docker compose up',
    ])
  })
  it('is just cd and pnpm dev without services or ORM', () => {
    expect(nextSteps('x', [], config)).toEqual(['cd x', 'pnpm dev'])
  })
  it('with kbee ends with the first commit, then /kbee init', () => {
    expect(nextSteps('x', [], { ...config, kbee: true })).toEqual([
      'cd x',
      'pnpm dev',
      '',
      'Then build the kbee knowledge base:',
      '  git add -A && git commit -m init',
      '  In Claude Code / Codex: /kbee init',
    ])
  })
})

describe('cli create human output', () => {
  it('create --preset saas prints DB steps in Next steps, then the kbee hint', async () => {
    const tsx = join(process.cwd(), 'node_modules/.bin/tsx')
    const cli = join(process.cwd(), 'src/cli.ts')
    const cwd = await mkdtemp(join(tmpdir(), 'octo-human-'))
    const { stdout, stderr } = await run(
      tsx,
      [cli, 'create', 'x', '--preset', 'saas', '--no-install', '--no-git'],
      { cwd },
    )
    const next = stdout.indexOf('Next steps:')
    expect(next).toBeGreaterThan(-1)
    const after = stdout.slice(next)
    expect(after).toContain('docker compose up -d postgres valkey mailpit')
    expect(after).toContain('pnpm --filter @x/db db:migrate && pnpm --filter @x/db db:seed')
    expect(after).toContain('docker compose up\n')
    expect(after.indexOf('pnpm dev')).toBeGreaterThan(after.indexOf('db:seed'))
    expect(after.indexOf('oct8-studio/kbee')).toBeGreaterThan(after.indexOf('docker compose up\n'))
    expect(stdout.match(/oct8-studio\/kbee/g)).toHaveLength(1)
    expect(stderr).not.toContain('kbee')
  }, 30_000)
})

describe('cli create --kbee', () => {
  const tsx = join(process.cwd(), 'node_modules/.bin/tsx')
  const cli = join(process.cwd(), 'src/cli.ts')
  const args = ['create', 'x', '--tool', 'turbo', '--app', 'backend:api:express', '--no-install']

  it('writes kb/, records kbee, lists the skills install as manual; JSON only', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'octo-kbee-cli-'))
    const { stdout } = await run(tsx, [cli, ...args, '--kbee', '--json'], { cwd })
    const out = JSON.parse(stdout)
    expect(out.manual).toEqual(
      expect.arrayContaining([expect.stringContaining('oct8-studio/kbee')]),
    )
    const kb = JSON.parse(await readFile(join(cwd, 'x/kb/manifest.json'), 'utf8'))
    expect(kb.repos.map((r: { name: string }) => r.name)).toEqual(['types', 'api'])
    expect(JSON.parse(await readFile(join(cwd, 'x/.octorepo.json'), 'utf8')).kbee).toBe(true)
    expect(existsSync(join(cwd, 'x/.git'))).toBe(true)
  }, 30_000)

  it('human output ends with the first commit and /kbee init, no install hint', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'octo-kbee-cli-'))
    const { stdout } = await run(tsx, [cli, ...args, '--kbee'], { cwd })
    expect(stdout).toContain('git add -A && git commit -m init')
    expect(stdout.trimEnd().endsWith('/kbee init')).toBe(true)
    expect(stdout).not.toContain('kbee-init and treat each package')
  }, 30_000)

  it('--kbee with --no-git exits 1 and writes nothing', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'octo-kbee-cli-'))
    const err = await run(tsx, [cli, ...args, '--kbee', '--no-git', '--json'], { cwd }).catch(
      (e) => e,
    )
    expect(err.code).toBe(1)
    expect(err.stderr).toContain('kbee needs git')
    expect(existsSync(join(cwd, 'x'))).toBe(false)
  }, 30_000)
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
    expect(stdout).not.toContain('kbee')
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

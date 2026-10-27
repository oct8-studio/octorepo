import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { runCreate } from '../../src/commands/create'
import { KBEE_TIP } from '../../src/commands/report'
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

describe('cli create human output', () => {
  const tsx = join(process.cwd(), 'node_modules/.bin/tsx')
  const cli = join(process.cwd(), 'src/cli.ts')
  const saas = ['create', 'x', '--preset', 'saas', '--no-install', '--no-git']

  it('create --preset saas: one summary, relative path, numbered steps, then the kbee tip', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'octo-human-'))
    const { stdout, stderr } = await run(tsx, [cli, ...saas], { cwd })
    // Auto-fixes are routine: summarised, not listed.
    expect(stdout).not.toContain('fix:')
    expect(stdout.startsWith('✓ x: 4 apps · turbo · drizzle · postgres, valkey, mailpit\n')).toBe(
      true,
    )
    expect(stdout).toContain('  ports  web 3000 · admin 3001 · api 4000 · worker 4001\n')
    expect(stdout).toContain('\nCreated ./x\n')
    expect(stdout).not.toContain(cwd)
    // Not a TTY: no ANSI codes.
    expect(stdout).not.toContain('\x1b[')
    const next = stdout.indexOf('Next steps:')
    expect(next).toBeGreaterThan(-1)
    const after = stdout.slice(next)
    expect(after).toContain('  1. cd x\n')
    expect(after).toContain('  2. pnpm install\n')
    expect(after).toContain(
      '  4. Database & services:\n     docker compose up -d postgres valkey mailpit\n',
    )
    expect(after).toContain('     pnpm --filter @x/db db:migrate && pnpm --filter @x/db db:seed\n')
    expect(after).toContain('  5. pnpm dev\n')
    expect(after).toContain('docker compose up\n')
    expect(after.indexOf('pnpm dev')).toBeGreaterThan(after.indexOf('db:seed'))
    expect(after.indexOf('oct8-studio/kbee')).toBeGreaterThan(after.indexOf('docker compose up\n'))
    expect(stdout.match(/oct8-studio\/kbee/g)).toHaveLength(1)
    expect(stdout.trimEnd().endsWith(KBEE_TIP)).toBe(true)
    expect(stderr).not.toContain('kbee')
  }, 30_000)

  it('--verbose lists every auto-fix, as before', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'octo-human-'))
    const { stdout } = await run(tsx, [cli, ...saas, '--verbose'], { cwd })
    expect(stdout).toContain('fix: Set apiStyle of "api" to "rest"\n')
    expect(stdout).toContain('fix: Assigned port 3000 to "web"\n')
    expect(stdout).toContain('✓ x: 4 apps')
  }, 30_000)

  it('prints an absolute path for a target outside the cwd', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'octo-human-'))
    const elsewhere = join(await mkdtemp(join(tmpdir(), 'octo-human-out-')), 'y')
    const { stdout } = await run(
      tsx,
      [
        cli,
        'create',
        elsewhere,
        '--tool',
        'turbo',
        '--app',
        'backend:api:hono',
        '--no-install',
        '--no-git',
      ],
      { cwd },
    )
    expect(stdout).toContain(`\nCreated ${elsewhere}\n`)
    expect(stdout).toContain(`  1. cd ${elsewhere}\n`)
  }, 30_000)

  it('add app and add service: one ✓ line, then numbered next steps', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'octo-human-'))
    await run(tsx, [cli, ...saas, '--json'], { cwd })
    const repo = join(cwd, 'x')
    const app = await run(
      tsx,
      [cli, 'add', 'app', 'frontend', 'store', 'nuxt', '--uses', 'api', '--no-install'],
      { cwd: repo },
    )
    expect(app.stdout).toMatch(/^✓ Added frontend store \(nuxt\) · port 3002 · \d+ files\n/)
    expect(app.stdout).not.toContain('fix:')
    expect(app.stdout).toContain(
      'Next steps:\n  1. pnpm install\n  2. pnpm exec biome check --write .\n  3. pnpm dev\n',
    )
    const svc = await run(tsx, [cli, 'add', 'service', 'redis'], { cwd: repo })
    expect(svc.stdout).toMatch(/^✓ Added service redis \(Redis\) · \d+ files\n/)
    expect(svc.stdout).toContain('Next steps:\n  1. docker compose up -d redis\n')
    const again = await run(tsx, [cli, 'add', 'service', 'redis'], { cwd: repo })
    expect(again.stdout).toBe('Service "redis" is already in this repo; nothing changed\n')
  }, 60_000)

  it('Ctrl-C during a post-step prints Cancelled. and exits 0', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'octo-sigint-'))
    // A pnpm that hangs, so the CLI is mid-install when interrupted.
    await mkdir(join(cwd, 'bin'))
    await writeFile(join(cwd, 'bin/pnpm'), '#!/bin/sh\nsleep 20\n', { mode: 0o755 })
    const child = spawn(
      tsx,
      [cli, 'create', 'x', '--tool', 'turbo', '--app', 'backend:api:hono', '--no-git'],
      { cwd, env: { ...process.env, PATH: `${join(cwd, 'bin')}${delimiter}${process.env.PATH}` } },
    )
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      stdout += d
    })
    child.stderr.on('data', (d) => {
      stderr += d
    })
    // The manifest is written just before the post-steps start.
    for (let i = 0; i < 200 && !existsSync(join(cwd, 'x/.octorepo.json')); i++) {
      await new Promise((r) => setTimeout(r, 100))
    }
    await new Promise((r) => setTimeout(r, 300))
    child.kill('SIGINT')
    const code = await new Promise((r) => child.on('close', r))
    expect(code).toBe(0)
    expect(stdout.trim()).toBe('Cancelled.')
    expect(stderr).not.toMatch(/error|at /i)
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
    const head = await readFile(join(cwd, 'x/.git/HEAD'), 'utf8')
    expect(head.trim()).toBe('ref: refs/heads/main')
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

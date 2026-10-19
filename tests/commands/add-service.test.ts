import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { runAddApp } from '../../src/commands/add-app'
import { runAddService } from '../../src/commands/add-service'
import { runCreate } from '../../src/commands/create'
import { CliError, ManifestError } from '../../src/model/errors'
import type { StackConfig } from '../../src/model/stack'
import { defaultRegistry } from '../../src/plugins/registry'
import { applyPreset } from '../../src/presets'

const config: StackConfig = {
  name: 'demo',
  monorepoTool: 'turbo',
  packageManager: 'pnpm',
  apps: [
    { name: 'web', kind: 'frontend', framework: 'react-vite', uses: ['api'] },
    { name: 'api', kind: 'backend', framework: 'express' },
    { name: 'jobs', kind: 'backend', framework: 'hono' },
  ],
  services: ['postgres'],
}
const reg = defaultRegistry()
const read = (root: string, p: string) => readFile(join(root, p), 'utf8')

let root: string
beforeEach(async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'octo-svc-'))
  const r = await runCreate(
    { config, cwd, dir: 'repo', install: false, git: false, force: false, json: true, yes: true },
    reg,
  )
  root = r.root
})

describe('runAddService', () => {
  for (const service of ['redis', 'valkey', 'rabbitmq', 'mailpit', 's3']) {
    it(`adds ${service} to compose with a healthcheck and loopback ports`, async () => {
      const r = await runAddService({ cwd: root, service, json: true }, reg)
      expect(r.message).toMatch(/^Added service/)
      const doc = parse(await read(root, 'docker-compose.yml'))
      expect(doc.services[service].healthcheck.test).toBeDefined()
      for (const p of doc.services[service].ports) expect(p).toMatch(/^127\.0\.0\.1:/)
      expect(doc.services.api.depends_on[service].condition).toBe('service_healthy')
      expect(doc.services.postgres).toBeDefined()
      const manifest = JSON.parse(await read(root, '.octorepo.json'))
      expect(manifest.services).toEqual(['postgres', service])
      const agents = await read(root, 'AGENTS.md')
      expect(agents).toContain('- `postgres`: localhost:5432')
      expect(agents).toContain(`- \`${service}\`: `)
    })
  }

  it('appends the new vars to every backend .env/.env.example and keeps user lines', async () => {
    const env = join(root, 'apps/api/.env')
    const before = `${await read(root, 'apps/api/.env')}MY_SECRET=keep-me\n# note\n`
    await writeFile(env, before)
    const exampleBefore = await read(root, 'apps/jobs/.env.example')
    const appBefore = await read(root, 'apps/api/src/app.ts')
    const r = await runAddService({ cwd: root, service: 's3', json: true }, reg)
    const after = await read(root, 'apps/api/.env')
    expect(after.startsWith(before)).toBe(true)
    expect(after).toContain('S3_ENDPOINT=http://localhost:8333\n')
    expect(after).toContain('S3_BUCKET=demo-files\n')
    const example = await read(root, 'apps/jobs/.env.example')
    expect(example.startsWith(exampleBefore)).toBe(true)
    expect(example).toContain('S3_SECRET_ACCESS_KEY=')
    expect(r.written).toEqual(
      expect.arrayContaining([env, join(root, 'apps/jobs/.env.example')].map(String)),
    )
    expect(await read(root, 'apps/api/src/app.ts')).toBe(appBefore)
    // Frontends get no service env.
    expect(r.written.some((p) => /apps\/web\/\.env/.test(p))).toBe(false)
    expect(await read(root, '.env.example')).toContain('S3_ENDPOINT=http://localhost:8333')
    // The tool-owned startup env check now requires the new vars.
    expect(await read(root, 'apps/api/src/generated/env.ts')).toContain('S3_BUCKET: z.string()')
  })

  it('does not duplicate a var the user already set', async () => {
    const env = join(root, 'apps/api/.env')
    await writeFile(env, `${await read(root, 'apps/api/.env')}SMTP_URL=smtp://example:25\n`)
    await runAddService({ cwd: root, service: 'mailpit', json: true }, reg)
    const after = await read(root, 'apps/api/.env')
    expect(after.match(/^SMTP_URL=/gm)).toHaveLength(1)
    expect(after).toContain('SMTP_URL=smtp://example:25')
  })

  it('a service already present is a no-op that rewrites nothing', async () => {
    const compose = await read(root, 'docker-compose.yml')
    await writeFile(join(root, 'docker-compose.yml'), `${compose}# user edit\n`)
    const r = await runAddService({ cwd: root, service: 'postgres', json: true }, reg)
    expect(r).toEqual({
      written: [],
      warnings: [],
      fixes: [],
      message: 'Service "postgres" is already in this repo; nothing changed',
    })
    expect(await read(root, 'docker-compose.yml')).toBe(`${compose}# user edit\n`)

    await runAddService({ cwd: root, service: 'valkey', json: true }, reg)
    const again = await runAddService({ cwd: root, service: 'valkey', json: true }, reg)
    expect(again.written).toEqual([])
  })

  it('refuses an unknown service and writes nothing', async () => {
    const manifest = await read(root, '.octorepo.json')
    await expect(runAddService({ cwd: root, service: 'kafka', json: true }, reg)).rejects.toThrow(
      CliError,
    )
    await expect(runAddService({ cwd: root, service: 'kafka', json: true }, reg)).rejects.toThrow(
      /Unknown service "kafka"/,
    )
    expect(await read(root, '.octorepo.json')).toBe(manifest)
  })

  it('patches root ignore files of an older repo (append-only) and leaves current ones alone', async () => {
    const before = await read(root, '.gitignore')
    const fresh = await runAddService({ cwd: root, service: 'mailpit', json: true }, reg)
    expect(await read(root, '.gitignore')).toBe(before)
    expect(fresh.written).not.toContain(join(root, '.gitignore'))

    const old = 'node_modules\ndist\n.env\nmy-local-dir\n'
    await writeFile(join(root, '.gitignore'), old)
    const r = await runAddService({ cwd: root, service: 'valkey', json: true }, reg)
    const gi = await read(root, '.gitignore')
    expect(gi.startsWith(old)).toBe(true)
    expect(gi.split('\n')).toEqual(expect.arrayContaining(['.turbo', '.nuxt', '.output']))
    expect(r.written).toContain(join(root, '.gitignore'))
  })

  it('keeps the preset in the manifest (create --preset saas, then add service and add app)', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'octo-svc-preset-'))
    const created = await runCreate(
      {
        config: applyPreset<StackConfig>('saas', {
          name: 'demo',
          monorepoTool: 'turbo',
          packageManager: 'pnpm',
          apps: [],
          services: [],
        }),
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
    await runAddService({ cwd: created.root, service: 'rabbitmq', json: true }, reg)
    expect(JSON.parse(await read(created.root, '.octorepo.json')).preset).toBe('saas')
    await runAddApp(
      { cwd: created.root, json: true, app: { name: 'jobs2', kind: 'backend', framework: 'hono' } },
      reg,
    )
    const m = JSON.parse(await read(created.root, '.octorepo.json'))
    expect(m.preset).toBe('saas')
    expect(m.services).toEqual(expect.arrayContaining(['rabbitmq', 'mailpit']))
  })

  it('AGENTS.md lists service UIs and dev credentials', async () => {
    await runAddService({ cwd: root, service: 'rabbitmq', json: true }, reg)
    await runAddService({ cwd: root, service: 'mailpit', json: true }, reg)
    await runAddService({ cwd: root, service: 's3', json: true }, reg)
    const agents = await read(root, 'AGENTS.md')
    expect(agents).toContain('http://localhost:15672 (login `app`/`app`)')
    expect(agents).toContain('http://localhost:8025')
    expect(agents).toContain('`octorepo-local-secret`')
    expect(agents).toContain('bucket `demo-files`')
  })

  it('refuses outside a generated repo', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'octo-svc-empty-'))
    await expect(runAddService({ cwd: empty, service: 'redis', json: true }, reg)).rejects.toThrow(
      ManifestError,
    )
  })
})

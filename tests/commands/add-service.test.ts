import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { runAddService } from '../../src/commands/add-service'
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
      expect(await read(root, 'AGENTS.md')).toContain(`postgres, ${service}`)
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

  it('refuses outside a generated repo', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'octo-svc-empty-'))
    await expect(runAddService({ cwd: empty, service: 'redis', json: true }, reg)).rejects.toThrow(
      ManifestError,
    )
  })
})

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { expressPlugin } from '../../src/plugins/backend/express'
import { fastifyPlugin } from '../../src/plugins/backend/fastify'
import { honoPlugin } from '../../src/plugins/backend/hono'
import { koaPlugin } from '../../src/plugins/backend/koa'
import { nestPlugin } from '../../src/plugins/backend/nest'
import type { AppContext } from '../../src/plugins/types'
import { VERSIONS } from '../../src/versions'

const ctx = (
  framework: string,
  services: string[] = [],
  orm?: 'drizzle' | 'prisma',
  serviceEnv?: string[],
): AppContext => ({
  stack: {
    name: 'acme',
    monorepoTool: 'turbo',
    packageManager: 'pnpm',
    apps: [],
    services,
    ...(orm ? { orm } : {}),
  },
  scope: '@acme',
  versions: VERSIONS,
  app: { name: 'api', kind: 'backend', framework, port: 4000 },
  backends: [],
  ...(serviceEnv ? { serviceEnv } : {}),
})

const plugins = [expressPlugin, fastifyPlugin, honoPlugin, koaPlugin, nestPlugin]

describe.each(plugins.map((p) => ({ id: p.id, plugin: p })))('$id env validation', ({ plugin }) => {
  const imp = plugin.id === 'nest' ? "from './generated/env'" : "from './generated/env.js'"

  it('generates src/generated/env.ts with optional PORT and CORS_ORIGINS only for a bare stack', () => {
    const env = plugin.generate(ctx(plugin.id))['apps/api/src/generated/env.ts'] as string
    expect(env).toContain('PORT: z.coerce.number().int().positive().default(4000)')
    expect(env).toContain('CORS_ORIGINS: z.string().optional()')
    expect(env).not.toContain('z.string().min(1)')
    expect(env).toContain('Missing environment variable')
  })

  it('requires the vars of every service present', () => {
    const tree = plugin.generate(
      ctx(plugin.id, ['valkey', 'rabbitmq'], undefined, ['VALKEY_URL', 'RABBITMQ_URL']),
    )
    const env = tree['apps/api/src/generated/env.ts'] as string
    expect(env).toContain('VALKEY_URL: z.string().min(1)')
    expect(env).toContain('RABBITMQ_URL: z.string().min(1)')
  })

  it('requires DATABASE_URL when an ORM is set', () => {
    const env = plugin.generate(ctx(plugin.id, ['postgres'], 'drizzle', ['DATABASE_URL']))[
      'apps/api/src/generated/env.ts'
    ] as string
    expect(env).toContain('DATABASE_URL: z.string().min(1)')
  })

  it('main.ts validates through loadEnv and depends on zod', () => {
    const tree = plugin.generate(ctx(plugin.id))
    const main = tree['apps/api/src/main.ts'] as string
    expect(main).toContain(`import { loadEnv } ${imp}`)
    expect(main).toContain('loadEnv()')
    expect(main).not.toContain('process.env.PORT')
    expect(JSON.parse(tree['apps/api/package.json'] as string).dependencies.zod).toBe(VERSIONS.zod)
  })
})

describe('generated loadEnv at runtime', () => {
  const root = mkdtempSync(join(process.cwd(), 'tests', '.env-run-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('exits 1 with the exact message and no stack trace when a var is missing', () => {
    const src = expressPlugin.generate(ctx('express', ['postgres'], undefined, ['DATABASE_URL']))
    mkdirSync(join(root, 'cwd'))
    writeFileSync(join(root, 'env.ts'), src['apps/api/src/generated/env.ts'] as string)
    writeFileSync(
      join(root, 'run.ts'),
      "import { loadEnv } from './env'\nconsole.log(loadEnv().PORT)\n",
    )
    const env = { ...process.env }
    delete env.DATABASE_URL
    const run = (e: NodeJS.ProcessEnv) =>
      spawnSync(join(process.cwd(), 'node_modules/.bin/tsx'), [join(root, 'run.ts')], {
        cwd: join(root, 'cwd'),
        env: e,
        encoding: 'utf8',
      })
    const bad = run(env)
    expect(bad.status).toBe(1)
    expect(bad.stderr).toBe('Missing environment variable DATABASE_URL (see .env.example)\n')
    const ok = run({ ...env, DATABASE_URL: 'postgres://x' })
    expect(ok.status).toBe(0)
    expect(ok.stdout.trim()).toBe('4000')
  })
})

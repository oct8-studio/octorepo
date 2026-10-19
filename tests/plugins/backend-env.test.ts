import { describe, expect, it } from 'vitest'
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
})

const plugins = [expressPlugin, fastifyPlugin, honoPlugin, koaPlugin, nestPlugin]

describe.each(plugins.map((p) => ({ id: p.id, plugin: p })))('$id env validation', ({ plugin }) => {
  const imp = plugin.id === 'nest' ? "from './env'" : "from './env.js'"

  it('generates src/env.ts with optional PORT and CORS_ORIGINS only for a bare stack', () => {
    const env = plugin.generate(ctx(plugin.id))['apps/api/src/env.ts'] as string
    expect(env).toContain('PORT: z.coerce.number().int().positive().default(4000)')
    expect(env).toContain('CORS_ORIGINS: z.string().optional()')
    expect(env).not.toContain('z.string().min(1)')
    expect(env).toContain('Missing environment variable')
  })

  it('requires the vars of every service present', () => {
    const tree = plugin.generate(ctx(plugin.id, ['postgres', 'redis']))
    const env = tree['apps/api/src/env.ts'] as string
    expect(env).toContain('DATABASE_URL: z.string().min(1)')
    expect(env).toContain('REDIS_URL: z.string().min(1)')
  })

  it('requires DATABASE_URL when an ORM is set', () => {
    const env = plugin.generate(ctx(plugin.id, ['postgres'], 'drizzle'))[
      'apps/api/src/env.ts'
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

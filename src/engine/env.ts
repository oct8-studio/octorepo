import { postgresPlugin } from '../plugins/service/postgres'
import { redisPlugin } from '../plugins/service/redis'
import type { AppContext, ServicePlugin } from '../plugins/types'

// Imported directly (not via the registry, which imports the backend plugins that call this).
const SERVICES: Record<string, ServicePlugin> = {
  postgres: postgresPlugin,
  redis: redisPlugin,
}

/** Env vars a backend of this stack needs at startup: its services' vars, plus DATABASE_URL for an ORM. */
export function requiredEnv(ctx: AppContext, host?: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const id of ctx.stack.services) Object.assign(out, SERVICES[id]?.env(ctx, host))
  if (ctx.stack.orm) Object.assign(out, postgresPlugin.env(ctx, host))
  return out
}

/**
 * Backend `src/env.ts`: a zod schema of PORT, CORS_ORIGINS (both optional) and the required
 * service vars, plus `loadEnv()`, which main.ts calls first. A missing or invalid variable
 * prints a one-line message naming it and exits 1 (no stack trace).
 */
export function backendEnv(ctx: AppContext): { file: string } {
  const required = requiredEnv(ctx)
  const vars = Object.keys(required)
  const fields = [
    `  PORT: z.coerce.number().int().positive().default(${ctx.app.port}),`,
    '  CORS_ORIGINS: z.string().optional(),',
    ...vars.map((k) => `  ${k}: z.string().min(1),`),
  ]
  const file = `import { z } from 'zod'

const schema = z.object({
${fields.join('\n')}
})

export type Env = z.infer<typeof schema>

/** Loads this app's .env if present (variables already set in the environment win), then validates. */
export function loadEnv(): Env {
  try {
    process.loadEnvFile()
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  const result = schema.safeParse(process.env)
  if (result.success) return result.data
  for (const issue of result.error.issues) {
    const name = String(issue.path[0])
    if (process.env[name]) console.error(\`Invalid environment variable \${name}: \${issue.message}\`)
    else console.error(\`Missing environment variable \${name} (see .env.example)\`)
  }
  process.exit(1)
}
`
  return { file }
}

import type { AppContext } from '../plugins/types'

/**
 * Backend `src/generated/env.ts` (tool-owned, so `add` refreshes it when services change): a zod
 * schema of PORT, CORS_ORIGINS (both optional) and the required vars in `ctx.serviceEnv`
 * (computed from the registry), plus `loadEnv()`, which main.ts calls first. A missing or invalid
 * variable prints a one-line message naming it and exits 1 (no stack trace).
 */
export function backendEnv(ctx: AppContext): { file: string } {
  const vars = ctx.serviceEnv ?? []
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

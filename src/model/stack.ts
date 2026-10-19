import { z } from 'zod'
import { CliError, ManifestError } from './errors'

export type MonorepoTool = 'turbo' | 'nx'
export type AppKind = 'frontend' | 'backend'
export type OrmId = 'drizzle' | 'prisma'

export interface AppSpec {
  name: string
  kind: AppKind
  framework: string
  apiStyle?: string
  uses?: string[]
  port?: number
}

export interface StackConfig {
  name: string
  monorepoTool: MonorepoTool
  packageManager: 'pnpm'
  apps: AppSpec[]
  services: string[]
  /** One ORM per stack; generates the shared `packages/db` and needs the postgres service. */
  orm?: OrmId
  /** Preset the stack started from (informational; the apps are already expanded). */
  preset?: string
}

export interface Manifest extends StackConfig {
  schemaVersion: 1
  cliVersion: string
}

export const AppSpecSchema = z
  .object({
    name: z.string().min(1),
    kind: z.enum(['frontend', 'backend']),
    framework: z.string().min(1),
    apiStyle: z.string().optional(),
    uses: z.array(z.string()).optional(),
    port: z.number().int().positive().optional(),
  })
  .transform((app) => (app.kind === 'frontend' ? { ...app, uses: app.uses ?? [] } : app))

export const StackConfigSchema = z.object({
  name: z.string().min(1),
  monorepoTool: z.enum(['turbo', 'nx']),
  packageManager: z.literal('pnpm').default('pnpm'),
  apps: z.array(AppSpecSchema),
  services: z.array(z.string()).default([]),
  orm: z.enum(['drizzle', 'prisma']).optional(),
  preset: z.string().optional(),
})

export const ManifestSchema = StackConfigSchema.extend({
  schemaVersion: z.literal(1),
  cliVersion: z.string().min(1),
})

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`)
    .join('\n')
}

export function parseStackConfig(input: unknown): StackConfig {
  const result = StackConfigSchema.safeParse(input)
  if (!result.success) throw new CliError(formatIssues(result.error))
  return result.data
}

export function parseManifest(input: unknown): Manifest {
  if (typeof input === 'object' && input !== null && 'schemaVersion' in input) {
    const v = (input as { schemaVersion: unknown }).schemaVersion
    if (v !== 1) {
      throw new ManifestError(
        'unsupported-schema',
        `Unsupported manifest schemaVersion: ${String(v)}`,
      )
    }
  }
  const result = ManifestSchema.safeParse(input)
  if (!result.success) throw new ManifestError('invalid', formatIssues(result.error))
  return result.data
}

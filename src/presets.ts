import { CliError } from './model/errors'
import type { AppSpec, OrmId, StackConfig } from './model/stack'

export interface Preset {
  id: string
  description: string
  apps: AppSpec[]
  services: string[]
  orm?: OrmId
}

/** Ready-made stacks: `--preset <id>`, the first interactive question, and MCP `create`. */
export const PRESETS: readonly Preset[] = [
  {
    id: 'saas',
    description:
      'Next.js web + React admin on a NestJS API, Fastify worker; postgres, valkey, mailpit; Drizzle',
    apps: [
      { name: 'web', kind: 'frontend', framework: 'next', uses: ['api'] },
      { name: 'admin', kind: 'frontend', framework: 'react-vite', uses: ['api'] },
      { name: 'api', kind: 'backend', framework: 'nest' },
      { name: 'worker', kind: 'backend', framework: 'fastify' },
    ],
    services: ['postgres', 'valkey', 'mailpit'],
    orm: 'drizzle',
  },
  {
    id: 'api-platform',
    description:
      'Hono gateway, NestJS users, Fastify billing, Astro docs; postgres, rabbitmq; Prisma',
    apps: [
      { name: 'gateway', kind: 'backend', framework: 'hono' },
      { name: 'users', kind: 'backend', framework: 'nest' },
      { name: 'billing', kind: 'backend', framework: 'fastify' },
      { name: 'docs', kind: 'frontend', framework: 'astro', uses: ['gateway'] },
    ],
    services: ['postgres', 'rabbitmq'],
    orm: 'prisma',
  },
]

export function findPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id)
}

/**
 * Merges a preset into a (partial) stack: preset apps first, the caller's extra apps appended,
 * services unioned, `orm` kept if the caller set one. A caller app reusing a preset app name is
 * rejected here, with a clearer message than the generic duplicate-name rule.
 */
export function applyPreset<T extends Pick<StackConfig, 'apps' | 'services' | 'orm'>>(
  id: string,
  base: T,
): T & { preset: string } {
  const preset = findPreset(id)
  if (!preset) {
    throw new CliError(`Unknown preset "${id}". Available: ${PRESETS.map((p) => p.id).join(', ')}`)
  }
  const taken = new Set(preset.apps.map((a) => a.name))
  for (const app of base.apps) {
    if (taken.has(app.name)) {
      throw new CliError(`App "${app.name}" collides with preset "${id}" (it already defines it)`)
    }
  }
  const orm = base.orm ?? preset.orm
  return {
    ...base,
    preset: id,
    apps: [...structuredClone(preset.apps), ...base.apps],
    services: [...new Set([...preset.services, ...base.services])],
    ...(orm ? { orm } : {}),
  }
}

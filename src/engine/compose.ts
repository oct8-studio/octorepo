import { stringify } from 'yaml'
import { CliError } from '../model/errors'
import type { AppSpec, StackConfig } from '../model/stack'
import type { Registry } from '../plugins/registry'
import type { FileTree, ProjectContext, ServicePlugin } from '../plugins/types'
import { upperSnake } from './names'

/** Compose service of the ORM's one-shot migrate + seed job. */
export const MIGRATE = 'migrate'

const HEADER = `# Managed by octorepo: regenerated when you add apps or services.
# Put local changes in docker-compose.override.yml (merged automatically by docker compose).
`

function port(app: AppSpec): number {
  if (app.port === undefined)
    throw new CliError(`App "${app.name}" has no port; validate the stack first`)
  return app.port
}

/** Comma-separated browser origins of every frontend, e.g. `http://localhost:3000`. */
export function corsOrigins(stack: StackConfig): string {
  return stack.apps
    .filter((a) => a.kind === 'frontend')
    .map((a) => `http://localhost:${port(a)}`)
    .join(',')
}

function services(ctx: ProjectContext, reg: Registry): ServicePlugin[] {
  return ctx.stack.services.map((id) => {
    const s = reg.service(id)
    if (!s) throw new CliError(`Unknown service "${id}"`)
    return s
  })
}

/** Env vars every backend gets from the selected services; `host` overrides the service hostname. */
export function serviceEnv(
  ctx: ProjectContext,
  reg: Registry,
  host?: string,
): Record<string, string> {
  return Object.assign({}, ...services(ctx, reg).map((s) => s.env(ctx, host)))
}

/** `docker-compose.yml` (apps + services) and the root `.env.example`. Expects a validated stack. */
export function composeFiles(ctx: ProjectContext, reg: Registry): FileTree {
  const { stack } = ctx
  const svc = services(ctx, reg)
  const cors = corsOrigins(stack)
  const out: Record<string, unknown> = {}

  for (const app of stack.apps) {
    const p = port(app)
    const plugin = reg.framework(app.framework, app.kind)
    const entry: Record<string, unknown> = {
      build: { context: '.', dockerfile: `apps/${app.name}/Dockerfile` },
      // Loopback only: the dev stack is for this machine, not the network.
      ports: [`127.0.0.1:${p}:${p}`],
    }
    if (app.kind === 'backend') {
      entry.environment = { PORT: String(p), CORS_ORIGINS: cors, ...serviceEnv(ctx, reg) }
      const deps: Record<string, { condition: string }> = Object.fromEntries(
        svc.map((s) => [s.id, { condition: 'service_healthy' }]),
      )
      // Migrations and the seed finish before any backend starts.
      if (stack.orm) deps[MIGRATE] = { condition: 'service_completed_successfully' }
      if (Object.keys(deps).length > 0) entry.depends_on = deps
    } else {
      const backends = stack.apps.filter((b) => app.uses?.includes(b.name))
      // SPAs bake backend URLs into the bundle at build time (Dockerfile ARGs); SSR apps read them at runtime.
      if (plugin?.rendering === 'ssr') {
        entry.environment = {
          PORT: String(p),
          ...Object.fromEntries(
            backends.map((b) => [`${upperSnake(b.name)}_URL`, `http://${b.name}:${port(b)}`]),
          ),
        }
      }
      if (backends.length > 0) {
        entry.depends_on = Object.fromEntries(
          backends.map((b) => [b.name, { condition: 'service_started' }]),
        )
      }
    }
    out[app.name] = entry
  }

  if (stack.orm) {
    const postgres = reg.service('postgres')
    if (!postgres)
      throw new CliError('The ORM needs the postgres service; validate the stack first')
    // One-shot (compose's default restart policy is "no"): migrates, seeds, exits 0.
    out[MIGRATE] = {
      build: { context: '.', dockerfile: 'packages/db/Dockerfile' },
      environment: postgres.env(ctx),
      depends_on: { postgres: { condition: 'service_healthy' } },
    }
  }

  const volumes: Record<string, Record<string, never>> = {}
  for (const s of svc) {
    const c = s.compose(ctx)
    out[s.id] = { ...c, restart: 'unless-stopped' }
    for (const v of c.volumes ?? []) {
      const name = v.split(':')[0] as string
      if (!name.startsWith('.') && !name.startsWith('/')) volumes[name] = {}
    }
  }

  const doc: Record<string, unknown> = { services: out }
  if (Object.keys(volumes).length > 0) doc.volumes = volumes

  const envLines = [
    '# Managed by octorepo. Local-development defaults: services are exposed on localhost by docker compose.',
    `CORS_ORIGINS=${cors}`,
    ...Object.entries(serviceEnv(ctx, reg, 'localhost')).map(([k, v]) => `${k}=${v}`),
  ]

  return {
    'docker-compose.yml': HEADER + stringify(doc),
    '.env.example': `${envLines.join('\n')}\n`,
  }
}

import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { StackConfig } from '../model/stack'

export const AGENTS_FILE = 'AGENTS.md'
export const AGENTS_BEGIN = '<!-- octorepo:begin -->'
export const AGENTS_END = '<!-- octorepo:end -->'

/** Pointer to oct8 studio's cross-repo KB skills; no KB is generated (kbee needs cited facts + approval). */
export function kbeeHint(): string {
  return "This repo's structure is in `.octorepo.json`. For cross-repo knowledge with cited facts, run `npx skills add oct8-studio/kbee`, then ask your agent to run kbee-init and treat each package as its own entry."
}

export interface LocalStep {
  cmd: string
  note: string
}

/**
 * How to bring up the stack's compose services and database: services in docker for
 * `pnpm dev`, migrate + seed when there's an ORM, or the whole stack in compose. Empty when
 * the stack has neither services nor an ORM. Shared by README, AGENTS.md and create's next steps.
 */
export function databaseSteps(stack: Pick<StackConfig, 'name' | 'services' | 'orm'>): LocalStep[] {
  if (!stack.services.length && !stack.orm) return []
  const services =
    stack.orm && !stack.services.includes('postgres')
      ? [...stack.services, 'postgres']
      : stack.services
  const db = `pnpm --filter @${stack.name}/db`
  return [
    {
      cmd: `docker compose up -d ${services.join(' ')}`,
      note: 'start the services for local development with `pnpm dev`',
    },
    ...(stack.orm
      ? [
          {
            cmd: `${db} db:migrate && ${db} db:seed`,
            note: 'apply migrations and seed the database',
          },
        ]
      : []),
    {
      cmd: 'docker compose up',
      note: `or run the full stack in containers${stack.orm ? ' (migrate runs automatically)' : ''}`,
    },
  ]
}

/** `databaseSteps` as a markdown section (heading level `#` × `level`), or '' when empty. */
export function databaseSection(
  stack: Pick<StackConfig, 'name' | 'services' | 'orm'>,
  level: number,
): string {
  const steps = databaseSteps(stack)
  if (!steps.length) return ''
  return `
${'#'.repeat(level)} Database & services

${steps.map((s) => `- \`${s.cmd}\`: ${s.note}`).join('\n')}
`
}

export const CLAUDE_FILE = 'CLAUDE.md'
export const CLAUDE_CONTENT = '@AGENTS.md\n'

/** Where each service listens on localhost (docker compose), its UI and its dev-only credentials. */
const SERVICE_NOTES: Record<string, (stack: StackConfig) => string> = {
  postgres: (s) =>
    `localhost:5432, user/password \`postgres\`/\`postgres\`, database \`${s.name}\``,
  redis: () => 'localhost:6379, no auth',
  valkey: () => 'localhost:6380 (container port 6379), no auth',
  rabbitmq: () => 'AMQP localhost:5672; management UI http://localhost:15672 (login `app`/`app`)',
  mailpit: () => 'SMTP localhost:1025 (no auth); inbox UI http://localhost:8025',
  s3: (s) =>
    `S3 API http://localhost:8333 (SeaweedFS), access key \`octorepo\` / secret \`octorepo-local-secret\`, bucket \`${s.name.slice(0, 57)}-files\` (created on first upload)`,
}

/** The octorepo-owned AGENTS.md section, markers included. Always ends with a newline. */
export function agentsSection(stack: StackConfig): string {
  const scope = `@${stack.name}`
  const apps = stack.apps.map(
    (a) =>
      `| ${a.name} | ${a.kind} | ${a.framework} | ${a.port ?? '-'} | ${a.uses?.length ? a.uses.join(', ') : '-'} |`,
  )
  const clients = stack.apps
    .filter((a) => a.kind === 'backend')
    .map(
      (a) =>
        `- \`packages/${a.name}-client\` (\`${scope}/${a.name}-client\`): generated typed client for ${a.name}`,
    )
  const filters = stack.apps.map((a) => `pnpm --filter ${scope}/${a.name} dev`)
  const orm = stack.orm
  const db = orm
    ? [
        `- \`packages/db\` (\`${scope}/db\`): ${orm} schema and client shared by the backends${orm === 'prisma' ? '; `packages/db/src/generated/**` (Prisma Client) is tool-owned' : ''}`,
      ]
    : []
  const dbScripts = orm
    ? `
Database (\`pnpm --filter ${scope}/db <script>\`; compose runs migrate + seed in a one-shot \`migrate\` service):

- \`db:migration\`: create a migration from schema changes (commit it)
- \`db:migrate\`: apply committed migrations
- \`db:seed\`: insert the sample greeting (idempotent)
- \`db:generate\`: ${orm === 'prisma' ? 'regenerate the Prisma Client (the build also runs it)' : 'drizzle-kit generate (same as db:migration)'}
`
    : ''
  const services = stack.services.length
    ? `
### Services (docker compose)

Dev-only credentials; backends get the connection URLs from their \`.env\`.

${stack.services.map((id) => `- \`${id}\`${SERVICE_NOTES[id] ? `: ${SERVICE_NOTES[id](stack)}` : ''}`).join('\n')}
`
    : ''
  return `${AGENTS_BEGIN}
## Repo layout (managed by octorepo)

This section is rewritten by \`npx @oct8/octorepo add app|service\`; edit outside the markers.

### Apps

| App | Kind | Framework | Port | Uses |
| --- | --- | --- | --- | --- |
${apps.join('\n')}

### Packages

- \`packages/config\` (\`${scope}/config\`): shared tsconfigs
- \`packages/types\` (\`${scope}/types\`): shared zod schemas and types
${[...clients, ...db].join('\n')}
${services}
### Commands

\`\`\`sh
pnpm dev
pnpm build
pnpm test
pnpm lint
pnpm typecheck
${filters.join('\n')}
\`\`\`
${dbScripts}${databaseSection(stack, 3)}
### Adding things

- \`npx @oct8/octorepo add app <frontend|backend> <name> <framework>\`
- \`npx @oct8/octorepo add service <name>\`

### Conventions

- Tool-owned, regenerated by octorepo: \`.octorepo.json\`, \`docker-compose.yml\`, \`.env.example\`, \`packages/*-client/**\`, \`apps/*/src/generated/**\`${orm === 'prisma' ? ', `packages/db/src/generated/**`' : ''}. Don't hand-edit them.
- Env: each app reads its own \`.env\` (a gitignored copy of its \`.env.example\`); the root \`.env.example\` feeds docker compose.

### Cross-repo knowledge

${kbeeHint()}
${AGENTS_END}
`
}

/** Replaces the marked section in `existing` (all other bytes kept); appends it when markers are missing. */
export function applyAgentsSection(existing: string | null, section: string): string {
  if (existing === null) return `# AGENTS.md\n\n${section}`
  const start = existing.indexOf(AGENTS_BEGIN)
  const endAt = start === -1 ? -1 : existing.indexOf(AGENTS_END, start)
  if (start === -1 || endAt === -1) {
    const sep =
      existing === '' || existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n'
    return `${existing}${sep}${section}`
  }
  const end = endAt + AGENTS_END.length
  // Every byte after the end marker is kept as-is, including a missing final newline.
  return `${existing.slice(0, start)}${section.slice(0, -1)}${existing.slice(end)}`
}

/**
 * Rewrites only the octorepo section of `<root>/AGENTS.md` (creating the file if needed), and
 * creates `CLAUDE.md` for repos from versions that predate it (never rewritten). Used by
 * `add app|service`. Returns the written paths.
 */
export async function refreshAgentsSection(root: string, stack: StackConfig): Promise<string[]> {
  const path = join(root, AGENTS_FILE)
  let existing: string | null = null
  try {
    existing = await readFile(path, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  await writeFile(path, applyAgentsSection(existing, agentsSection(stack)))
  const written = [path]
  const claude = join(root, CLAUDE_FILE)
  if (!existsSync(claude)) {
    await writeFile(claude, CLAUDE_CONTENT)
    written.push(claude)
  }
  return written
}

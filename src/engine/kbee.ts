import type { StackConfig } from '../model/stack'
import { KBEE_RULES_VERSION, KBEE_SKILLS_CLI } from '../versions'
import { type FileTree, json } from './tree'

/**
 * kbee (github.com/oct8-studio/kbee) keeps a cited knowledge base in `kb/` at the git root.
 * octorepo owns only the `repos` entries of `kb/manifest.json` (it knows the repo map); every
 * fact file is written and verified by kbee's own agent, never by octorepo.
 */
export const KBEE_DIR = 'kb'
export const KBEE_MANIFEST = `${KBEE_DIR}/manifest.json`

/** Project-local install of the kbee skills for Claude Code and Codex (real copies, no symlinks). */
export const KBEE_SKILLS_ARGS = [
  '-y',
  KBEE_SKILLS_CLI,
  'add',
  'oct8-studio/kbee',
  '-a',
  'claude-code',
  'codex',
  '-y',
  '--copy',
]
export const KBEE_SKILLS_INSTALL = `npx ${KBEE_SKILLS_ARGS.join(' ')}`

export interface KbeeRepo {
  name: string
  defaultBranch: string
  pathHint: string
  syncedSha: string | null
  syncedAt: string | null
}

export interface KbeeManifest {
  kbeeVersion: 1
  mode: 'direct' | 'pr'
  location: 'in-repo'
  rulesVersion: number
  repos: KbeeRepo[]
  [key: string]: unknown
}

const entry = (name: string, path: string, defaultBranch = 'main'): KbeeRepo => ({
  name,
  defaultBranch,
  pathHint: `../${path}`,
  syncedSha: null,
  syncedAt: null,
})

/**
 * One manifest entry per app and shared package kbee should know, producers before consumers (the
 * order kbee plans changes in, per kbee's docs/kb-format.md "Pre-filling a KB from a scaffolder"):
 * `types`, `db` when there's an ORM, the backends, then the frontends. Generated clients and
 * services are left out (clients are derived from the backends' openapi.json).
 */
export function kbeeRepos(
  stack: Pick<StackConfig, 'apps' | 'orm'>,
  defaultBranch = 'main',
): KbeeRepo[] {
  const apps = [
    ...stack.apps.filter((a) => a.kind === 'backend'),
    ...stack.apps.filter((a) => a.kind === 'frontend'),
  ]
  return [
    entry('types', 'packages/types', defaultBranch),
    ...(stack.orm ? [entry('db', 'packages/db', defaultBranch)] : []),
    ...apps.map((a) => entry(a.name, `apps/${a.name}`, defaultBranch)),
  ]
}

export function kbeeManifest(stack: Pick<StackConfig, 'apps' | 'orm'>): KbeeManifest {
  return {
    kbeeVersion: 1,
    mode: 'direct',
    location: 'in-repo',
    rulesVersion: KBEE_RULES_VERSION,
    repos: kbeeRepos(stack),
  }
}

/** The starting `kb/`: only the manifest, kbee's local-override ignore and the features folder. */
export function kbeeFiles(stack: StackConfig): FileTree {
  if (!stack.kbee) return {}
  return {
    [KBEE_MANIFEST]: json(kbeeManifest(stack)),
    [`${KBEE_DIR}/.gitignore`]: '.kbee.local.json\n',
    [`${KBEE_DIR}/features/.gitkeep`]: '',
  }
}

/**
 * Contracts octorepo knows the stack has, as hints for kbee's agent to verify and document.
 * Not facts: kbee writes `kb/contracts/` itself, with citations.
 */
export function kbeeContractHints(stack: Pick<StackConfig, 'apps' | 'orm'>): string[] {
  const backends = stack.apps.filter((a) => a.kind === 'backend')
  const hints = stack.apps
    .filter((a) => a.kind === 'frontend')
    .flatMap((fe) =>
      backends
        .filter((b) => fe.uses?.includes(b.name))
        .map(
          (b) =>
            `- ${fe.name} → ${b.name}: HTTP API produced by \`apps/${b.name}\` (\`apps/${b.name}/openapi.json\`), consumed through \`packages/${b.name}-client\``,
        ),
    )
  if (stack.orm) {
    hints.push(
      `- ${backends.map((b) => b.name).join(', ')} → db: tables and client in \`packages/db\` (${stack.orm})`,
    )
  }
  hints.push('- types: shared zod schemas in `packages/types`')
  return hints
}

/** AGENTS.md block when kbee is on: kbee's pointer (found by its `find`) plus the contract hints. */
export function kbeeAgentsBlock(stack: Pick<StackConfig, 'apps' | 'orm'>): string {
  return `This repo keeps an in-repo [kbee](https://github.com/oct8-studio/kbee) knowledge base in \`kb/\`; the kbee skills are in \`.agents/skills\` and \`.claude/skills\`.

<!-- kbee:start -->
kbee-kb-path: ${KBEE_DIR}

Before you change anything that crosses package boundaries (APIs, shared types, the database), read \`${KBEE_DIR}/README.md\` and the relevant files in \`${KBEE_DIR}/contracts/\`. Follow the rules in that README when you update the knowledge base.
<!-- kbee:end -->

To build the knowledge base, commit the repo, then run \`/kbee init\` in Claude Code or Codex (kbee versions before skeleton support: \`/kbee audit\`). Contracts to document (from the stack; kbee verifies and cites them):

${kbeeContractHints(stack).join('\n')}
`
}

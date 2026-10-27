import { basename, resolve } from 'node:path'
import { databaseSteps } from '../engine/agents'
import { generateProject } from '../engine/generate'
import { writeTree } from '../engine/write'
import { CliError } from '../model/errors'
import type { StackConfig } from '../model/stack'
import type { Registry } from '../plugins/registry'
import { type Issue, validateStack } from '../rules'
import { runPostSteps } from './post'
import { promptForStack } from './prompts'

export interface CreateOptions {
  config?: StackConfig
  cwd: string
  dir?: string
  install: boolean
  git: boolean
  /** Interactive only: `--kbee` was passed, so the kbee question is skipped (answered yes). */
  kbee?: boolean
  force: boolean
  json: boolean
  yes: boolean
}

export interface CreateResult {
  root: string
  warnings: Issue[]
  fixes: Issue[]
  manual: string[]
}

/** validate → generate → write → post-steps. Nothing is written if the stack has errors. */
export async function runCreate(opts: CreateOptions, reg: Registry): Promise<CreateResult> {
  const defaultName = opts.dir ? basename(resolve(opts.cwd, opts.dir)) : undefined
  const config =
    opts.config ?? (await promptForStack(reg, { defaultName, kbee: opts.kbee, git: opts.git }))
  const { stack, errors, warnings, fixes } = validateStack(config, reg)
  if (errors.length) {
    throw new CliError(`Invalid stack:\n${errors.map((e) => `  - ${e.message}`).join('\n')}`)
  }
  if (stack.kbee && !opts.git) {
    throw new CliError(
      "kbee needs git: its in-repo knowledge base cites the repo's own history. Drop --no-git or --kbee.",
    )
  }
  const root = resolve(opts.cwd, opts.dir ?? stack.name)
  await writeTree(root, generateProject(stack, reg), { mode: 'create', force: opts.force })
  const manual = await runPostSteps(root, {
    install: opts.install,
    git: opts.git,
    kbee: Boolean(stack.kbee),
  })
  // Prints nothing itself: the CLI renders next steps and hints, so --json/MCP output stays pure.
  return { root, warnings, fixes, manual }
}

/** Commit first: kbee's in-repo citations point at the code committed alongside the KB. */
export const KBEE_NEXT_STEPS = [
  'git add -A && git commit -m init',
  'In Claude Code / Codex: /kbee init',
]

/**
 * Human next steps after create: cd, pending post-steps, services + database, then dev; with kbee,
 * the first commit and `/kbee init`.
 */
export function nextSteps(cd: string, manual: string[], stack: StackConfig): string[] {
  const [up, ...rest] = databaseSteps(stack)
  const full = rest.pop()
  return [
    `cd ${cd}`,
    ...manual,
    ...(up ? [up.cmd, ...rest.map((s) => s.cmd)] : []),
    'pnpm dev',
    ...(full
      ? [
          '',
          `Or run the full stack in Docker${stack.orm ? ' (migrations run automatically)' : ''}:`,
          `  ${full.cmd}`,
        ]
      : []),
    ...(stack.kbee
      ? ['', 'Then build the kbee knowledge base:', ...KBEE_NEXT_STEPS.map((s) => `  ${s}`)]
      : []),
  ]
}

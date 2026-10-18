import { resolve } from 'node:path'
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
  const config = opts.config ?? (await promptForStack(reg))
  const { stack, errors, warnings, fixes } = validateStack(config, reg)
  if (errors.length) {
    throw new CliError(`Invalid stack:\n${errors.map((e) => `  - ${e.message}`).join('\n')}`)
  }
  const root = resolve(opts.cwd, opts.dir ?? stack.name)
  await writeTree(root, generateProject(stack, reg), { mode: 'create', force: opts.force })
  const manual = await runPostSteps(root, { install: opts.install, git: opts.git })
  return { root, warnings, fixes, manual }
}

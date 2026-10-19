import { basename, resolve } from 'node:path'
import { z } from 'zod'
import { readManifest, runAddApp } from '../commands/add-app'
import { runCreate } from '../commands/create'
import { listOptions } from '../commands/options'
import { AppSpecSchema, StackConfigSchema } from '../model/stack'
import type { Registry } from '../plugins/registry'
import { validateStack } from '../rules'

/** Input schemas reuse the CLI's zod schemas, so MCP and `--config` accept the same JSON. */
export const createInput = {
  dir: z.string().min(1).describe('Target directory, resolved against the server cwd'),
  stack: StackConfigSchema.extend({
    name: z.string().min(1).optional().describe('Defaults to the directory name'),
  }),
  install: z.boolean().default(true).describe('Run pnpm install + format (default true)'),
  git: z.boolean().default(true).describe('Run git init (default true)'),
}

export const addAppInput = {
  cwd: z.string().min(1).describe('Root of a generated repo, resolved against the server cwd'),
  app: AppSpecSchema,
  install: z.boolean().default(true).describe('Run pnpm install + format (default true)'),
}

export const readManifestInput = {
  cwd: z.string().min(1).describe('Root of a generated repo, resolved against the server cwd'),
}

type Infer<T extends z.ZodRawShape> = z.infer<z.ZodObject<T>>

/**
 * Tool bodies: each returns exactly what the matching CLI `--json` mode prints, and throws the
 * CLI's own error where the CLI refuses. Relative paths resolve against `cwd`.
 */
export function toolHandlers(reg: Registry, cwd: string) {
  return {
    list_options: () => listOptions(reg),

    validate_stack: (input: unknown) => validateStack(StackConfigSchema.parse(input), reg),

    create: ({ dir, stack, install, git }: Infer<typeof createInput>) =>
      runCreate(
        {
          config: { ...stack, name: stack.name ?? basename(resolve(cwd, dir)) },
          cwd,
          dir,
          install,
          git,
          force: false,
          json: true,
          yes: true,
        },
        reg,
      ),

    add_app: ({ cwd: repo, app, install }: Infer<typeof addAppInput>) =>
      runAddApp({ cwd: resolve(cwd, repo), app, json: true, install }, reg),

    read_manifest: ({ cwd: repo }: Infer<typeof readManifestInput>) =>
      readManifest(resolve(cwd, repo)),
  }
}

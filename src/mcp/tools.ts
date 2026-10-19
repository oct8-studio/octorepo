import { basename, resolve } from 'node:path'
import { z } from 'zod'
import { readManifest, runAddApp } from '../commands/add-app'
import { runAddService } from '../commands/add-service'
import { runCreate } from '../commands/create'
import { listOptions } from '../commands/options'
import { AppSpecSchema, StackConfigSchema } from '../model/stack'
import type { Registry } from '../plugins/registry'
import { applyPreset } from '../presets'
import { validateStack } from '../rules'

/** Input schemas reuse the CLI's zod schemas, so MCP and `--config` accept the same JSON. */
export const createInput = {
  dir: z.string().min(1).describe('Target directory, resolved against the server cwd'),
  stack: StackConfigSchema.extend({
    name: z.string().min(1).optional().describe('Defaults to the directory name'),
    apps: z.array(AppSpecSchema).default([]).describe('Extra apps, appended after the preset apps'),
  }),
  preset: z
    .string()
    .optional()
    .describe('Preset id from list_options; its apps come first, then stack.apps'),
  install: z.boolean().default(true).describe('Run pnpm install + format (default true)'),
  git: z.boolean().default(true).describe('Run git init (default true)'),
}

export const addAppInput = {
  cwd: z.string().min(1).describe('Root of a generated repo, resolved against the server cwd'),
  app: AppSpecSchema,
  install: z.boolean().default(true).describe('Run pnpm install + format (default true)'),
}

export const addServiceInput = {
  cwd: z.string().min(1).describe('Root of a generated repo, resolved against the server cwd'),
  service: z.string().min(1).describe('Service id from list_options, e.g. postgres or s3'),
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

    create: ({ dir, stack, preset, install, git }: Infer<typeof createInput>) => {
      const named = { ...stack, name: stack.name ?? basename(resolve(cwd, dir)) }
      return runCreate(
        {
          config: preset ? applyPreset(preset, named) : named,
          cwd,
          dir,
          install,
          git,
          force: false,
          json: true,
          yes: true,
        },
        reg,
      )
    },

    add_app: ({ cwd: repo, app, install }: Infer<typeof addAppInput>) =>
      runAddApp({ cwd: resolve(cwd, repo), app, json: true, install }, reg),

    add_service: ({ cwd: repo, service }: Infer<typeof addServiceInput>) =>
      runAddService({ cwd: resolve(cwd, repo), service, json: true }, reg),

    read_manifest: ({ cwd: repo }: Infer<typeof readManifestInput>) =>
      readManifest(resolve(cwd, repo)),
  }
}

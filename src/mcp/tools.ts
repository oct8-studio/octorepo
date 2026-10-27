import { basename, resolve } from 'node:path'
import { z } from 'zod'
import { readManifest, runAddApp } from '../commands/add-app'
import { runAddService } from '../commands/add-service'
import { runCreate } from '../commands/create'
import { listOptions } from '../commands/options'
import { CliError } from '../model/errors'
import { AppSpecSchema, StackInputSchema } from '../model/stack'
import type { Registry } from '../plugins/registry'
import { applyPreset } from '../presets'
import { validateStack } from '../rules'

/** Input schemas reuse the CLI's zod schemas, so MCP and `--config` accept the same JSON. */
export const createInput = {
  dir: z.string().min(1).describe('Target directory, resolved against the server cwd'),
  stack: StackInputSchema.extend({
    name: z.string().min(1).optional().describe('Defaults to the directory name'),
    monorepoTool: z
      .enum(['turbo', 'nx'])
      .optional()
      .describe('Required unless preset is set (then defaults to turbo, like the CLI)'),
    apps: z.array(AppSpecSchema).default([]).describe('Extra apps, appended after the preset apps'),
  }),
  preset: z
    .string()
    .optional()
    .describe('Preset id from list_options; its apps come first, then stack.apps'),
  install: z.boolean().default(true).describe('Run pnpm install + format (default true)'),
  git: z.boolean().default(true).describe('Run git init (default true)'),
  kbee: z
    .boolean()
    .default(false)
    .describe(
      'Set up a kbee AI knowledge base: kb/manifest.json, AGENTS.md pointer, kbee skills (needs git; same as stack.kbee)',
    ),
}

export const validateStackInput = StackInputSchema.extend({
  name: z.string().min(1).optional().describe('Defaults to "app"; create uses the directory name'),
})

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

    validate_stack: (input: unknown) => {
      const stack = validateStackInput.parse(input)
      return validateStack({ ...stack, name: stack.name ?? 'app' }, reg)
    },

    create: async ({ dir, stack, preset, install, git, kbee }: Infer<typeof createInput>) => {
      // A preset alone is a complete stack, so the tool falls back to turbo (as `--preset` does).
      const monorepoTool = stack.monorepoTool ?? (preset ? 'turbo' : undefined)
      if (!monorepoTool) throw new CliError('Missing stack.monorepoTool (turbo or nx)')
      const named = {
        ...stack,
        monorepoTool,
        name: stack.name ?? basename(resolve(cwd, dir)),
        ...(kbee ? { kbee: true } : {}),
      }
      try {
        return await runCreate(
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
      } catch (e) {
        // Same refusal as the CLI, but MCP has no force input to suggest.
        if (e instanceof CliError && e.message.endsWith(' Use --force to write into it anyway.')) {
          throw new CliError(
            e.message.replace(
              ' Use --force to write into it anyway.',
              ' Pass an empty or new dir.',
            ),
          )
        }
        throw e
      }
    },

    add_app: ({ cwd: repo, app, install }: Infer<typeof addAppInput>) =>
      runAddApp({ cwd: resolve(cwd, repo), app, json: true, install }, reg),

    add_service: ({ cwd: repo, service }: Infer<typeof addServiceInput>) =>
      runAddService({ cwd: resolve(cwd, repo), service, json: true }, reg),

    read_manifest: ({ cwd: repo }: Infer<typeof readManifestInput>) =>
      readManifest(resolve(cwd, repo)),
  }
}

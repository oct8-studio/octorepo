import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { refreshAgentsSection } from '../engine/agents'
import { generateProject } from '../engine/generate'
import type { FileTree } from '../engine/tree'
import { writeTree } from '../engine/write'
import { MANIFEST_FILE } from '../meta'
import { CliError } from '../model/errors'
import type { StackConfig } from '../model/stack'
import type { Registry } from '../plugins/registry'
import { type Issue, validateStack } from '../rules'
import { VERSIONS } from '../versions'
import { readManifest } from './add-app'
import { patchRootFiles } from './root-patch'

export interface AddServiceOptions {
  cwd: string
  service: string
  json: boolean
}

export interface AddServiceResult {
  written: string[]
  warnings: Issue[]
  fixes: Issue[]
  message: string
}

/** Root files `add service` regenerates; apps' own files stay as they are. */
const REGENERATED = new Set(['docker-compose.yml', '.env.example', MANIFEST_FILE])

/** Tool-owned per-app code, e.g. a backend's `src/generated/env.ts`, which lists the service vars. */
const GENERATED_RE = /^apps\/[^/]+\/src\/generated\//

const KEY_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/

/** Appends `vars` missing from the dotenv file at `path` (created if absent); existing lines are never rewritten. */
async function appendEnv(path: string, vars: Record<string, string>): Promise<boolean> {
  let existing = ''
  try {
    existing = await readFile(path, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  const present = new Set(
    existing.split('\n').flatMap((line) => {
      const m = KEY_RE.exec(line)
      return m?.[1] ? [m[1]] : []
    }),
  )
  const lines = Object.entries(vars)
    .filter(([k]) => !present.has(k))
    .map(([k, v]) => `${k}=${v}\n`)
  if (lines.length === 0) return false
  const sep = existing && !existing.endsWith('\n') ? '\n' : ''
  await writeFile(path, `${existing}${sep}${lines.join('')}`)
  return true
}

/**
 * Adds a compose service: regenerates the compose file, root `.env.example`, manifest,
 * each app's `src/generated/` code and the AGENTS.md section, then appends the service's
 * localhost env vars to each backend's `.env` and `.env.example`. A service the repo already has is a no-op. Nothing is written on errors.
 */
export async function runAddService(
  opts: AddServiceOptions,
  reg: Registry,
): Promise<AddServiceResult> {
  const current = await readManifest(opts.cwd)
  const plugin = reg.service(opts.service)
  if (current.services.includes(opts.service)) {
    return {
      written: [],
      warnings: [],
      fixes: [],
      message: `Service "${opts.service}" is already in this repo; nothing changed`,
    }
  }
  const config: StackConfig = {
    name: current.name,
    monorepoTool: current.monorepoTool,
    packageManager: current.packageManager,
    apps: current.apps,
    services: [...current.services, opts.service],
    ...(current.orm ? { orm: current.orm } : {}),
    ...(current.preset ? { preset: current.preset } : {}),
  }
  const { stack, errors, warnings, fixes } = validateStack(config, reg)
  if (errors.length || !plugin) {
    throw new CliError(`Invalid stack:\n${errors.map((e) => `  - ${e.message}`).join('\n')}`)
  }

  const generated = generateProject(stack, reg)
  const tree: FileTree = {}
  for (const [path, content] of Object.entries(generated)) {
    if (REGENERATED.has(path) || GENERATED_RE.test(path)) tree[path] = content
  }
  // Repos from older versions miss newer ignore entries; same append/merge-only patch as add app.
  const root = await patchRootFiles(opts.cwd, generated)
  Object.assign(tree, root.tree)
  const written = await writeTree(opts.cwd, tree, { mode: 'update' })
  written.push(await refreshAgentsSection(opts.cwd, stack))

  const vars = plugin.env({ stack, scope: `@${stack.name}`, versions: VERSIONS }, 'localhost')
  for (const app of stack.apps.filter((a) => a.kind === 'backend')) {
    for (const file of ['.env', '.env.example']) {
      const path = join(opts.cwd, 'apps', app.name, file)
      if (await appendEnv(path, vars)) written.push(path)
    }
  }
  return {
    written,
    warnings: [...warnings, ...root.warnings],
    fixes,
    message: `Added service "${opts.service}" (${plugin.label})`,
  }
}

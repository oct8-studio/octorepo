import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { generateProject } from '../engine/generate'
import { type FileTree, json, mergeJson } from '../engine/tree'
import { writeTree } from '../engine/write'
import { CliError, ManifestError } from '../model/errors'
import { type AppSpec, parseManifest, type StackConfig } from '../model/stack'
import type { Registry } from '../plugins/registry'
import { type Issue, validateStack } from '../rules'
import { runPostSteps } from './post'

export interface AddAppOptions {
  cwd: string
  app: AppSpec
  json: boolean
  /** Run pnpm install + biome format after writing. Defaults to false. */
  install?: boolean
}

export interface AddAppResult {
  written: string[]
  warnings: Issue[]
  fixes: Issue[]
  manual?: string[]
}

const MANIFEST = '.octorepo.json'
const ROOT_OWNED = new Set([
  'package.json',
  'pnpm-workspace.yaml',
  'turbo.json',
  'nx.json',
  'docker-compose.yml',
  '.env.example',
  MANIFEST,
])

/** Paths `add` may rewrite: tool-owned files; everything else is user-owned. */
function isToolOwned(path: string): boolean {
  return (
    ROOT_OWNED.has(path) ||
    /^packages\/[^/]+-client\//.test(path) ||
    /^apps\/[^/]+\/src\/generated\//.test(path)
  )
}

export async function readManifest(root: string): Promise<StackConfig> {
  let raw: string
  try {
    raw = await readFile(join(root, MANIFEST), 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ManifestError(
        'missing',
        `No ${MANIFEST} found in ${root}. Run from a repo created by this tool.`,
      )
    }
    throw e
  }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new ManifestError('invalid', `${MANIFEST} is not valid JSON`)
  }
  try {
    return parseManifest(data)
  } catch (e) {
    if (e instanceof ManifestError && e.reason === 'unsupported-schema') {
      throw new ManifestError(
        'unsupported-schema',
        `${e.message} (this CLI supports schemaVersion 1)`,
      )
    }
    throw e
  }
}

/** Keeps the keys the user added to JSON tool-owned files that already exist on disk. */
async function mergeWithDisk(root: string, path: string, content: string): Promise<string> {
  if (!path.endsWith('.json') || path === MANIFEST) return content
  let disk: string
  try {
    disk = await readFile(join(root, path), 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return content
    throw e
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(disk)
  } catch {
    throw new CliError(`${path} is not valid JSON; fix or remove it and retry`)
  }
  // User values win; the generator only adds missing keys (R17).
  return json(mergeJson(JSON.parse(content), parsed))
}

/** validate → generate → filter to new-app + tool-owned paths → write. Nothing is written on errors. */
export async function runAddApp(opts: AddAppOptions, reg: Registry): Promise<AddAppResult> {
  const current = await readManifest(opts.cwd)
  const config: StackConfig = {
    name: current.name,
    monorepoTool: current.monorepoTool,
    packageManager: current.packageManager,
    apps: [...current.apps, opts.app],
    services: current.services,
  }
  const { stack, errors, warnings, fixes } = validateStack(config, reg)
  if (errors.length) {
    throw new CliError(`Invalid stack:\n${errors.map((e) => `  - ${e.message}`).join('\n')}`)
  }

  if (existsSync(join(opts.cwd, 'apps', opts.app.name))) {
    throw new CliError(
      `apps/${opts.app.name} already exists on disk; choose another name or remove it`,
    )
  }
  const prefix = `apps/${opts.app.name}/`
  const tree: FileTree = {}
  for (const [path, content] of Object.entries(generateProject(stack, reg))) {
    const isNewUi =
      /^packages\/ui-[^/]+\//.test(path) &&
      !existsSync(join(opts.cwd, path.split('/').slice(0, 2).join('/')))
    if (path.startsWith(prefix) || isNewUi) tree[path] = content
    else if (isToolOwned(path)) tree[path] = await mergeWithDisk(opts.cwd, path, content)
  }
  const written = await writeTree(opts.cwd, tree, { mode: 'update' })

  const manual =
    opts.install === undefined
      ? undefined
      : await runPostSteps(opts.cwd, { install: opts.install, git: false })
  return { written, warnings, fixes, ...(manual ? { manual } : {}) }
}

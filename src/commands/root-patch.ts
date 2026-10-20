import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { json } from '../engine/tree'
import type { Issue } from '../rules'

/** User-owned root files that `add` patches (append/merge only) so older repos learn new entries. */
export const PATCHED_ROOT_FILES = ['.gitignore', '.dockerignore', 'biome.json'] as const

const HEADER = '# Added by octorepo add'

/**
 * Appends the generated lines missing from `disk`, keeping every user line and its order.
 * Returns undefined when nothing is missing.
 */
export function appendMissingLines(disk: string, generated: string): string | undefined {
  const present = new Set(disk.split(/\r?\n/).map((l) => l.trim()))
  const missing = generated
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#') && !present.has(l))
  if (missing.length === 0) return undefined
  const base = disk === '' || disk.endsWith('\n') ? disk : `${disk}\n`
  return `${base}${base === '' ? '' : '\n'}${HEADER}\n${missing.join('\n')}\n`
}

interface BiomeConfig {
  files?: { includes?: unknown }
  html?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * Unions the generated `files.includes` exclusions into the user's array (appended, so they win
 * over earlier user patterns) and enables full HTML-ish template support unless the user set it.
 * User values are kept (R17). Returns undefined when nothing changes.
 */
export function patchBiomeJson(disk: string, generated: string): string | undefined {
  const user = JSON.parse(disk) as BiomeConfig
  const gen = JSON.parse(generated) as BiomeConfig
  const genIncludes = Array.isArray(gen.files?.includes) ? (gen.files.includes as string[]) : []
  let changed = false

  const files = user.files ?? {}
  if (files.includes === undefined) {
    files.includes = genIncludes
    changed = genIncludes.length > 0
  } else if (Array.isArray(files.includes)) {
    // Only exclusions are added: a new positive pattern such as `**` would widen what the user lints.
    const missing = genIncludes.filter(
      (p) => p.startsWith('!') && !(files.includes as unknown[]).includes(p),
    )
    if (missing.length > 0) {
      files.includes = [...files.includes, ...missing]
      changed = true
    }
  }
  user.files = files

  const genHtml = gen.html ?? {}
  if ('experimentalFullSupportEnabled' in genHtml) {
    const html = user.html ?? {}
    if (!('experimentalFullSupportEnabled' in html)) {
      html.experimentalFullSupportEnabled = genHtml.experimentalFullSupportEnabled
      user.html = html
      changed = true
    }
  }
  return changed ? json(user) : undefined
}

/**
 * Patched contents of the user-owned root files that miss generated entries, read from `root`.
 * Missing files are left alone; an unparsable biome.json becomes a warning instead of an error.
 */
export async function patchRootFiles(
  root: string,
  generated: Record<string, string>,
): Promise<{ tree: Record<string, string>; warnings: Issue[] }> {
  const tree: Record<string, string> = {}
  const warnings: Issue[] = []
  for (const path of PATCHED_ROOT_FILES) {
    const gen = generated[path]
    if (gen === undefined) continue
    let disk: string
    try {
      disk = await readFile(join(root, path), 'utf8')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw e
    }
    if (path === 'biome.json') {
      try {
        const next = patchBiomeJson(disk, gen)
        if (next !== undefined) tree[path] = next
      } catch {
        warnings.push({
          rule: 'root-files',
          level: 'warning',
          message: `biome.json is not plain JSON, so it was not updated; add the "files.includes" exclusions and "html.experimentalFullSupportEnabled" by hand (see the README)`,
        })
      }
    } else {
      const next = appendMissingLines(disk, gen)
      if (next !== undefined) tree[path] = next
    }
  }
  return { tree, warnings }
}

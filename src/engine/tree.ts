import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** posix relative path -> contents */
export type FileTree = Record<string, string>

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Objects merge recursively; arrays concatenate with dedupe; scalars: b wins. */
export function mergeJson(a: unknown, b: unknown): unknown {
  if (isPlainObject(a) && isPlainObject(b)) {
    const out: Record<string, unknown> = { ...a }
    for (const [k, v] of Object.entries(b)) out[k] = k in a ? mergeJson(a[k], v) : v
    return out
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const seen = new Set<string>()
    const out: unknown[] = []
    for (const item of [...a, ...b]) {
      const key = JSON.stringify(item)
      if (!seen.has(key)) {
        seen.add(key)
        out.push(item)
      }
    }
    return out
  }
  return b
}

export function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

/** Later trees win, except `.json` paths which are deep-merged. */
export function mergeTrees(...trees: FileTree[]): FileTree {
  const out: FileTree = {}
  for (const tree of trees) {
    for (const [path, content] of Object.entries(tree)) {
      const prev = out[path]
      out[path] =
        prev !== undefined && path.endsWith('.json')
          ? json(mergeJson(JSON.parse(prev), JSON.parse(content)))
          : content
    }
  }
  return out
}

function walk(root: string, rel = ''): string[] {
  const out: string[] = []
  for (const name of readdirSync(join(root, rel)).sort()) {
    const childRel = rel ? `${rel}/${name}` : name
    if (statSync(join(root, childRel)).isDirectory()) out.push(...walk(root, childRel))
    else out.push(childRel)
  }
  return out
}

/**
 * Reads `<dir>/files/**` recursively, replaces `{{key}}` tokens and strips a trailing `.tpl`.
 * `dir` is the plugin directory URL (e.g. `new URL('./', import.meta.url)`); resolved only relative to it.
 */
export function readPluginFiles(dir: URL, vars: Record<string, string>): FileTree {
  const root = fileURLToPath(new URL('files/', dir.href.endsWith('/') ? dir : `${dir.href}/`))
  const tree: FileTree = {}
  for (const rel of walk(root)) {
    const content = readFileSync(join(root, rel), 'utf8').replace(/\{\{(\w+)\}\}/g, (m, key) =>
      Object.hasOwn(vars, key) ? (vars[key] as string) : m,
    )
    tree[rel.replace(/\.tpl$/, '')] = content
  }
  return tree
}

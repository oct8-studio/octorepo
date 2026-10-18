import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { CliError } from '../model/errors'
import type { FileTree } from './tree'

export interface WriteOptions {
  mode: 'create' | 'update'
  force?: boolean
}

async function isNonEmptyDir(dir: string): Promise<boolean> {
  try {
    return (await readdir(dir)).length > 0
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw e
  }
}

/** Writes a file tree under `root`; returns absolute written paths. */
export async function writeTree(
  root: string,
  tree: FileTree,
  opts: WriteOptions,
): Promise<string[]> {
  if (opts.mode === 'create' && !opts.force && (await isNonEmptyDir(root))) {
    throw new CliError(`Directory ${root} is not empty. Use --force to write into it anyway.`)
  }
  const written: string[] = []
  for (const [rel, content] of Object.entries(tree)) {
    const target = join(root, rel)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content)
    written.push(target)
  }
  return written
}

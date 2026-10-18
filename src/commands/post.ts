import { spawn } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { delimiter, join } from 'node:path'
import { CliError } from '../model/errors'

const INSTALL = 'pnpm install'
/** Generated imports can't match every scope's sort order, so format once after install (R14). */
const FORMAT = 'pnpm exec biome check --write .'
const GIT_INIT = 'git init'

function onPath(cmd: string): boolean {
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', ''] : ['']
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue
    for (const ext of exts) {
      try {
        accessSync(join(dir, cmd + ext), constants.X_OK)
        return true
      } catch {
        // not here
      }
    }
  }
  return false
}

/** Runs a command in `cwd`; its output goes to stderr so `--json` stdout stays clean. */
function exec(cmd: string, args: string[], cwd: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 2, 2],
      shell: process.platform === 'win32',
    })
    child.on('error', reject)
    child.on('close', (code) => resolve(code ?? 1))
  })
}

/**
 * Install, format and `git init` the generated repo. Steps that are disabled or whose tool is
 * missing are returned as manual commands instead of failing.
 */
export async function runPostSteps(
  root: string,
  opts: { install: boolean; git: boolean },
): Promise<string[]> {
  const manual: string[] = []
  if (opts.install && onPath('pnpm')) {
    const code = await exec('pnpm', ['install'], root)
    if (code !== 0) throw new CliError(`\`${INSTALL}\` failed in ${root} (exit code ${code})`)
    if ((await exec('pnpm', ['exec', 'biome', 'check', '--write', '.'], root)) !== 0) {
      manual.push(FORMAT)
    }
  } else {
    manual.push(INSTALL, FORMAT)
  }
  if (opts.git) {
    const ok = onPath('git') && (await exec('git', ['init', '--quiet'], root)) === 0
    if (!ok) manual.push(GIT_INIT)
  }
  return manual
}

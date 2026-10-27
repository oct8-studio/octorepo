import { spawn } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { delimiter, join } from 'node:path'
import { KBEE_SKILLS_ARGS, KBEE_SKILLS_INSTALL } from '../engine/kbee'
import { CliError } from '../model/errors'

const INSTALL = 'pnpm install'
/** Generated imports can't match every scope's sort order, so format once after install (R14). */
const FORMAT = 'pnpm exec biome check --write .'
const GIT_INIT = 'git init'
const GIT_INIT_MAIN = 'git init -b main'

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

/** The skills install fetches from GitHub; give up (and print it as a manual step) after this. */
const SKILLS_TIMEOUT_MS = 5 * 60_000

/** Runs a command in `cwd`; its output goes to stderr so `--json` stdout stays clean. */
function exec(cmd: string, args: string[], cwd: string, timeout?: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 2, 2],
      shell: process.platform === 'win32',
      ...(timeout ? { timeout } : {}),
    })
    child.on('error', reject)
    child.on('close', (code) => resolve(code ?? 1))
  })
}

/**
 * Install, format, add the kbee skills (when `kbee`) and `git init` the generated repo. Steps that
 * are disabled, whose tool is missing or that need an unreachable network (the skills install) are
 * returned as manual commands instead of failing.
 */
export async function runPostSteps(
  root: string,
  opts: { install: boolean; git: boolean; kbee?: boolean },
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
  if (opts.kbee) {
    const ok =
      opts.install &&
      onPath('npx') &&
      (await exec('npx', KBEE_SKILLS_ARGS, root, SKILLS_TIMEOUT_MS).catch(() => 1)) === 0
    if (!ok) manual.push(KBEE_SKILLS_INSTALL)
  }
  if (opts.git) {
    // kbee's manifest and the generated CI name `main`, so a kbee repo starts on it whatever
    // init.defaultBranch says.
    const args = opts.kbee ? ['init', '--quiet', '--initial-branch=main'] : ['init', '--quiet']
    const ok = onPath('git') && (await exec('git', args, root)) === 0
    if (!ok) manual.push(opts.kbee ? GIT_INIT_MAIN : GIT_INIT)
  }
  return manual
}

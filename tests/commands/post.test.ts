import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runPostSteps } from '../../src/commands/post'
import { KBEE_SKILLS_ARGS, KBEE_SKILLS_INSTALL } from '../../src/engine/kbee'

const BIOME = 'pnpm exec biome check --write .'

/** A PATH holding only a fake `npx` that records its args and cwd, then exits with `code`. */
async function fakeNpx(code: number): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'octo-fake-npx-'))
  const npx = join(dir, 'npx')
  await writeFile(
    npx,
    `#!/bin/sh\necho "$PWD" > "${dir}/cwd"\necho "$@" > "${dir}/args"\nexit ${code}\n`,
  )
  await chmod(npx, 0o755)
  return dir
}

describe('runPostSteps', () => {
  const oldPath = process.env.PATH
  afterEach(() => {
    process.env.PATH = oldPath
  })
  it('returns manual commands when pnpm and git are missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'octo-post-'))
    process.env.PATH = await mkdtemp(join(tmpdir(), 'octo-empty-path-'))
    await expect(runPostSteps(root, { install: true, git: true })).resolves.toEqual([
      'pnpm install',
      BIOME,
      'git init',
    ])
  })
  it('lists install and format commands when install is disabled', async () => {
    const root = await mkdtemp(join(tmpdir(), 'octo-post-'))
    await expect(runPostSteps(root, { install: false, git: false })).resolves.toEqual([
      'pnpm install',
      BIOME,
    ])
  })
  it.skipIf(process.platform === 'win32')(
    'kbee: installs the skills with npx in the repo',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'octo-post-'))
      const bin = await fakeNpx(0)
      process.env.PATH = bin
      const manual = await runPostSteps(root, { install: true, git: false, kbee: true })
      expect(manual).toEqual(['pnpm install', BIOME])
      expect((await readFile(join(bin, 'args'), 'utf8')).trim()).toBe(KBEE_SKILLS_ARGS.join(' '))
      expect(await readFile(join(bin, 'cwd'), 'utf8')).toContain(root.split('/').pop())
      expect(KBEE_SKILLS_INSTALL).toMatch(
        /^npx -y skills@\d+\.\d+\.\d+ add oct8-studio\/kbee -a claude-code codex -y --copy$/,
      )
    },
  )
  it.skipIf(process.platform === 'win32')(
    'kbee: a failed install (e.g. offline) becomes a manual step',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'octo-post-'))
      process.env.PATH = await fakeNpx(1)
      await expect(runPostSteps(root, { install: true, git: false, kbee: true })).resolves.toEqual([
        'pnpm install',
        BIOME,
        KBEE_SKILLS_INSTALL,
      ])
    },
  )
  it('kbee: missing npx or --no-install becomes a manual step, before git init', async () => {
    const root = await mkdtemp(join(tmpdir(), 'octo-post-'))
    process.env.PATH = await mkdtemp(join(tmpdir(), 'octo-empty-path-'))
    await expect(runPostSteps(root, { install: true, git: true, kbee: true })).resolves.toEqual([
      'pnpm install',
      BIOME,
      KBEE_SKILLS_INSTALL,
      'git init -b main',
    ])
    process.env.PATH = await fakeNpx(0)
    await expect(runPostSteps(root, { install: false, git: false, kbee: true })).resolves.toEqual([
      'pnpm install',
      BIOME,
      KBEE_SKILLS_INSTALL,
    ])
  })
})

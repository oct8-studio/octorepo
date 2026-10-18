import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runPostSteps } from '../../src/commands/post'

const BIOME = 'pnpm exec biome check --write .'

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
})

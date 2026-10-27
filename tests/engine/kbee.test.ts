import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runCreate } from '../../src/commands/create'
import { generateProject } from '../../src/engine/generate'
import { kbeeContractHints, kbeeFiles, kbeeManifest } from '../../src/engine/kbee'
import { CliError } from '../../src/model/errors'
import type { StackConfig } from '../../src/model/stack'
import { defaultRegistry } from '../../src/plugins/registry'
import { validateStack } from '../../src/rules'
import { KBEE_RULES_VERSION } from '../../src/versions'

/**
 * Port of `validateManifest` from kbee's shared/scripts/kbee-tool.mjs (oct8-studio/kbee @ b4b8343),
 * so the generated manifest is checked against kbee's own rules without a network fetch.
 */
const NAME_RE = /^[a-z0-9][a-z0-9._-]*$/
function validateManifest(obj: Record<string, unknown>): string[] {
  const errors: string[] = []
  if (obj.kbeeVersion !== 1) errors.push('kbeeVersion must be 1')
  const rv = obj.rulesVersion
  if (rv !== undefined && !(Number.isInteger(rv) && (rv as number) >= 1))
    errors.push('rulesVersion must be a positive integer')
  if (obj.mode !== undefined && obj.mode !== 'direct' && obj.mode !== 'pr') errors.push('mode')
  if (obj.location !== undefined && obj.location !== 'in-repo' && obj.location !== 'separate')
    errors.push('location')
  if (!Array.isArray(obj.repos)) return [...errors, 'repos must be an array']
  const seen = new Set<string>()
  obj.repos.forEach((r: Record<string, unknown>, i: number) => {
    const name = r.name as string
    if (!name) errors.push(`repos[${i}].name is required`)
    else if (!NAME_RE.test(name)) errors.push(`repos[${i}].name must match ${NAME_RE}`)
    else if (seen.has(name)) errors.push(`duplicate repo name: ${name}`)
    else seen.add(name)
    for (const key of ['defaultBranch', 'pathHint']) {
      if (typeof r[key] !== 'string' || !r[key]) errors.push(`repos[${i}].${key} is required`)
    }
    const sha = r.syncedSha as string | null
    if (sha != null && !/^[0-9a-f]{7,40}$/.test(sha)) errors.push(`repos[${i}].syncedSha`)
  })
  return errors
}

/** kbee-tool's pointer-block regex (findKb step 3). */
const POINTER_RE = /<!-- kbee:start -->[\s\S]*?kbee-kb-path:\s*(\S+)[\s\S]*?<!-- kbee:end -->/

const reg = defaultRegistry()
const config: StackConfig = {
  name: 'shop',
  monorepoTool: 'turbo',
  packageManager: 'pnpm',
  apps: [
    { name: 'web', kind: 'frontend', framework: 'next', uses: ['api'] },
    { name: 'admin', kind: 'frontend', framework: 'react-vite', uses: ['api', 'core'] },
    { name: 'api', kind: 'backend', framework: 'nest' },
    { name: 'core', kind: 'backend', framework: 'express' },
  ],
  services: ['postgres'],
  orm: 'drizzle',
  kbee: true,
}

describe('kbee manifest', () => {
  it('lists backends, frontends, types, then db; paths relative to kb/', () => {
    const m = kbeeManifest(config)
    expect(m).toMatchObject({
      kbeeVersion: 1,
      mode: 'direct',
      location: 'in-repo',
      rulesVersion: KBEE_RULES_VERSION,
    })
    expect(m.repos.map((r) => [r.name, r.pathHint])).toEqual([
      ['api', '../apps/api'],
      ['core', '../apps/core'],
      ['web', '../apps/web'],
      ['admin', '../apps/admin'],
      ['types', '../packages/types'],
      ['db', '../packages/db'],
    ])
    for (const r of m.repos) {
      expect(r).toMatchObject({ defaultBranch: 'main', syncedSha: null, syncedAt: null })
    }
  })

  it("passes kbee's validateManifest", () => {
    expect(validateManifest(kbeeManifest(config))).toEqual([])
    expect(validateManifest(kbeeManifest({ apps: config.apps }))).toEqual([])
  })

  it('no db entry without an ORM, and no client or service entries', () => {
    const names = kbeeManifest({ apps: config.apps }).repos.map((r) => r.name)
    expect(names).toEqual(['api', 'core', 'web', 'admin', 'types'])
  })

  it('kb/ holds only the manifest, the local-override ignore and features/', () => {
    expect(Object.keys(kbeeFiles(config)).sort()).toEqual([
      'kb/.gitignore',
      'kb/features/.gitkeep',
      'kb/manifest.json',
    ])
    expect(kbeeFiles(config)['kb/.gitignore']).toBe('.kbee.local.json\n')
    expect(kbeeFiles({ ...config, kbee: false })).toEqual({})
  })

  it('contract hints: frontend → backend through the generated client, backends → db', () => {
    expect(kbeeContractHints(config)).toEqual([
      '- web → api: HTTP API produced by `apps/api` (`apps/api/openapi.json`), consumed through `packages/api-client`',
      '- admin → api: HTTP API produced by `apps/api` (`apps/api/openapi.json`), consumed through `packages/api-client`',
      '- admin → core: HTTP API produced by `apps/core` (`apps/core/openapi.json`), consumed through `packages/core-client`',
      '- api, core → db: tables and client in `packages/db` (drizzle)',
      '- types: shared zod schemas in `packages/types`',
    ])
  })
})

describe('generateProject with kbee', () => {
  const { stack } = validateStack(config, reg)
  const tree = generateProject(stack, reg)

  it('writes kb/ and records kbee in .octorepo.json', () => {
    expect(validateManifest(JSON.parse(tree['kb/manifest.json'] as string))).toEqual([])
    expect(JSON.parse(tree['.octorepo.json'] as string).kbee).toBe(true)
  })

  it('AGENTS.md carries the kbee pointer and contract hints instead of the install hint', () => {
    const agents = tree['AGENTS.md'] as string
    expect(POINTER_RE.exec(agents)?.[1]).toBe('kb')
    expect(agents).toContain('/kbee audit')
    expect(agents).toContain('consumed through `packages/core-client`')
    expect(agents).not.toContain('npx skills add')
    const inner = agents.slice(agents.indexOf('<!-- octorepo:begin -->'))
    expect(inner.indexOf('<!-- kbee:end -->')).toBeLessThan(inner.indexOf('<!-- octorepo:end -->'))
    expect(tree['README.md']).toContain('/kbee audit')
  })

  it('without kbee: no kb/, the install hint stays', () => {
    const plain = generateProject(validateStack({ ...config, kbee: false }, reg).stack, reg)
    expect(Object.keys(plain).some((p) => p.startsWith('kb/'))).toBe(false)
    expect(plain['AGENTS.md']).toContain('npx skills add oct8-studio/kbee')
    expect(plain['AGENTS.md']).not.toContain('kbee:start')
  })

  it('biome skips installed agent skills', () => {
    const includes = JSON.parse(tree['biome.json'] as string).files.includes
    expect(includes).toEqual(
      expect.arrayContaining(['!.agents/skills', '!.claude/skills', '!skills-lock.json']),
    )
  })
})

describe('runCreate with kbee', () => {
  it('refuses --no-git and writes nothing', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'octo-kbee-'))
    const opts = { install: false, git: false, force: false, json: true, yes: true }
    await expect(runCreate({ ...opts, config, cwd, dir: 'x' }, reg)).rejects.toThrow(CliError)
    await expect(runCreate({ ...opts, config, cwd, dir: 'x' }, reg)).rejects.toThrow(/needs git/)
  })
})

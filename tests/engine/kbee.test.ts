import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { KBEE_POINTER_RE, validateKbeeManifest } from '../../scripts/kbee-manifest'
import { runCreate } from '../../src/commands/create'
import { generateProject } from '../../src/engine/generate'
import {
  kbeeContractHints,
  kbeeFiles,
  kbeeManifest,
  mergeKbeeManifest,
} from '../../src/engine/kbee'
import { CliError } from '../../src/model/errors'
import type { StackConfig } from '../../src/model/stack'
import { defaultRegistry } from '../../src/plugins/registry'
import { validateStack } from '../../src/rules'
import { KBEE_RULES_VERSION } from '../../src/versions'

const validateManifest = validateKbeeManifest
const POINTER_RE = KBEE_POINTER_RE

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
  it('lists producers first: types, db, backends, then frontends; paths relative to kb/', () => {
    const m = kbeeManifest(config)
    expect(m).toMatchObject({
      kbeeVersion: 1,
      mode: 'direct',
      location: 'in-repo',
      rulesVersion: KBEE_RULES_VERSION,
    })
    expect(m.repos.map((r) => [r.name, r.pathHint])).toEqual([
      ['types', '../packages/types'],
      ['db', '../packages/db'],
      ['api', '../apps/api'],
      ['core', '../apps/core'],
      ['web', '../apps/web'],
      ['admin', '../apps/admin'],
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
    expect(names).toEqual(['types', 'api', 'core', 'web', 'admin'])
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
    expect(agents).toContain('/kbee init')
    expect(agents).toContain('consumed through `packages/core-client`')
    expect(agents).not.toContain('npx skills add')
    const inner = agents.slice(agents.indexOf('<!-- octorepo:begin -->'))
    expect(inner.indexOf('<!-- kbee:end -->')).toBeLessThan(inner.indexOf('<!-- octorepo:end -->'))
    expect(tree['README.md']).toContain('/kbee init')
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

describe('validateKbeeManifest (port of kbee-tool)', () => {
  it('reports what kbee rejects', () => {
    expect(validateManifest([])).toEqual(['manifest must be a JSON object'])
    const bad = {
      kbeeVersion: 2,
      mode: 'push',
      repos: [
        { name: 'Api', defaultBranch: 'main', pathHint: '../apps/api' },
        { name: 'web', pathHint: '../apps/web', syncedSha: 'zz' },
      ],
    }
    expect(validateManifest(bad)).toEqual([
      'kbeeVersion must be 1',
      "mode must be 'direct' or 'pr'",
      'repos[0].name must match /^[a-z0-9][a-z0-9._-]*$/',
      'repos[1].defaultBranch is required',
      'repos[1].syncedSha must be a hex commit SHA or null',
    ])
  })
})

describe('mergeKbeeManifest', () => {
  const disk = `${JSON.stringify(kbeeManifest(config), null, 2)}\n`
  it('is a no-op when every entry exists', () => {
    expect(mergeKbeeManifest(disk, config)).toBeUndefined()
  })
  it('adds a missing db entry and keeps the result valid for kbee', () => {
    const noDb = `${JSON.stringify(kbeeManifest({ apps: config.apps }))}`
    const out = JSON.parse(mergeKbeeManifest(noDb, config) as string)
    expect(out.repos.at(-1)).toMatchObject({ name: 'db', pathHint: '../packages/db' })
    expect(validateManifest(out)).toEqual([])
  })
  it('throws on a non-object manifest', () => {
    expect(() => mergeKbeeManifest('[]', config)).toThrow(/not a JSON object/)
  })
})

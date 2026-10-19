import { describe, expect, it } from 'vitest'
import { CliError, ManifestError } from '../../src/model/errors'
import { parseManifest, parseStackConfig } from '../../src/model/stack'

const valid = {
  name: 'acme',
  monorepoTool: 'turbo',
  apps: [{ name: 'web', kind: 'frontend', framework: 'next' }],
}

describe('parseStackConfig', () => {
  it('applies defaults', () => {
    const cfg = parseStackConfig(valid)
    expect(cfg.services).toEqual([])
    expect(cfg.packageManager).toBe('pnpm')
    expect(cfg.apps[0]?.uses).toEqual([])
  })

  it('rejects unknown monorepoTool with CliError', () => {
    const run = () => parseStackConfig({ ...valid, monorepoTool: 'lerna' })
    expect(run).toThrow(CliError)
    expect(run).toThrow(/monorepoTool/)
  })
})

describe('parseManifest', () => {
  it('accepts schemaVersion 1', () => {
    const m = parseManifest({ ...valid, schemaVersion: 1, cliVersion: '1.0.0' })
    expect(m.cliVersion).toBe('1.0.0')
  })

  it('rejects unsupported schemaVersion', () => {
    try {
      parseManifest({ ...valid, schemaVersion: 2, cliVersion: '9.9.9' })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ManifestError)
      expect((e as ManifestError).reason).toBe('unsupported-schema')
    }
  })

  it('rejects invalid manifest', () => {
    expect(() => parseManifest({ schemaVersion: 1 })).toThrow(ManifestError)
  })

  it('accepts an optional orm and keeps manifests without one valid', () => {
    expect(parseManifest({ ...valid, schemaVersion: 1, cliVersion: '1.0.0' }).orm).toBeUndefined()
    expect(
      parseManifest({ ...valid, orm: 'prisma', schemaVersion: 1, cliVersion: '1.0.0' }).orm,
    ).toBe('prisma')
    expect(() => parseStackConfig({ ...valid, orm: 'typeorm' })).toThrow(/orm/)
  })
})

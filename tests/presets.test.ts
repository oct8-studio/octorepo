import { describe, expect, it } from 'vitest'
import { CliError } from '../src/model/errors'
import type { StackConfig } from '../src/model/stack'
import { defaultRegistry } from '../src/plugins/registry'
import { applyPreset, findPreset, PRESETS } from '../src/presets'
import { validateStack } from '../src/rules'

const reg = defaultRegistry()
const base: Pick<StackConfig, 'apps' | 'services' | 'orm'> = { apps: [], services: [] }

describe('presets', () => {
  it('every preset validates cleanly against the registry', () => {
    for (const p of PRESETS) {
      const v = validateStack(
        { name: 'x', monorepoTool: 'turbo', packageManager: 'pnpm', ...applyPreset(p.id, base) },
        reg,
      )
      expect(v.errors, p.id).toEqual([])
    }
  })

  it('saas and api-platform match the spec', () => {
    const saas = findPreset('saas')
    expect(saas?.apps.map((a) => `${a.name}:${a.framework}`)).toEqual([
      'web:next',
      'admin:react-vite',
      'api:nest',
      'worker:fastify',
    ])
    expect(saas?.services).toEqual(['postgres', 'valkey', 'mailpit'])
    expect(saas?.orm).toBe('drizzle')
    const plat = findPreset('api-platform')
    expect(plat?.apps.map((a) => `${a.name}:${a.framework}`)).toEqual([
      'gateway:hono',
      'users:nest',
      'billing:fastify',
      'docs:astro',
    ])
    expect(plat?.apps.find((a) => a.name === 'docs')?.uses).toEqual(['gateway'])
    expect(plat?.services).toEqual(['postgres', 'rabbitmq'])
    expect(plat?.orm).toBe('prisma')
  })

  it('puts preset apps first and appends extras', () => {
    const extra = { name: 'jobs', kind: 'backend' as const, framework: 'express' }
    const r = applyPreset('saas', { apps: [extra], services: ['s3', 'postgres'] })
    expect(r.apps.map((a) => a.name)).toEqual(['web', 'admin', 'api', 'worker', 'jobs'])
    expect(r.services).toEqual(['postgres', 'valkey', 'mailpit', 's3'])
    expect(r.preset).toBe('saas')
  })

  it('rejects an extra app that collides with a preset app', () => {
    const dup = { name: 'api', kind: 'backend' as const, framework: 'express' }
    expect(() => applyPreset('saas', { apps: [dup], services: [] })).toThrow(
      /"api" collides with preset "saas"/,
    )
  })

  it('rejects an unknown preset and does not mutate the preset definition', () => {
    expect(() => applyPreset('nope', base)).toThrow(CliError)
    const r = applyPreset('saas', base)
    const first = r.apps[0]
    if (first) first.name = 'changed'
    expect(findPreset('saas')?.apps[0]?.name).toBe('web')
  })

  it('an explicit orm wins over the preset orm', () => {
    expect(applyPreset('saas', { ...base, orm: 'prisma' as const }).orm).toBe('prisma')
  })
})

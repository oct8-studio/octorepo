import { describe, expect, it } from 'vitest'
import { formatOptions, listOptions } from '../../src/commands/options'
import { defaultRegistry } from '../../src/plugins/registry'

describe('listOptions', () => {
  const o = listOptions(defaultRegistry())

  it('lists every registered plugin by category', () => {
    expect(o.monorepoTools.map((t) => t.id)).toEqual(expect.arrayContaining(['turbo', 'nx']))
    expect(o.frameworks.backend.map((f) => f.id)).toContain('express')
    expect(o.frameworks.frontend.map((f) => f.id)).toContain('next')
    expect(o.services.map((s) => s.id)).toContain('postgres')
    expect(o.orms.map((x) => x.id)).toEqual(['drizzle', 'prisma'])
    expect(o.presets.map((p) => p.id)).toEqual(['saas', 'api-platform'])
    expect(o.integrations.map((i) => i.id)).toEqual(['kbee'])
  })

  it('carries what an agent needs to pick a framework', () => {
    expect(o.frameworks.frontend.find((f) => f.id === 'next')).toMatchObject({
      label: expect.any(String),
      rendering: 'ssr',
      uiFamily: 'react',
    })
    expect(o.frameworks.backend.find((f) => f.id === 'express')?.apiStyles).toContain('rest')
  })

  it('is plain JSON', () => {
    expect(JSON.parse(JSON.stringify(o))).toEqual(o)
  })
})

describe('formatOptions', () => {
  it('prints one row per category', () => {
    const text = formatOptions(listOptions(defaultRegistry()))
    expect(text).toMatch(/Monorepo tools\s+turbo, nx/)
    expect(text).toMatch(/Backend frameworks\s+.*express/)
    expect(text).toMatch(/Frontend frameworks\s+.*next/)
    expect(text).toMatch(/Services\s+.*postgres/)
    expect(text).toMatch(/ORMs\s+drizzle, prisma/)
  })
})

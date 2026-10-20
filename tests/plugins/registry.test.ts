import { describe, expect, it } from 'vitest'
import { defaultRegistry, Registry } from '../../src/plugins/registry'
import type { FrameworkPlugin } from '../../src/plugins/types'

const next: FrameworkPlugin = {
  id: 'next',
  kind: 'frontend',
  label: 'Next',
  apiStyles: [],
  defaultPort: 3000,
  generate: () => ({}),
  dockerfile: () => '',
}

describe('Registry', () => {
  it('looks up frameworks by id and kind', () => {
    const r = new Registry()
    r.registerFramework(next)
    expect(r.framework('next', 'frontend')).toBe(next)
    expect(r.framework('next')).toBe(next)
    expect(r.framework('next', 'backend')).toBeUndefined()
    expect(r.frameworksOf('frontend')).toEqual([next])
    expect(r.frameworksOf('backend')).toEqual([])
  })
  it('registers monorepo tools and services', () => {
    const r = new Registry()
    const m = { id: 'turbo' as const, label: 'Turbo', generate: () => ({}) }
    const s = {
      id: 'postgres',
      label: 'PG',
      compose: () => ({ image: 'postgres' }),
      env: () => ({}),
    }
    r.registerMonorepo(m)
    r.registerService(s)
    expect(r.monorepoTool('turbo')).toBe(m)
    expect(r.service('postgres')).toBe(s)
    expect(r.service('x')).toBeUndefined()
  })
  it('defaultRegistry registers every built-in plugin', () => {
    const r = defaultRegistry()
    expect([...r.monorepo.keys()].sort()).toEqual(['nx', 'turbo'])
    expect(
      r
        .frameworksOf('frontend')
        .map((f) => f.id)
        .sort(),
    ).toEqual([
      'astro',
      'next',
      'nuxt',
      'react-router',
      'react-vite',
      'solid-start',
      'sveltekit',
      'tanstack-start',
      'vue-vite',
    ])
    expect(
      r
        .frameworksOf('backend')
        .map((f) => f.id)
        .sort(),
    ).toEqual(['express', 'fastify', 'hono', 'koa', 'nest'])
    expect([...r.uiPackages.keys()].sort()).toEqual(['react', 'solid', 'svelte', 'vue'])
    expect([...r.services.keys()].sort()).toEqual(['postgres', 'redis'])
  })
})

import { describe, expect, it } from 'vitest'
import { defaultRegistry } from '../../src/plugins/registry'
import type { AppContext } from '../../src/plugins/types'
import { VERSIONS } from '../../src/versions'

const api = { name: 'api', kind: 'backend' as const, framework: 'express', port: 4000 }
const billing = { name: 'billing-api', kind: 'backend' as const, framework: 'express', port: 4001 }
const frontends = defaultRegistry().frameworksOf('frontend')

function generate(id: string): Record<string, string> {
  const plugin = frontends.find((f) => f.id === id)
  if (!plugin) throw new Error(`no frontend ${id}`)
  const ctx: AppContext = {
    stack: { name: 'acme', monorepoTool: 'turbo', packageManager: 'pnpm', apps: [], services: [] },
    scope: '@acme',
    versions: VERSIONS,
    app: { name: 'web', kind: 'frontend', framework: id, uses: ['billing-api', 'api'], port: 3000 },
    // Reverse name order: generated code must not depend on manifest order.
    backends: [billing, api],
  }
  return plugin.generate(ctx)
}

describe.each(frontends.map((f) => f.id))('%s backend calls', (id) => {
  const tree = generate(id)
  const files = Object.entries(tree)

  it('declares clients sorted by backend name', () => {
    const entry = files.find(([, c]) => c.includes('export const apiClient'))
    expect(entry).toBeDefined()
    const api = entry?.[1] as string
    expect(api.indexOf('export const apiClient')).toBeLessThan(
      api.indexOf('export const billingApiClient'),
    )
  })
  it('bounds every /hello call with an abort signal', () => {
    const calls = files.flatMap(([, c]) => c.match(/\.GET\('\/hello'[^)]*\)/g) ?? [])
    expect(calls.length).toBeGreaterThanOrEqual(2)
    for (const call of calls) expect(call).toContain('signal')
    expect(files.some(([, c]) => c.includes('AbortSignal.timeout(3000)'))).toBe(true)
  })
  it('calls the backends in name order', () => {
    const src = files.map(([, c]) => c).join('\n')
    const first = src.indexOf("apiClient.GET('/hello'")
    expect(first).toBeGreaterThan(-1)
    expect(first).toBeLessThan(src.indexOf("billingApiClient.GET('/hello'"))
  })
})

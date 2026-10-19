import { describe, expect, it } from 'vitest'
import { helloCall, restClientFiles } from '../../src/engine/client'
import type { ProjectContext } from '../../src/plugins/types'
import { VERSIONS } from '../../src/versions'

const ctx: ProjectContext = {
  stack: { name: 'acme', monorepoTool: 'turbo', packageManager: 'pnpm', apps: [], services: [] },
  scope: '@acme',
  versions: VERSIONS,
}

describe('restClientFiles', () => {
  const tree = restClientFiles(ctx, { name: 'api', kind: 'backend', framework: 'express' })
  const pkg = JSON.parse(tree['packages/api-client/package.json'] as string)

  it('names the package and dev-depends on the backend app (build order only)', () => {
    expect(pkg.name).toBe('@acme/api-client')
    expect(pkg.devDependencies['@acme/api']).toBe('workspace:*')
    expect(pkg.dependencies['@acme/api']).toBeUndefined()
    expect(pkg.dependencies['openapi-fetch']).toBe(VERSIONS['openapi-fetch'])
  })
  it('builds from the backend openapi.json with tsdown, dual exports', () => {
    expect(pkg.scripts.build).toBe(
      'openapi-typescript ../../apps/api/openapi.json -o src/schema.d.ts && tsdown',
    )
    expect(pkg.devDependencies.tsdown).toBe(VERSIONS.tsdown)
    expect(pkg.devDependencies['openapi-typescript']).toBe(VERSIONS['openapi-typescript'])
    expect(pkg.exports['.'].import.default).toBe('./dist/index.js')
    expect(pkg.exports['.'].require.default).toBe('./dist/index.cjs')
    expect(pkg.exports['.'].import.types).toBe('./dist/index.d.ts')
    expect(pkg.exports['.'].require.types).toBe('./dist/index.d.cts')
    expect(pkg.main).toBe('./dist/index.cjs')
    expect(pkg.module).toBe('./dist/index.js')
    expect(pkg.types).toBe('./dist/index.d.ts')
    expect(tree['packages/api-client/tsdown.config.ts']).toContain('fixedExtension: false')
  })
  it('dev generates the schema before watching (it may start before the client build)', () => {
    expect(pkg.scripts.dev).toBe(
      'openapi-typescript ../../apps/api/openapi.json -o src/schema.d.ts && tsdown --watch --no-clean',
    )
  })
  it('exports createClient', () => {
    const src = tree['packages/api-client/src/index.ts'] as string
    expect(src).toContain('export function createClient')
    expect(src).toContain('createOpenApiClient<paths>')
  })
})

describe('helloCall', () => {
  it('passes the abort signal on one line when it fits', () => {
    expect(helloCall('api', 'apiClient')).toBe(
      "    hello('api', (signal) => apiClient.GET('/hello', { signal })),",
    )
  })
  it('wraps like biome past 100 columns', () => {
    const line = helloCall('billing-apiz', 'billingApizClient', "cache: 'no-store', signal")
    expect(line).toBe(
      "    hello('billing-apiz', (signal) =>\n      billingApizClient.GET('/hello', { cache: 'no-store', signal }),\n    ),",
    )
  })
})

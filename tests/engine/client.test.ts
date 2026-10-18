import { describe, expect, it } from 'vitest'
import { restClientFiles } from '../../src/engine/client'
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

  it('names the package and depends on the backend app', () => {
    expect(pkg.name).toBe('@acme/api-client')
    expect(pkg.dependencies['@acme/api']).toBe('workspace:*')
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
  })
  it('exports createClient', () => {
    const src = tree['packages/api-client/src/index.ts'] as string
    expect(src).toContain('export function createClient')
    expect(src).toContain('createOpenApiClient<paths>')
  })
})

import { describe, expect, it } from 'vitest'
import { uiPackageFiles } from '../../src/engine/ui'
import { reactVitePlugin } from '../../src/plugins/frontend/react-vite'
import type { AppContext } from '../../src/plugins/types'
import { VERSIONS } from '../../src/versions'

const base: AppContext = {
  stack: { name: 'acme', monorepoTool: 'turbo', packageManager: 'pnpm', apps: [], services: [] },
  scope: '@acme',
  versions: VERSIONS,
  app: { name: 'web', kind: 'frontend', framework: 'react-vite', port: 3000, uses: ['api'] },
  backends: [{ name: 'api', kind: 'backend', framework: 'express', port: 4000 }],
}

describe('reactVitePlugin', () => {
  it('has the contract metadata', () => {
    expect(reactVitePlugin).toMatchObject({
      id: 'react-vite',
      kind: 'frontend',
      apiStyles: [],
      defaultPort: 3000,
    })
  })

  it('wires a used backend', () => {
    const tree = reactVitePlugin.generate(base)
    expect(tree['apps/web/src/generated/api.ts']).toContain('@acme/api-client')
    expect(tree['apps/web/src/generated/api.ts']).toContain('VITE_API_URL')
    expect(tree['apps/web/src/generated/api.ts']).toContain('export const apiClient')
    expect(tree['apps/web/.env.example']).toContain('VITE_API_URL=http://localhost:4000')
    const pkg = JSON.parse(tree['apps/web/package.json'] as string)
    expect(pkg.dependencies['@acme/api-client']).toBe('workspace:*')
    expect(pkg.dependencies['@acme/ui-react']).toBe('workspace:*')
    expect(pkg.files).toEqual(['dist'])
    expect(tree['apps/web/src/App.tsx']).toContain("apiClient.GET('/hello')")
    expect(tree['apps/web/src/generated/api.ts']).toContain('as createApiClient }')
    expect(tree['apps/web/src/generated/api.ts']).toContain(
      "const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'",
    )
    expect(tree['apps/web/src/generated/api.ts']).toContain(
      'export const apiClient = createApiClient(apiUrl)',
    )
    expect(tree['apps/web/src/App.tsx']).toContain('async function loadApi()')
    expect(tree['apps/web/src/App.tsx']).toContain('load={loadApi}')
    expect(JSON.stringify(tree)).not.toMatch(/\{\{\w+\}\}/)
  })

  it('handles hyphenated backend names', () => {
    const tree = reactVitePlugin.generate({
      ...base,
      backends: [{ name: 'billing-api', kind: 'backend', framework: 'express', port: 4001 }],
    })
    expect(tree['apps/web/src/generated/api.ts']).toContain('billingApiClient')
    expect(tree['apps/web/src/generated/api.ts']).toContain('as createBillingApiClient }')
    expect(tree['apps/web/src/App.tsx']).toContain('async function loadBillingApi()')
    expect(tree['apps/web/src/generated/api.ts']).toContain('VITE_BILLING_API_URL')
    expect(tree['apps/web/.env.example']).toContain('VITE_BILLING_API_URL=http://localhost:4001')
  })

  it('without backends generates an import-free api.ts and a static card', () => {
    const tree = reactVitePlugin.generate({ ...base, backends: [] })
    expect(tree['apps/web/src/generated/api.ts']).not.toMatch(/import/)
    expect(tree['apps/web/src/App.tsx']).toContain('<Card')
    expect(tree['apps/web/.env.example']).toBe('')
  })

  it('dockerfile builds with pnpm and serves from nginx', () => {
    const d = reactVitePlugin.dockerfile(base)
    // pnpm (pinned via packageManager) is fetched in a layer cached on the root package.json only
    expect(d).toContain(
      'COPY package.json ./\nRUN pnpm --version\nCOPY . .\nRUN pnpm install --frozen-lockfile',
    )
    expect(d).toContain('pnpm --filter @acme/web... build')
    expect(d).toContain('FROM nginxinc/nginx-unprivileged:alpine')
    expect(d).toContain('ARG VITE_API_URL=http://localhost:4000')
  })
})

describe('uiPackageFiles', () => {
  const tree = uiPackageFiles(base, 'react')
  it('generates a dual-build ui-react package', () => {
    const pkg = JSON.parse(tree['packages/ui-react/package.json'] as string)
    expect(pkg.name).toBe('@acme/ui-react')
    expect(pkg.scripts.dev).toBe('tsdown --watch --no-clean')
    expect(pkg.files).toEqual(['dist'])
    expect(pkg.exports['.'].require.default).toBe('./dist/index.cjs')
    expect(tree['packages/ui-react/tsdown.config.ts']).toContain('fixedExtension: false')
    expect(tree['packages/ui-react/src/Card.tsx']).toContain('export function Card')
    expect(tree['packages/ui-react/tsconfig.json']).toContain('tsconfig.react.json')
  })
})

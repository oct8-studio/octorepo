import { describe, expect, it } from 'vitest'
import { vueVitePlugin } from '../../src/plugins/frontend/vue-vite'
import type { AppContext } from '../../src/plugins/types'
import { VERSIONS } from '../../src/versions'

const base: AppContext = {
  stack: { name: 'acme', monorepoTool: 'turbo', packageManager: 'pnpm', apps: [], services: [] },
  scope: '@acme',
  versions: VERSIONS,
  app: { name: 'web', kind: 'frontend', framework: 'vue-vite', port: 3000, uses: ['api'] },
  backends: [{ name: 'api', kind: 'backend', framework: 'express', port: 4000 }],
}

describe('vueVitePlugin', () => {
  it('has the contract metadata', () => {
    expect(vueVitePlugin).toMatchObject({
      id: 'vue-vite',
      kind: 'frontend',
      apiStyles: [],
      defaultPort: 3000,
      uiFamily: 'vue',
      rendering: 'spa',
    })
  })

  it('wires a used backend', () => {
    const tree = vueVitePlugin.generate(base)
    const api = tree['apps/web/src/generated/api.ts'] as string
    expect(api).toContain('@acme/api-client')
    expect(api).toContain('as createApiClient }')
    expect(api).toContain("const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'")
    expect(api).toContain('export const apiClient = createApiClient(apiUrl)')
    expect(tree['apps/web/.env.example']).toContain('VITE_API_URL=http://localhost:4000')
    const pkg = JSON.parse(tree['apps/web/package.json'] as string)
    expect(pkg.dependencies['@acme/api-client']).toBe('workspace:*')
    expect(pkg.dependencies['@acme/ui-vue']).toBe('workspace:*')
    expect(pkg.files).toEqual(['dist'])
    const app = tree['apps/web/src/App.vue'] as string
    expect(app).toContain("apiClient.GET('/hello')")
    expect(app).toContain("from '@acme/ui-vue'")
    expect(app).toContain('{{ apiMessage }}')
    expect(app).toContain('Backend unreachable')
    // Vue's own `{{ expr }}` interpolation is spaced; no unresolved `{{var}}` placeholders may remain.
    expect(JSON.stringify(tree)).not.toMatch(/\{\{\w+\}\}/)
  })

  it('handles hyphenated backend names', () => {
    const tree = vueVitePlugin.generate({
      ...base,
      backends: [{ name: 'billing-api', kind: 'backend', framework: 'express', port: 4001 }],
    })
    const api = tree['apps/web/src/generated/api.ts'] as string
    expect(api).toContain('billingApiClient')
    expect(api).toContain('as createBillingApiClient }')
    expect(api).toContain('VITE_BILLING_API_URL')
    expect(tree['apps/web/src/App.vue']).toContain('async function loadBillingApi()')
    expect(tree['apps/web/src/App.vue']).toContain('{{ billingApiMessage }}')
    expect(tree['apps/web/.env.example']).toContain('VITE_BILLING_API_URL=http://localhost:4001')
  })

  it('without backends generates an import-free api.ts and a static card', () => {
    const tree = vueVitePlugin.generate({ ...base, backends: [] })
    expect(tree['apps/web/src/generated/api.ts']).not.toMatch(/import/)
    expect(tree['apps/web/src/App.vue']).toContain('<Card')
    expect(tree['apps/web/src/App.vue']).not.toContain('generated/api')
    expect(tree['apps/web/.env.example']).toBe('')
  })

  it('dockerfile builds with pnpm and serves from nginx', () => {
    const d = vueVitePlugin.dockerfile(base)
    expect(d).toContain(
      'COPY package.json ./\nRUN pnpm --version\nCOPY . .\nRUN pnpm install --frozen-lockfile',
    )
    expect(d).toContain('pnpm --filter @acme/web... build')
    expect(d).toContain('FROM nginx:alpine')
    expect(d).toContain('ARG VITE_API_URL=http://localhost:4000')
    expect(d).toContain('EXPOSE 3000')
  })
})

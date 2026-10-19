import { describe, expect, it } from 'vitest'
import { nuxtPlugin } from '../../src/plugins/frontend/nuxt'
import type { AppContext } from '../../src/plugins/types'
import { VERSIONS } from '../../src/versions'

const api = { name: 'api', kind: 'backend' as const, framework: 'express', port: 4000 }
const billing = { name: 'billing-api', kind: 'backend' as const, framework: 'express', port: 4001 }
const ctx: AppContext = {
  stack: { name: 'acme', monorepoTool: 'turbo', packageManager: 'pnpm', apps: [], services: [] },
  scope: '@acme',
  versions: VERSIONS,
  app: {
    name: 'site',
    kind: 'frontend',
    framework: 'nuxt',
    uses: ['api', 'billing-api'],
    port: 3000,
  },
  backends: [api, billing],
}

describe('nuxtPlugin', () => {
  it('has the contract metadata', () => {
    expect(nuxtPlugin).toMatchObject({
      id: 'nuxt',
      kind: 'frontend',
      apiStyles: [],
      defaultPort: 3000,
      uiFamily: 'vue',
      rendering: 'ssr',
    })
  })
  const tree = nuxtPlugin.generate(ctx)
  it('generates server-only clients from <UPPER>_URL env', () => {
    const g = tree['apps/site/server/generated/api.ts'] as string
    expect(g).toContain("from '@acme/api-client'")
    expect(g).toContain('process.env.API_URL')
    expect(g).toContain('process.env.BILLING_API_URL')
    expect(g).toContain("from '@acme/billing-api-client'")
    expect(g).toContain('export const billingApiClient')
    expect(g).toContain('export const apiClient')
    // Sorted like Biome's organizeImports regardless of stack order.
    const reversed = nuxtPlugin.generate({ ...ctx, backends: [billing, api] })
    expect(reversed['apps/site/server/generated/api.ts']).toBe(g)
    expect(tree['apps/site/.env.example']).toBe(
      'API_URL=http://localhost:4000\nBILLING_API_URL=http://localhost:4001\n',
    )
  })
  it('calls backends from a server route and renders Card from ui-vue', () => {
    const r = tree['apps/site/server/api/hello.get.ts'] as string
    expect(r).toContain('defineEventHandler')
    expect(r).toContain("billingApiClient.GET('/hello', { signal })")
    expect(r).toContain('toCard')
    const p = tree['apps/site/app/app.vue'] as string
    expect(p).toContain("import { Card } from '@acme/ui-vue'")
    expect(p).toContain("useFetch('/api/hello'")
    expect(p).not.toContain('process.env')
  })
  it('generates package.json with workspace deps', () => {
    const pkg = JSON.parse(tree['apps/site/package.json'] as string)
    expect(pkg.name).toBe('@acme/site')
    expect(pkg.dependencies['@acme/ui-vue']).toBe('workspace:*')
    expect(pkg.dependencies['@acme/api-client']).toBe('workspace:*')
    expect(pkg.dependencies['@acme/billing-api-client']).toBe('workspace:*')
    expect(pkg.dependencies.nuxt).toBe(VERSIONS.nuxt)
    expect(pkg.scripts.dev).toContain('3000')
    for (const s of ['build', 'dev', 'lint', 'typecheck', 'test'])
      expect(pkg.scripts[s]).toBeTruthy()
  })
  it('keeps Nuxt build output out of git and biome', () => {
    // The root .gitignore/biome.json cover .nuxt and .output (and enable template-aware linting).
    expect(tree['apps/site/.gitignore']).toBeUndefined()
    expect(tree['apps/site/biome.json']).toBeUndefined()
    expect(tree['apps/site/nuxt.config.ts']).toContain('defineNuxtConfig')
  })
  it('generates a helper test and no unresolved placeholders', () => {
    expect(tree['apps/site/shared/cards.test.ts']).toBeDefined()
    expect(JSON.stringify(tree)).not.toMatch(/\{\{\w+\}\}/)
  })
  it('generates a Dockerfile running the Nitro output as non-root', () => {
    const d = nuxtPlugin.dockerfile(ctx)
    expect(d).toContain('COPY package.json ./\nRUN pnpm --version\nCOPY . .')
    expect(d).toContain('pnpm --filter @acme/site... build')
    expect(d).toContain('/repo/apps/site/.output ./.output')
    expect(d).toContain('USER node')
    expect(d).toContain('EXPOSE 3000')
    expect(d).toContain('CMD ["node",".output/server/index.mjs"]')
  })
  it('emits a static card and no client imports without backends', () => {
    const t = nuxtPlugin.generate({ ...ctx, app: { ...ctx.app, uses: [] }, backends: [] })
    const p = t['apps/site/app/app.vue'] as string
    expect(p).toContain("from '@acme/ui-vue'")
    expect(p).toContain('<Card title="site">Hello from site</Card>')
    expect(p).not.toContain('useFetch')
    expect(t['apps/site/server/api/hello.get.ts']).toBeUndefined()
    expect(t['apps/site/server/generated/api.ts']).toContain('export {}')
    expect(JSON.stringify(t)).not.toContain('-client')
    expect(t['apps/site/.env.example']).toBe('')
  })
})

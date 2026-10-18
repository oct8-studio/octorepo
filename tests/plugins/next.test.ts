import { describe, expect, it } from 'vitest'
import { nextPlugin } from '../../src/plugins/frontend/next'
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
    framework: 'next',
    uses: ['api', 'billing-api'],
    port: 3000,
  },
  backends: [api, billing],
}

describe('nextPlugin', () => {
  it('has the contract metadata', () => {
    expect(nextPlugin).toMatchObject({
      id: 'next',
      kind: 'frontend',
      apiStyles: [],
      defaultPort: 3000,
    })
  })
  const tree = nextPlugin.generate(ctx)
  it('generates next.config.ts for standalone monorepo output', () => {
    const c = tree['apps/site/next.config.ts'] as string
    expect(c).toContain("output: 'standalone'")
    expect(c).toContain('outputFileTracingRoot')
    expect(c).toContain("transpilePackages: ['@acme/ui-react']")
  })
  it('generates server-side clients from <UPPER>_URL env', () => {
    const g = tree['apps/site/src/generated/api.ts'] as string
    expect(g).toContain('process.env.API_URL')
    expect(g).toContain('process.env.BILLING_API_URL')
    expect(g).toContain("from '@acme/billing-api-client'")
    expect(g).toContain('export const billingApiClient')
    expect(g).toContain('export const apiClient')
    expect(tree['apps/site/.env.example']).toContain('BILLING_API_URL=http://localhost:4001')
  })
  it('generates a dynamic server page using Card', () => {
    const p = tree['apps/site/app/page.tsx'] as string
    expect(p).toContain("export const dynamic = 'force-dynamic'")
    expect(p).toContain("from '@acme/ui-react'")
    expect(p).toContain("cache: 'no-store'")
    expect(p).toContain('billingApiClient')
  })
  it('generates package.json with workspace deps', () => {
    const pkg = JSON.parse(tree['apps/site/package.json'] as string)
    expect(pkg.name).toBe('@acme/site')
    expect(pkg.dependencies['@acme/ui-react']).toBe('workspace:*')
    expect(pkg.dependencies['@acme/api-client']).toBe('workspace:*')
    expect(pkg.dependencies.next).toBe(VERSIONS.next)
    expect(pkg.scripts.dev).toContain('3000')
  })
  it('generates a helper test and no unresolved placeholders', () => {
    expect(tree['apps/site/src/lib/cards.test.ts']).toBeDefined()
    expect(JSON.stringify(tree)).not.toMatch(/\{\{\w+\}\}/)
  })
  it('generates a standalone Dockerfile', () => {
    const d = nextPlugin.dockerfile(ctx)
    expect(d).toContain('pnpm --filter @acme/site... build')
    expect(d).toContain('apps/site/.next/static')
    expect(d).toContain('CMD ["node","apps/site/server.js"]')
    expect(d).toContain('EXPOSE 3000')
  })
  it('emits no fetch helper or client imports without backends', () => {
    const t = nextPlugin.generate({ ...ctx, app: { ...ctx.app, uses: [] }, backends: [] })
    const p = t['apps/site/app/page.tsx'] as string
    expect(p).not.toContain('hello(')
    expect(p).not.toContain('BackendResult')
    expect(p).not.toContain('generated/api')
    expect(p).toContain("from '@acme/ui-react'")
    expect(t['apps/site/src/generated/api.ts']).toContain('export {}')
    expect(t['apps/site/.env.example']).toBe('')
  })
})

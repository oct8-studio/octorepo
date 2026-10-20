import { describe, expect, it } from 'vitest'
import { astroPlugin } from '../../src/plugins/frontend/astro'
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
    framework: 'astro',
    uses: ['api', 'billing-api'],
    port: 3000,
  },
  backends: [api, billing],
}

describe('astroPlugin', () => {
  it('has the contract metadata', () => {
    expect(astroPlugin).toMatchObject({
      id: 'astro',
      kind: 'frontend',
      apiStyles: [],
      defaultPort: 3000,
      rendering: 'ssr',
    })
    expect(astroPlugin.uiFamily).toBeUndefined()
  })
  const tree = astroPlugin.generate(ctx)
  it('generates a server-rendered config with the standalone node adapter', () => {
    const c = tree['apps/site/astro.config.ts'] as string
    expect(c).toContain("output: 'server'")
    expect(c).toContain("node({ mode: 'standalone' })")
    expect(c).toContain('port: 3000')
    expect(c).toContain('process.loadEnvFile()')
  })
  it('relies on the root biome.json (full .astro support, .astro ignored) — no nested config', () => {
    expect(tree['apps/site/biome.json']).toBeUndefined()
  })
  it('generates server-side clients from runtime <UPPER>_URL env', () => {
    const g = tree['apps/site/src/generated/api.ts'] as string
    expect(g).toContain("process.env.API_URL ?? 'http://localhost:4000'")
    expect(g).toContain('process.env.BILLING_API_URL')
    expect(g).not.toMatch(/import\.meta\.env\.\w+_URL/)
    expect(g).toContain("from '@acme/api-client'")
    expect(g).toContain("from '@acme/billing-api-client'")
    expect(g).toContain('export const billingApiClient')
    expect(g).toContain('export const apiClient')
    expect(tree['apps/site/.env.example']).toBe(
      'API_URL=http://localhost:4000\nBILLING_API_URL=http://localhost:4001\n',
    )
  })
  it('generates a page that fetches in frontmatter and renders the local Card', () => {
    const p = tree['apps/site/src/pages/index.astro'] as string
    expect(p).toContain("import Card from '../components/Card.astro'")
    expect(p).toContain("import { apiClient, billingApiClient } from '../generated/api'")
    expect(p).toContain(
      "hello('billing-api', (signal) => billingApiClient.GET('/hello', { signal }))",
    )
    expect(p).toContain('.map(toCard)')
    expect(p).not.toContain('ui-react')
    expect(tree['apps/site/src/components/Card.astro']).toContain('<slot />')
  })
  it('generates package.json with workspace deps and scripts', () => {
    const pkg = JSON.parse(tree['apps/site/package.json'] as string)
    expect(pkg.name).toBe('@acme/site')
    expect(pkg.type).toBe('module')
    expect(pkg.files).toEqual(['dist'])
    expect(pkg.dependencies['@acme/api-client']).toBe('workspace:*')
    expect(pkg.dependencies['@acme/billing-api-client']).toBe('workspace:*')
    expect(pkg.dependencies.astro).toBe(VERSIONS.astro)
    expect(pkg.dependencies['@astrojs/node']).toBe(VERSIONS['@astrojs/node'])
    expect(pkg.devDependencies['@astrojs/check']).toBe(VERSIONS['@astrojs/check'])
    expect(Object.keys(pkg.dependencies).some((d) => d.includes('ui-'))).toBe(false)
    expect(pkg.scripts).toMatchObject({
      dev: 'astro dev --port 3000 --ignore-lock',
      build: 'astro build',
      lint: 'biome check .',
      typecheck: 'astro check',
      test: 'vitest run',
    })
  })
  it('generates a helper test and no unresolved placeholders', () => {
    expect(tree['apps/site/src/lib/cards.test.ts']).toBeDefined()
    expect(JSON.stringify(tree)).not.toMatch(/\{\{\w+\}\}/)
  })
  it('generates a standalone Dockerfile running as non-root', () => {
    const d = astroPlugin.dockerfile(ctx)
    expect(d).toContain(
      'COPY package.json ./\nRUN pnpm --version\nCOPY . .\nRUN pnpm install --frozen-lockfile',
    )
    expect(d).toContain('pnpm --filter @acme/site... build')
    expect(d).toContain('pnpm deploy --filter @acme/site --prod --legacy /out')
    expect(d).toContain('ENV HOST=0.0.0.0')
    expect(d).toContain('USER node')
    expect(d).toContain('EXPOSE 3000')
    expect(d).toContain('CMD ["node","dist/server/entry.mjs"]')
  })
  it('emits no fetch helper or client imports without backends', () => {
    const t = astroPlugin.generate({ ...ctx, app: { ...ctx.app, uses: [] }, backends: [] })
    const p = t['apps/site/src/pages/index.astro'] as string
    expect(p).not.toContain('hello(')
    expect(p).not.toContain('BackendResult')
    expect(p).not.toContain('generated/api')
    expect(p).toContain('<Card title="site">Hello from site</Card>')
    expect(t['apps/site/src/generated/api.ts']).toContain('export {}')
    expect(t['apps/site/.env.example']).toBe('')
    const pkg = JSON.parse(t['apps/site/package.json'] as string)
    expect(Object.keys(pkg.dependencies).some((d) => d.endsWith('-client'))).toBe(false)
  })
})

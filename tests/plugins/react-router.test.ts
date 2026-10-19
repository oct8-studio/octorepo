import { describe, expect, it } from 'vitest'
import { reactRouterPlugin } from '../../src/plugins/frontend/react-router'
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
    framework: 'react-router',
    uses: ['api', 'billing-api'],
    port: 3000,
  },
  backends: [api, billing],
}

describe('reactRouterPlugin', () => {
  it('has the contract metadata', () => {
    expect(reactRouterPlugin).toMatchObject({
      id: 'react-router',
      kind: 'frontend',
      apiStyles: [],
      defaultPort: 3000,
      uiFamily: 'react',
      rendering: 'ssr',
    })
  })
  const tree = reactRouterPlugin.generate(ctx)
  it('generates framework-mode config, routes and root', () => {
    const config = tree['apps/site/react-router.config.ts'] as string
    expect(config).toContain('ssr: true')
    expect(config).toContain("buildDirectory: 'dist'")
    expect(tree['apps/site/vite.config.ts']).toContain('reactRouter()')
    expect(tree['apps/site/vite.config.ts']).toContain('port: 3000')
    expect(tree['apps/site/app/routes.ts']).toContain("index('routes/home.tsx')")
    expect(tree['apps/site/app/root.tsx']).toContain('<Scripts />')
    expect(tree['apps/site/vitest.config.ts']).not.toContain('reactRouter')
  })
  it('keeps typegen output out of biome via a nested config', () => {
    const b = JSON.parse(tree['apps/site/biome.json'] as string)
    expect(b.root).toBe(false)
    expect(b.extends).toBe('//')
    expect(b.files.includes).toEqual(expect.arrayContaining(['!**/dist', '!.react-router']))
    expect(b.$schema).toContain(VERSIONS['@biomejs/biome'])
  })
  it('generates server-side clients from <UPPER>_URL env', () => {
    const g = tree['apps/site/src/generated/api.ts'] as string
    expect(g).toContain('process.env.API_URL')
    expect(g).toContain('process.env.BILLING_API_URL')
    expect(g).toContain("from '@acme/api-client'")
    expect(g).toContain("from '@acme/billing-api-client'")
    expect(g).toContain('export const billingApiClient')
    expect(g).toContain('export const apiClient')
    expect(tree['apps/site/.env.example']).toBe(
      'API_URL=http://localhost:4000\nBILLING_API_URL=http://localhost:4001\n',
    )
  })
  it('fetches backends in a route loader and renders Cards', () => {
    const r = tree['apps/site/app/routes/home.tsx'] as string
    expect(r).toContain('export async function loader()')
    expect(r).toContain('Route.ComponentProps')
    expect(r).toContain("from '@acme/ui-react'")
    expect(r).toContain("hello('billing-api', () => billingApiClient.GET('/hello'))")
    expect(r).toContain("from '../../src/generated/api'")
  })
  it('generates package.json with workspace deps and scripts', () => {
    const pkg = JSON.parse(tree['apps/site/package.json'] as string)
    expect(pkg.name).toBe('@acme/site')
    expect(pkg.type).toBe('module')
    expect(pkg.files).toEqual(['dist'])
    expect(pkg.dependencies['@acme/ui-react']).toBe('workspace:*')
    expect(pkg.dependencies['@acme/api-client']).toBe('workspace:*')
    expect(pkg.dependencies['@acme/billing-api-client']).toBe('workspace:*')
    expect(pkg.dependencies['react-router']).toBe(VERSIONS['react-router'])
    expect(pkg.dependencies['@react-router/serve']).toBe(VERSIONS['@react-router/serve'])
    expect(pkg.devDependencies['@react-router/dev']).toBe(VERSIONS['@react-router/dev'])
    expect(Object.keys(pkg.scripts).sort()).toEqual(
      ['build', 'dev', 'lint', 'start', 'test', 'typecheck'].sort(),
    )
    expect(pkg.scripts.dev).toBe('react-router dev --port 3000')
    expect(pkg.scripts.typecheck).toBe('react-router typegen && tsc --noEmit')
  })
  it('generates a helper test and no unresolved placeholders', () => {
    expect(tree['apps/site/src/lib/cards.test.ts']).toBeDefined()
    expect(JSON.stringify(tree)).not.toMatch(/\{\{\w+\}\}/)
  })
  it('generates a Dockerfile serving the server build as a non-root user', () => {
    const d = reactRouterPlugin.dockerfile(ctx)
    expect(d).toContain(
      'COPY package.json ./\nRUN pnpm --version\nCOPY . .\nRUN pnpm install --frozen-lockfile',
    )
    expect(d).toContain('pnpm --filter @acme/site... build')
    expect(d).toContain('pnpm deploy --filter @acme/site --prod --legacy /out')
    expect(d).toContain('USER node')
    expect(d).toContain('EXPOSE 3000')
    expect(d).toContain('react-router-serve')
    expect(d).toContain('./dist/server/index.js')
    expect(d).not.toMatch(/\{\{\w+\}\}/)
  })
  it('emits a static card and no client imports without backends', () => {
    const t = reactRouterPlugin.generate({ ...ctx, app: { ...ctx.app, uses: [] }, backends: [] })
    const r = t['apps/site/app/routes/home.tsx'] as string
    expect(r).not.toContain('loader')
    expect(r).not.toContain('hello(')
    expect(r).not.toContain('generated/api')
    expect(r).not.toContain('+types')
    expect(r).toContain("from '@acme/ui-react'")
    expect(r).toContain('Hello from site')
    expect(t['apps/site/src/generated/api.ts']).toContain('export {}')
    expect(t['apps/site/.env.example']).toBe('')
    const pkg = JSON.parse(t['apps/site/package.json'] as string)
    expect(Object.keys(pkg.dependencies).filter((d) => d.endsWith('-client'))).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { tanstackStartPlugin } from '../../src/plugins/frontend/tanstack-start'
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
    framework: 'tanstack-start',
    uses: ['api', 'billing-api'],
    port: 3000,
  },
  backends: [api, billing],
}

describe('tanstackStartPlugin', () => {
  it('has the contract metadata', () => {
    expect(tanstackStartPlugin).toMatchObject({
      id: 'tanstack-start',
      kind: 'frontend',
      apiStyles: [],
      defaultPort: 3000,
      uiFamily: 'react',
      rendering: 'ssr',
    })
  })
  const tree = tanstackStartPlugin.generate(ctx)
  it('generates a vite config with Start, nitro and React plugins in order', () => {
    const c = tree['apps/site/vite.config.ts'] as string
    expect(c).toContain("from '@tanstack/react-start/plugin/vite'")
    expect(c).toContain("from 'nitro/vite'")
    expect(c).toContain('plugins: [tanstackStart(), nitro(), react()]')
    expect(c).toContain('port: 3000')
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
  it('calls backends from a server function in the route loader', () => {
    const r = tree['apps/site/src/routes/index.tsx'] as string
    expect(r).toContain("from '@acme/ui-react'")
    expect(r).toContain("createServerFn({ method: 'GET' })")
    expect(r).toContain('loader: () => loadCards()')
    expect(r).toContain("hello('billing-api', () => billingApiClient.GET('/hello'))")
    expect(r).toContain("from '../generated/api'")
  })
  it('generates package.json with workspace deps and pinned versions', () => {
    const pkg = JSON.parse(tree['apps/site/package.json'] as string)
    expect(pkg.name).toBe('@acme/site')
    expect(pkg.type).toBe('module')
    expect(pkg.files).toBeUndefined()
    expect(pkg.dependencies['@acme/ui-react']).toBe('workspace:*')
    expect(pkg.dependencies['@acme/billing-api-client']).toBe('workspace:*')
    expect(pkg.dependencies['@tanstack/react-start']).toBe(VERSIONS['@tanstack/react-start'])
    expect(pkg.devDependencies.nitro).toBe(VERSIONS.nitro)
    expect(pkg.devDependencies.vite).toBe(VERSIONS.vite)
    expect(Object.keys(pkg.scripts).sort()).toEqual(
      ['build', 'dev', 'lint', 'start', 'test', 'typecheck'].sort(),
    )
    expect(pkg.scripts.dev).toBe('vite dev --port 3000')
    expect(pkg.scripts.start).toBe('node .output/server/index.mjs')
  })
  it('keeps build output and the generated route tree out of biome and git', () => {
    // Covered by the root .gitignore/biome.json (.output, .tanstack, .nitro, routeTree.gen.ts).
    expect(tree['apps/site/biome.json']).toBeUndefined()
    expect(tree['apps/site/.gitignore']).toBeUndefined()
  })
  it('generates a helper test and no unresolved placeholders', () => {
    expect(tree['apps/site/src/lib/cards.test.ts']).toBeDefined()
    expect(tree['apps/site/src/routes/__root.tsx']).toContain("{ title: 'site' }")
    expect(JSON.stringify(tree)).not.toMatch(/\{\{\w+\}\}/)
  })
  it('generates a non-root Dockerfile that runs the nitro output', () => {
    const d = tanstackStartPlugin.dockerfile(ctx)
    expect(d).toContain(
      'COPY package.json ./\nRUN pnpm --version\nCOPY . .\nRUN pnpm install --frozen-lockfile',
    )
    expect(d).toContain('pnpm --filter @acme/site... build')
    expect(d).toContain('COPY --from=build --chown=node:node /repo/apps/site/.output ./.output')
    expect(d).toContain('USER node')
    expect(d).toContain('EXPOSE 3000')
    expect(d).toContain('CMD ["node",".output/server/index.mjs"]')
  })
  it('emits a static card and no client imports without backends', () => {
    const t = tanstackStartPlugin.generate({ ...ctx, app: { ...ctx.app, uses: [] }, backends: [] })
    const r = t['apps/site/src/routes/index.tsx'] as string
    expect(r).not.toContain('createServerFn')
    expect(r).not.toContain('hello(')
    expect(r).not.toContain('generated/api')
    expect(r).toContain('<Card title="site">Hello from site</Card>')
    expect(t['apps/site/src/generated/api.ts']).toContain('export {}')
    expect(t['apps/site/.env.example']).toBe('')
    expect(
      Object.keys(JSON.parse(t['apps/site/package.json'] as string).dependencies),
    ).not.toContain('@acme/api-client')
  })
})

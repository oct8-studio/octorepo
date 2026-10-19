import { describe, expect, it } from 'vitest'
import { solidStartPlugin } from '../../src/plugins/frontend/solid-start'
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
    framework: 'solid-start',
    uses: ['api', 'billing-api'],
    port: 3000,
  },
  backends: [api, billing],
}

describe('solidStartPlugin', () => {
  it('has the contract metadata', () => {
    expect(solidStartPlugin).toMatchObject({
      id: 'solid-start',
      kind: 'frontend',
      apiStyles: [],
      defaultPort: 3000,
      uiFamily: 'solid',
      rendering: 'ssr',
    })
  })
  const tree = solidStartPlugin.generate(ctx)
  it('builds with Vite, SolidStart and nitro', () => {
    const c = tree['apps/site/vite.config.ts'] as string
    expect(c).toContain("from 'nitro/vite'")
    expect(c).toContain('plugins: [solidStart(), nitro()]')
    expect(tree['apps/site/vitest.config.ts']).toContain("from 'vitest/config'")
    expect(tree['apps/site/tsconfig.json']).toContain('"jsxImportSource": "solid-js"')
    expect(tree['apps/site/tsconfig.json']).toContain('@acme/config/tsconfig.base.json')
    // Build output is covered by the root .gitignore/biome.json.
    expect(tree['apps/site/biome.json']).toBeUndefined()
    expect(tree['apps/site/.gitignore']).toBeUndefined()
  })
  it('generates server-side clients from <UPPER>_URL env', () => {
    const g = tree['apps/site/src/generated/api.ts'] as string
    expect(g).toContain("process.env.API_URL ?? 'http://localhost:4000'")
    expect(g).toContain("process.env.BILLING_API_URL ?? 'http://localhost:4001'")
    expect(g).toContain("from '@acme/api-client'")
    expect(g).toContain("from '@acme/billing-api-client'")
    expect(g).toContain('export const billingApiClient')
    expect(g).toContain('export const apiClient')
    expect(tree['apps/site/.env.example']).toBe(
      'API_URL=http://localhost:4000\nBILLING_API_URL=http://localhost:4001\n',
    )
  })
  it('calls the backends from a "use server" module', () => {
    const h = tree['apps/site/src/lib/hello.ts'] as string
    expect(h.startsWith("'use server'\n")).toBe(true)
    expect(h).toContain("import { apiClient, billingApiClient } from '../generated/api'")
    expect(h).toContain(
      "hello('billing-api', (signal) => billingApiClient.GET('/hello', { signal }))",
    )
    expect(h).toContain('return results.map(toCard)')
    // Two calls exceed 100 columns, so each goes on its own line (as biome formats it).
    expect(h).toContain("Promise.all([\n    hello('api'")
  })
  it('keeps a single call on one line when it fits in 100 columns', () => {
    const t = solidStartPlugin.generate({ ...ctx, backends: [api] })
    expect(t['apps/site/src/lib/hello.ts']).toContain(
      "  const results = await Promise.all([hello('api', (signal) => apiClient.GET('/hello', { signal }))])\n",
    )
  })
  it('splits a single call that does not fit', () => {
    const t = solidStartPlugin.generate({ ...ctx, backends: [billing] })
    expect(t['apps/site/src/lib/hello.ts']).toContain(
      "Promise.all([\n    hello('billing-api', (signal) => billingApiClient.GET('/hello', { signal })),\n  ])",
    )
  })
  it('renders cards from a deferred-stream query', () => {
    const p = tree['apps/site/src/routes/index.tsx'] as string
    expect(p).toContain("import { Card } from '@acme/ui-solid'")
    expect(p).toContain("query(() => getHellos(), 'hellos')")
    expect(p).toContain('{ deferStream: true }')
    expect(p).toContain('<For each={cards()}>')
  })
  it('generates package.json with workspace deps and nitro start', () => {
    const pkg = JSON.parse(tree['apps/site/package.json'] as string)
    expect(pkg.name).toBe('@acme/site')
    expect(pkg.type).toBe('module')
    expect(pkg.dependencies['@acme/ui-solid']).toBe('workspace:*')
    expect(pkg.dependencies['@acme/billing-api-client']).toBe('workspace:*')
    expect(pkg.dependencies['@solidjs/start']).toBe(VERSIONS['@solidjs/start'])
    expect(pkg.dependencies['solid-js']).toBe(VERSIONS['solid-js'])
    expect(pkg.devDependencies.nitro).toBe(VERSIONS.nitro)
    expect(pkg.devDependencies.vinxi).toBeUndefined()
    expect(pkg.scripts).toMatchObject({
      dev: 'vite dev --port 3000',
      build: 'vite build',
      start: 'node .output/server/index.mjs',
      lint: 'biome check .',
      typecheck: 'tsc --noEmit',
      test: 'vitest run',
    })
  })
  it('generates a helper test and no unresolved placeholders', () => {
    expect(tree['apps/site/src/lib/cards.test.ts']).toContain('unreachable')
    expect(tree['apps/site/src/app.tsx']).toContain('<Title>site</Title>')
    expect(JSON.stringify(tree)).not.toMatch(/\{\{\w+\}\}/)
  })
  it('generates a Dockerfile that runs the nitro output as a non-root user', () => {
    const d = solidStartPlugin.dockerfile(ctx)
    expect(d).toContain('COPY . .\nRUN pnpm install --frozen-lockfile')
    expect(d).toContain('pnpm --filter @acme/site... build')
    expect(d).toContain('COPY --from=build --chown=node:node /repo/apps/site/.output ./.output')
    expect(d).toContain('USER node')
    expect(d).toContain('EXPOSE 3000')
    expect(d).toContain('CMD ["node",".output/server/index.mjs"]')
  })
  it('renders a static card and no client code without backends', () => {
    const t = solidStartPlugin.generate({ ...ctx, app: { ...ctx.app, uses: [] }, backends: [] })
    const p = t['apps/site/src/routes/index.tsx'] as string
    expect(p).toContain("from '@acme/ui-solid'")
    expect(p).toContain('<Card title="site">Hello from site</Card>')
    expect(p).not.toContain('getHellos')
    expect(p).not.toContain('@solidjs/router')
    expect(t['apps/site/src/lib/hello.ts']).toBeUndefined()
    expect(t['apps/site/src/generated/api.ts']).toContain('export {}')
    expect(t['apps/site/.env.example']).toBe('')
    const pkg = JSON.parse(t['apps/site/package.json'] as string)
    expect(Object.keys(pkg.dependencies).some((d) => d.endsWith('-client'))).toBe(false)
  })
})

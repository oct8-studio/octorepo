import { describe, expect, it } from 'vitest'
import { sveltekitPlugin } from '../../src/plugins/frontend/sveltekit'
import type { AppContext } from '../../src/plugins/types'
import { VERSIONS } from '../../src/versions'

const api = { name: 'api', kind: 'backend' as const, framework: 'express', port: 4000 }
const billing = { name: 'billing-api', kind: 'backend' as const, framework: 'express', port: 4001 }
const ctx: AppContext = {
  stack: { name: 'acme', monorepoTool: 'turbo', packageManager: 'pnpm', apps: [], services: [] },
  scope: '@acme',
  versions: VERSIONS,
  app: {
    name: 'admin',
    kind: 'frontend',
    framework: 'sveltekit',
    uses: ['api', 'billing-api'],
    port: 3000,
  },
  backends: [billing, api],
}

describe('sveltekitPlugin', () => {
  it('has the contract metadata', () => {
    expect(sveltekitPlugin).toMatchObject({
      id: 'sveltekit',
      kind: 'frontend',
      apiStyles: [],
      defaultPort: 3000,
      uiFamily: 'svelte',
      rendering: 'ssr',
    })
  })
  const tree = sveltekitPlugin.generate(ctx)
  it('configures adapter-node in vite.config.ts (SvelteKit 3 has no svelte.config.js)', () => {
    const c = tree['apps/admin/vite.config.ts'] as string
    expect(c).toContain("import adapter from '@sveltejs/adapter-node'")
    expect(c).toContain('adapter: adapter()')
    expect(tree['apps/admin/svelte.config.js']).toBeUndefined()
  })
  it('declares runtime (non-static, private) <UPPER>_URL env vars with localhost fallbacks', () => {
    const e = tree['apps/admin/src/env.ts'] as string
    expect(e).toContain("from '@sveltejs/kit/env'")
    expect(e).toContain('API_URL: {')
    expect(e).toContain('BILLING_API_URL: {')
    expect(e).toContain("value || 'http://localhost:4001'")
    expect(e).not.toContain('static')
    expect(e).not.toContain('public')
  })
  it('generates server-side clients from $app/env/private', () => {
    const g = tree['apps/admin/src/generated/api.ts'] as string
    expect(g).toContain("import { API_URL, BILLING_API_URL } from '$app/env/private'")
    expect(g).toContain("from '@acme/api-client'")
    expect(g).toContain("from '@acme/billing-api-client'")
    expect(g).toContain('export const billingApiClient = createBillingApi(BILLING_API_URL)')
    expect(g).toContain('export const apiClient = createApi(API_URL)')
    expect(tree['apps/admin/.env.example']).toBe(
      'API_URL=http://localhost:4000\nBILLING_API_URL=http://localhost:4001\n',
    )
  })
  it('loads every backend in +page.server.ts and renders cards with ui-svelte', () => {
    const s = tree['apps/admin/src/routes/+page.server.ts'] as string
    expect(s).toContain("import { apiClient, billingApiClient } from '../generated/api'")
    expect(s).toContain(
      "hello('billing-api', (signal) => billingApiClient.GET('/hello', { signal }))",
    )
    expect(s).toContain('export const load: PageServerLoad')
    const p = tree['apps/admin/src/routes/+page.svelte'] as string
    expect(p).toContain("import { Card } from '@acme/ui-svelte'")
    expect(p).toContain('{#each data.cards as card (card.title)}')
  })
  it('generates package.json with bundled devDependencies only', () => {
    const pkg = JSON.parse(tree['apps/admin/package.json'] as string)
    expect(pkg.name).toBe('@acme/admin')
    expect(pkg.type).toBe('module')
    expect(pkg.dependencies).toBeUndefined()
    expect(pkg.devDependencies['@acme/ui-svelte']).toBe('workspace:*')
    expect(pkg.devDependencies['@acme/billing-api-client']).toBe('workspace:*')
    expect(pkg.devDependencies['@sveltejs/kit']).toBe(VERSIONS['@sveltejs/kit'])
    expect(pkg.devDependencies['@sveltejs/adapter-node']).toBe(VERSIONS['@sveltejs/adapter-node'])
    expect(Object.keys(pkg.scripts).sort()).toEqual(
      ['build', 'dev', 'lint', 'start', 'test', 'typecheck'].sort(),
    )
    expect(pkg.scripts.dev).toBe('vite dev --port 3000')
    expect(pkg.scripts.typecheck).toContain('svelte-kit sync')
  })
  it('keeps .svelte-kit and build/ out of git and biome', () => {
    // Covered by the root .gitignore/biome.json, which also enables full .svelte support.
    expect(tree['apps/admin/.gitignore']).toBeUndefined()
    expect(tree['apps/admin/biome.json']).toBeUndefined()
  })
  it('generates a helper test and no unresolved placeholders', () => {
    expect(tree['apps/admin/src/lib/cards.test.ts']).toBeDefined()
    expect(tree['apps/admin/src/app.html']).toContain('<title>admin</title>')
    expect(JSON.stringify(tree)).not.toMatch(/\{\{\w+\}\}/)
  })
  it('generates a Dockerfile that runs build/index.js as a non-root user', () => {
    const d = sveltekitPlugin.dockerfile(ctx)
    expect(d).toContain('COPY package.json ./\nRUN pnpm --version')
    expect(d).toContain('pnpm --filter @acme/admin... build')
    expect(d).toContain('COPY --from=build --chown=node:node /repo/apps/admin/build ./build')
    expect(d).toContain('USER node')
    expect(d).toContain('EXPOSE 3000')
    expect(d).toContain('CMD ["node","build/index.js"]')
  })
  it('emits no client imports, env file or server load without backends', () => {
    const t = sveltekitPlugin.generate({ ...ctx, app: { ...ctx.app, uses: [] }, backends: [] })
    const p = t['apps/admin/src/routes/+page.svelte'] as string
    expect(p).toContain("import { Card } from '@acme/ui-svelte'")
    expect(p).toContain('<Card title="admin">Hello from admin</Card>')
    expect(p).not.toContain('$props')
    expect(t['apps/admin/src/routes/+page.server.ts']).toBeUndefined()
    expect(t['apps/admin/src/env.ts']).toBeUndefined()
    expect(t['apps/admin/src/generated/api.ts']).toContain('export {}')
    expect(t['apps/admin/src/generated/api.ts']).not.toContain('import')
    expect(t['apps/admin/.env.example']).toBe('')
    expect(JSON.parse(t['apps/admin/package.json'] as string).devDependencies).not.toHaveProperty(
      '@acme/api-client',
    )
  })
})

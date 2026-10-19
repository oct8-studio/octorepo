import { describe, expect, it } from 'vitest'
import { koaPlugin } from '../../src/plugins/backend/koa'
import type { AppContext } from '../../src/plugins/types'
import { VERSIONS } from '../../src/versions'

const ctx: AppContext = {
  stack: { name: 'acme', monorepoTool: 'turbo', packageManager: 'pnpm', apps: [], services: [] },
  scope: '@acme',
  versions: VERSIONS,
  app: { name: 'api', kind: 'backend', framework: 'koa', port: 4000 },
  backends: [],
}

describe('koaPlugin', () => {
  it('has the contract metadata', () => {
    expect(koaPlugin).toMatchObject({
      id: 'koa',
      kind: 'backend',
      apiStyles: ['rest'],
      defaultPort: 4000,
    })
  })
  const tree = koaPlugin.generate(ctx)
  it('generates package.json depending on the types package', () => {
    const pkg = JSON.parse(tree['apps/api/package.json'] as string)
    expect(pkg.name).toBe('@acme/api')
    expect(pkg.files).toEqual(['dist', 'openapi.json'])
    expect(pkg.dependencies['@acme/types']).toBe('workspace:*')
    expect(pkg.dependencies.koa).toBe(VERSIONS.koa)
    expect(pkg.dependencies['@koa/router']).toBe(VERSIONS['@koa/router'])
    expect(pkg.devDependencies['@types/koa']).toBe(VERSIONS['@types/koa'])
  })
  it('generates app sources with substitutions', () => {
    expect(tree['apps/api/src/app.ts']).toContain('Hello from api')
    expect(tree['apps/api/src/app.ts']).toContain("from '@acme/types'")
    expect(tree['apps/api/tsconfig.json']).toContain('@acme/config/tsconfig.node.json')
    expect(tree['apps/api/.env.example']).toContain('PORT=4000')
    expect(tree['apps/api/scripts/write-openapi.ts']).toBeDefined()
    expect(tree['apps/api/src/app.test.ts']).toBeDefined()
    expect(JSON.stringify(tree)).not.toMatch(/\{\{\w+\}\}/)
  })
  it('loads .env for local dev without overriding the environment', () => {
    expect(tree['apps/api/src/main.ts']).toContain('process.loadEnvFile()')
    expect(tree['apps/api/src/main.ts']).toContain("code !== 'ENOENT'")
  })
  it('defaults CORS to the frontends that use it', () => {
    expect(tree['apps/api/src/app.ts']).toContain(
      "import { DEFAULT_CORS_ORIGINS } from './generated/cors.js'",
    )
    expect(tree['apps/api/src/app.ts']).toContain(
      "process.env.CORS_ORIGINS ?? DEFAULT_CORS_ORIGINS.join(',')",
    )
    expect(tree['apps/api/src/generated/cors.ts']).toContain(
      'export const DEFAULT_CORS_ORIGINS: string[] = []',
    )
    const used = koaPlugin.generate({
      ...ctx,
      stack: {
        ...ctx.stack,
        apps: [
          ctx.app,
          { name: 'web', kind: 'frontend', framework: 'next', port: 3000, uses: ['api'] },
          { name: 'admin', kind: 'frontend', framework: 'react-vite', port: 3001, uses: ['api'] },
          { name: 'other', kind: 'frontend', framework: 'next', port: 3002 },
        ],
      },
    })
    expect(used['apps/api/src/generated/cors.ts']).toContain(
      "export const DEFAULT_CORS_ORIGINS: string[] = ['http://localhost:3000', 'http://localhost:3001']",
    )
    expect(used['apps/api/.env.example']).toContain(
      '# CORS_ORIGINS=http://localhost:3000,http://localhost:3001',
    )
  })
  it('renders a hyphenated app name into valid code', () => {
    const hy = koaPlugin.generate({ ...ctx, app: { ...ctx.app, name: 'billing-api' } })
    expect(hy['apps/billing-api/src/app.ts']).toContain('Hello from billing-api')
    expect(hy['apps/billing-api/src/generated/cors.ts']).toBeDefined()
    expect(JSON.parse(hy['apps/billing-api/package.json'] as string).name).toBe('@acme/billing-api')
    expect(JSON.stringify(hy)).not.toMatch(/\{\{\w+\}\}/)
  })
  it('generates a pnpm multi-stage Dockerfile', () => {
    const d = koaPlugin.dockerfile(ctx)
    // pnpm (pinned via packageManager) is fetched in a layer cached on the root package.json only
    expect(d).toContain(
      'COPY package.json ./\nRUN pnpm --version\nCOPY . .\nRUN pnpm install --frozen-lockfile',
    )
    expect(d).toContain('EXPOSE 4000')
    expect(d).toContain('pnpm deploy')
    expect(d).toContain('pnpm --filter @acme/api... build')
    expect(d).toContain('CMD ["node","dist/main.js"]')
    expect(d).toContain('node:24-alpine')
    expect(d).toContain('USER node')
  })
})

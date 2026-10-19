import { describe, expect, it } from 'vitest'
import { fastifyPlugin } from '../../src/plugins/backend/fastify'
import type { AppContext } from '../../src/plugins/types'
import { VERSIONS } from '../../src/versions'

const ctx: AppContext = {
  stack: { name: 'acme', monorepoTool: 'turbo', packageManager: 'pnpm', apps: [], services: [] },
  scope: '@acme',
  versions: VERSIONS,
  app: { name: 'api', kind: 'backend', framework: 'fastify', port: 4000 },
  backends: [],
}

describe('fastifyPlugin', () => {
  it('has the contract metadata', () => {
    expect(fastifyPlugin).toMatchObject({
      id: 'fastify',
      kind: 'backend',
      apiStyles: ['rest'],
      defaultPort: 4000,
    })
  })
  const tree = fastifyPlugin.generate(ctx)
  it('generates package.json depending on the types package', () => {
    const pkg = JSON.parse(tree['apps/api/package.json'] as string)
    expect(pkg.name).toBe('@acme/api')
    expect(pkg.files).toEqual(['dist', 'openapi.json'])
    expect(pkg.dependencies['@acme/types']).toBe('workspace:*')
    expect(pkg.dependencies.fastify).toBe(VERSIONS.fastify)
    expect(pkg.dependencies['@fastify/cors']).toBe(VERSIONS['@fastify/cors'])
    expect(pkg.scripts.build).toBe('tsx scripts/write-openapi.ts && tsc -p tsconfig.build.json')
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
  it('renders a hyphenated app name without leftover placeholders', () => {
    const hyphen = fastifyPlugin.generate({
      ...ctx,
      app: { ...ctx.app, name: 'billing-api' },
    })
    expect(hyphen['apps/billing-api/src/app.ts']).toContain('Hello from billing-api')
    expect(hyphen['apps/billing-api/src/openapi.ts']).toContain("title: 'billing-api'")
    expect(JSON.parse(hyphen['apps/billing-api/package.json'] as string).name).toBe(
      '@acme/billing-api',
    )
    expect(JSON.stringify(hyphen)).not.toMatch(/\{\{\w+\}\}/)
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
    const used = fastifyPlugin.generate({
      ...ctx,
      stack: {
        ...ctx.stack,
        apps: [
          ctx.app,
          { name: 'web', kind: 'frontend', framework: 'next', port: 3000, uses: ['api'] },
          { name: 'other', kind: 'frontend', framework: 'next', port: 3002 },
        ],
      },
    })
    expect(used['apps/api/src/generated/cors.ts']).toContain(
      "export const DEFAULT_CORS_ORIGINS: string[] = ['http://localhost:3000']",
    )
    expect(used['apps/api/.env.example']).toContain('# CORS_ORIGINS=http://localhost:3000')
  })
  it('generates a pnpm multi-stage Dockerfile', () => {
    const d = fastifyPlugin.dockerfile(ctx)
    expect(d).toContain('EXPOSE 4000')
    expect(d).toContain('pnpm deploy')
    expect(d).toContain('pnpm --filter @acme/api... build')
    expect(d).toContain('CMD ["node","dist/main.js"]')
    expect(d).toContain('USER node')
  })
})

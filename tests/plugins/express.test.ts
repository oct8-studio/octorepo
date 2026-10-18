import { describe, expect, it } from 'vitest'
import { expressPlugin } from '../../src/plugins/backend/express'
import type { AppContext } from '../../src/plugins/types'
import { VERSIONS } from '../../src/versions'

const ctx: AppContext = {
  stack: { name: 'acme', monorepoTool: 'turbo', packageManager: 'pnpm', apps: [], services: [] },
  scope: '@acme',
  versions: VERSIONS,
  app: { name: 'api', kind: 'backend', framework: 'express', port: 4000 },
  backends: [],
}

describe('expressPlugin', () => {
  it('has the contract metadata', () => {
    expect(expressPlugin).toMatchObject({
      id: 'express',
      kind: 'backend',
      apiStyles: ['rest'],
      defaultPort: 4000,
    })
  })
  const tree = expressPlugin.generate(ctx)
  it('generates package.json depending on the types package', () => {
    const pkg = JSON.parse(tree['apps/api/package.json'] as string)
    expect(pkg.name).toBe('@acme/api')
    expect(pkg.dependencies['@acme/types']).toBe('workspace:*')
    expect(pkg.dependencies.express).toBe(VERSIONS.express)
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
  it('generates a pnpm multi-stage Dockerfile', () => {
    const d = expressPlugin.dockerfile(ctx)
    expect(d).toContain('EXPOSE 4000')
    expect(d).toContain('pnpm deploy')
    expect(d).toContain('pnpm --filter @acme/api... build')
    expect(d).toContain('CMD ["node","dist/main.js"]')
    expect(d).toContain('node:24-alpine')
  })
})

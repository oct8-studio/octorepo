import { describe, expect, it } from 'vitest'
import { nestPlugin } from '../../src/plugins/backend/nest'
import type { AppContext } from '../../src/plugins/types'
import { VERSIONS } from '../../src/versions'

const ctx: AppContext = {
  stack: { name: 'acme', monorepoTool: 'turbo', packageManager: 'pnpm', apps: [], services: [] },
  scope: '@acme',
  versions: VERSIONS,
  app: { name: 'core', kind: 'backend', framework: 'nest', port: 4000 },
  backends: [],
}

describe('nestPlugin', () => {
  it('has the contract metadata', () => {
    expect(nestPlugin).toMatchObject({
      id: 'nest',
      kind: 'backend',
      apiStyles: ['rest'],
      defaultPort: 4000,
    })
  })
  const tree = nestPlugin.generate(ctx)
  it('compiles to CommonJS with decorator metadata', () => {
    const ts = JSON.parse(tree['apps/core/tsconfig.json'] as string)
    expect(ts.compilerOptions.emitDecoratorMetadata).toBe(true)
    expect(ts.compilerOptions.experimentalDecorators).toBe(true)
    expect(['commonjs', 'node16', 'nodenext']).toContain(ts.compilerOptions.module)
    const pkg = JSON.parse(tree['apps/core/package.json'] as string)
    expect(pkg.type).toBeUndefined()
  })
  it('generates package.json with nest build and openapi writer', () => {
    const pkg = JSON.parse(tree['apps/core/package.json'] as string)
    expect(pkg.name).toBe('@acme/core')
    expect(pkg.files).toEqual(['dist', 'openapi.json'])
    expect(pkg.scripts.build).toContain('nest build')
    expect(pkg.scripts.test).toBe('vitest run')
    expect(pkg.scripts.build).toContain('node dist/write-openapi.js')
    expect(pkg.dependencies['@acme/types']).toBe('workspace:*')
    expect(pkg.dependencies['@nestjs/core']).toBe(VERSIONS['@nestjs/core'])
  })
  it('generates sources with substitutions', () => {
    expect(tree['apps/core/src/app.controller.ts']).toContain('Hello from core')
    expect(tree['apps/core/src/hello.ts']).toContain("from '@acme/types'")
    expect(tree['apps/core/.env.example']).toContain('PORT=4000')
    expect(tree['apps/core/test/app.test.ts']).toBeDefined()
    expect(tree['apps/core/src/write-openapi.ts']).toBeDefined()
    expect(JSON.stringify(tree)).not.toMatch(/\{\{\w+\}\}/)
  })
  it('generates a pnpm multi-stage Dockerfile', () => {
    const d = nestPlugin.dockerfile(ctx)
    // pnpm (pinned via packageManager) is fetched in a layer cached on the root package.json only
    expect(d).toContain(
      'COPY package.json ./\nRUN pnpm --version\nCOPY . .\nRUN pnpm install --frozen-lockfile',
    )
    expect(d).toContain('EXPOSE 4000')
    expect(d).toContain('pnpm --filter @acme/core... build')
    expect(d).toContain('CMD ["node","dist/main.js"]')
  })
})

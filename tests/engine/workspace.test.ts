import { describe, expect, it } from 'vitest'
import { workspaceFiles } from '../../src/engine/workspace'
import type { Manifest } from '../../src/model/stack'
import { parseManifest } from '../../src/model/stack'
import type { ProjectContext } from '../../src/plugins/types'
import { VERSIONS } from '../../src/versions'

const stack = {
  name: 'acme',
  monorepoTool: 'turbo' as const,
  packageManager: 'pnpm' as const,
  apps: [{ name: 'api', kind: 'backend' as const, framework: 'express', port: 4000 }],
  services: [],
}
const ctx: ProjectContext = { stack, scope: '@acme', versions: VERSIONS }
const manifest: Manifest = { ...stack, schemaVersion: 1, cliVersion: '0.1.0' }

describe('workspaceFiles', () => {
  const tree = workspaceFiles(ctx, manifest)
  it('types package is dual format', () => {
    const pkg = JSON.parse(tree['packages/types/package.json'] as string)
    expect(pkg.name).toBe('@acme/types')
    expect(pkg.exports).toEqual({
      '.': {
        import: { types: './dist/index.d.ts', default: './dist/index.js' },
        require: { types: './dist/index.d.cts', default: './dist/index.cjs' },
      },
    })
    expect([pkg.main, pkg.module, pkg.types]).toEqual([
      './dist/index.cjs',
      './dist/index.js',
      './dist/index.d.ts',
    ])
    expect(tree['packages/types/tsdown.config.ts']).toContain('fixedExtension: false')
    expect(tree['packages/types/src/index.ts']).toContain('HelloResponseSchema')
    // Watch without cleaning: dev runs alongside the upstream build that consumers wait for.
    expect(pkg.scripts.dev).toBe('tsdown --watch --no-clean')
  })
  it('config package exports tsconfigs', () => {
    const pkg = JSON.parse(tree['packages/config/package.json'] as string)
    expect(pkg.name).toBe('@acme/config')
    expect(Object.keys(pkg.exports)).toContain('./tsconfig.react.json')
  })
  it('manifest round-trips', () => {
    expect(parseManifest(JSON.parse(tree['.octorepo.json'] as string)).name).toBe('acme')
  })
  it('root files', () => {
    expect(tree['pnpm-workspace.yaml']).toContain('apps/*')
    expect(tree['.nvmrc']).toBe('24\n')
    expect(tree['.dockerignore']).toContain('**/node_modules')
    expect(tree['README.md']).toContain('pnpm --filter @acme/api dev')
    const root = JSON.parse(tree['package.json'] as string)
    expect(root.private).toBe(true)
    expect(root.packageManager).toMatch(/^pnpm@/)
    expect(root.scripts).toBeUndefined()
    expect(tree['.github/workflows/ci.yml']).toContain('pnpm install')
    expect(tree['README.md']).toContain('4000')
    expect(JSON.parse(tree['biome.json'] as string).files.includes).toContain('!**/openapi.json')
  })
})

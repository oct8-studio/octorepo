import { describe, expect, it } from 'vitest'
import { uiSveltePackageFiles } from '../../src/engine/ui-svelte'
import type { ProjectContext } from '../../src/plugins/types'
import { VERSIONS } from '../../src/versions'

const ctx: ProjectContext = {
  stack: { name: 'acme', monorepoTool: 'turbo', packageManager: 'pnpm', apps: [], services: [] },
  scope: '@acme',
  versions: VERSIONS,
}

describe('uiSveltePackageFiles', () => {
  const tree = uiSveltePackageFiles(ctx)
  const pkg = JSON.parse(tree['packages/ui-svelte/package.json'] as string)
  it('packages Svelte sources with @sveltejs/package under the svelte export condition', () => {
    expect(pkg.name).toBe('@acme/ui-svelte')
    expect(pkg.exports['.']).toEqual({ types: './dist/index.d.ts', svelte: './dist/index.js' })
    expect(pkg.files).toEqual(['dist'])
    expect(pkg.scripts.build).toBe('svelte-package --input src --output dist')
    expect(pkg.scripts.typecheck).toContain('svelte-check')
    expect(pkg.peerDependencies.svelte).toBe(VERSIONS.svelte)
    expect(pkg.devDependencies['@sveltejs/package']).toBe(VERSIONS['@sveltejs/package'])
  })
  it('exports a runes-mode Card with a title and children snippet', () => {
    const card = tree['packages/ui-svelte/src/Card.svelte'] as string
    expect(card).toContain('export interface CardProps')
    expect(card).toContain('children?: Snippet')
    expect(card).toContain('$props()')
    expect(card).toContain('{@render children?.()}')
    expect(tree['packages/ui-svelte/src/index.ts']).toContain(
      "default as Card } from './Card.svelte'",
    )
  })
  it('relies on the root biome.json for dist and the svelte-package staging dir', () => {
    expect(tree['packages/ui-svelte/biome.json']).toBeUndefined()
    expect(tree['packages/ui-svelte/.gitignore']).toBeUndefined()
  })
  it('only writes under packages/ui-svelte', () => {
    expect(Object.keys(tree).every((p) => p.startsWith('packages/ui-svelte/'))).toBe(true)
  })
})

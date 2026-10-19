import { describe, expect, it } from 'vitest'
import { uiSolidPackageFiles } from '../../src/engine/ui-solid'
import type { ProjectContext } from '../../src/plugins/types'
import { VERSIONS } from '../../src/versions'

const ctx: ProjectContext = {
  stack: { name: 'acme', monorepoTool: 'turbo', packageManager: 'pnpm', apps: [], services: [] },
  scope: '@acme',
  versions: VERSIONS,
}

describe('uiSolidPackageFiles', () => {
  const tree = uiSolidPackageFiles(ctx)
  it('ships source under the solid export condition', () => {
    const pkg = JSON.parse(tree['packages/ui-solid/package.json'] as string)
    expect(pkg.name).toBe('@acme/ui-solid')
    expect(pkg.exports['.']).toEqual({
      types: './src/index.ts',
      solid: './src/index.ts',
      default: './src/index.ts',
    })
    expect(pkg.files).toEqual(['src'])
    expect(pkg.peerDependencies['solid-js']).toBe(VERSIONS['solid-js'])
    expect(pkg.scripts).toMatchObject({ lint: 'biome check .', typecheck: 'tsc --noEmit' })
    expect(pkg.scripts.build).toBeUndefined()
  })
  it('exports a Solid Card component', () => {
    expect(tree['packages/ui-solid/src/index.ts']).toBe(
      "export { Card, type CardProps } from './Card'\n",
    )
    const card = tree['packages/ui-solid/src/Card.tsx'] as string
    expect(card).toContain("import type { JSX } from 'solid-js'")
    expect(card).toContain('export function Card(props: CardProps)')
    expect(card).toContain("'border-radius': '8px'")
    expect(tree['packages/ui-solid/tsconfig.json']).toContain('"jsxImportSource": "solid-js"')
  })
})

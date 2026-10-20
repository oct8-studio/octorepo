import { describe, expect, it } from 'vitest'
import { uiVuePackageFiles } from '../../src/engine/ui-vue'
import type { ProjectContext } from '../../src/plugins/types'
import { VERSIONS } from '../../src/versions'

const ctx: ProjectContext = {
  stack: { name: 'acme', monorepoTool: 'turbo', packageManager: 'pnpm', apps: [], services: [] },
  scope: '@acme',
  versions: VERSIONS,
}

describe('uiVuePackageFiles', () => {
  const tree = uiVuePackageFiles(ctx)
  it('generates a dual-build ui-vue package', () => {
    const pkg = JSON.parse(tree['packages/ui-vue/package.json'] as string)
    expect(pkg.name).toBe('@acme/ui-vue')
    expect(pkg.scripts.dev).toBe('tsdown --watch --no-clean')
    expect(pkg.files).toEqual(['dist'])
    expect(pkg.exports['.'].require.default).toBe('./dist/index.cjs')
    expect(pkg.peerDependencies).toEqual({ vue: VERSIONS.vue })
    expect(tree['packages/ui-vue/tsdown.config.ts']).toContain('fixedExtension: false')
  })
  it('exports a defineComponent/h() Card with a test', () => {
    expect(tree['packages/ui-vue/src/index.ts']).toContain('Card')
    expect(tree['packages/ui-vue/src/Card.ts']).toContain('defineComponent')
    expect(tree['packages/ui-vue/src/Card.ts']).toContain('h(')
    expect(tree['packages/ui-vue/src/Card.test.ts']).toContain('@vue/test-utils')
    expect(JSON.stringify(tree)).not.toMatch(/\{\{\w+\}\}/)
  })
})

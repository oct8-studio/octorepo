import { describe, expect, it } from 'vitest'
import { nxPlugin } from '../../src/plugins/monorepo/nx'
import { turboPlugin } from '../../src/plugins/monorepo/turbo'
import type { ProjectContext } from '../../src/plugins/types'
import { VERSIONS } from '../../src/versions'

const ctx = { stack: {}, scope: '@acme', versions: VERSIONS } as unknown as ProjectContext

describe('turbo plugin', () => {
  const tree = turboPlugin.generate(ctx)
  const turbo = JSON.parse(tree['turbo.json'])
  const pkg = JSON.parse(tree['package.json'])
  it('writes turbo.json tasks', () => {
    expect(turbo.tasks.build.dependsOn).toEqual(['^build'])
    expect(turbo.tasks.build.outputs).toEqual(['dist/**', '.next/**', '!.next/cache/**'])
    expect(turbo.tasks.typecheck.dependsOn).toEqual(['^build'])
    expect(turbo.tasks.test.dependsOn).toEqual(['^build'])
    expect(turbo.tasks.dev).toEqual({ cache: false, persistent: true })
    expect(turbo.tasks.lint).toBeDefined()
  })
  it('writes root scripts and devDependency', () => {
    expect(pkg.scripts.build).toBe('turbo run build')
    expect(pkg.devDependencies.turbo).toBe(VERSIONS.turbo)
    expect(Object.keys(tree).sort()).toEqual(['package.json', 'turbo.json'])
  })
  it('exposes affected ci build command', () => {
    expect(turboPlugin.ciBuildCommand).toBe('pnpm turbo run build --affected')
  })
})

describe('nx plugin', () => {
  const tree = nxPlugin.generate(ctx)
  const nx = JSON.parse(tree['nx.json'])
  const pkg = JSON.parse(tree['package.json'])
  it('writes nx.json targetDefaults', () => {
    expect(nx.targetDefaults.build.dependsOn).toEqual(['^build'])
    expect(nx.targetDefaults.build.outputs).toEqual([
      '{projectRoot}/dist',
      '{projectRoot}/.next',
      '!{projectRoot}/.next/cache',
    ])
    expect(nx.targetDefaults.build.cache).toBe(true)
    expect(nx.targetDefaults.typecheck.dependsOn).toEqual(['^build'])
    expect(nx.targetDefaults.dev.cache).toBe(false)
    expect(nx.plugins).toBeUndefined()
  })
  it('writes root scripts, no project.json, no @nx/', () => {
    expect(pkg.scripts.build).toBe('nx run-many -t build')
    expect(pkg.devDependencies.nx).toBe(VERSIONS.nx)
    expect(Object.keys(tree).some((k) => /project\.json$/.test(k))).toBe(false)
    expect(tree['package.json']).not.toContain('@nx/')
  })
  it('exposes affected ci build command', () => {
    expect(nxPlugin.ciBuildCommand).toBe('pnpm nx affected -t build')
  })
})

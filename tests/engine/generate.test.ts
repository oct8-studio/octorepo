import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { generateProject } from '../../src/engine/generate'
import { CLI_VERSION } from '../../src/meta'
import type { StackConfig } from '../../src/model/stack'
import { parseManifest } from '../../src/model/stack'
import { defaultRegistry } from '../../src/plugins/registry'

const stack: StackConfig = {
  name: 'acme',
  monorepoTool: 'turbo',
  packageManager: 'pnpm',
  apps: [
    { name: 'web', kind: 'frontend', framework: 'react-vite', uses: ['api'], port: 3000 },
    { name: 'api', kind: 'backend', framework: 'express', apiStyle: 'rest', port: 4000 },
  ],
  services: ['postgres'],
}

describe('generateProject', () => {
  const tree = generateProject(stack, defaultRegistry())
  it('merges workspace, monorepo, clients, ui, apps and compose', () => {
    for (const key of [
      'apps/web/package.json',
      'apps/api/Dockerfile',
      'apps/web/Dockerfile',
      'packages/api-client/package.json',
      'packages/ui-react/package.json',
      'turbo.json',
      '.octorepo.json',
      'docker-compose.yml',
      '.env.example',
    ]) {
      expect(tree[key], key).toBeDefined()
    }
    const root = JSON.parse(tree['package.json'] as string)
    expect(root.scripts.build).toBe('turbo run build')
    expect(root.devDependencies.typescript).toBeDefined()
  })
  it('gives node-typed shared packages @types/node', () => {
    for (const p of ['packages/types/package.json', 'packages/api-client/package.json']) {
      expect(JSON.parse(tree[p] as string).devDependencies['@types/node'], p).toBeDefined()
    }
  })
  it('writes the manifest', () => {
    const m = parseManifest(JSON.parse(tree['.octorepo.json'] as string))
    expect(m.schemaVersion).toBe(1)
    expect(m.cliVersion).toBe(CLI_VERSION)
    expect(m.apps.map((a) => a.name)).toEqual(['web', 'api'])
  })
  it('wires the affected build into CI', () => {
    const ci = tree['.github/workflows/ci.yml'] as string
    expect(ci).toContain('fetch-depth: 0')
    expect(ci).toContain('pnpm turbo run build --affected')
    const nx = generateProject({ ...stack, monorepoTool: 'nx' }, defaultRegistry())
    expect(nx['.github/workflows/ci.yml']).toContain(
      'run: pnpm nx affected -t build --base=origin/main --head=HEAD',
    )
    expect(nx['nx.json']).toBeDefined()
    expect(nx['turbo.json']).toBeUndefined()
  })
  it('allows dependency builds in pnpm-workspace.yaml', () => {
    const ws = parse(tree['pnpm-workspace.yaml'] as string)
    expect(ws.strictDepBuilds).toBe(false)
    expect(ws.allowBuilds).toEqual({ esbuild: true })
  })
  it('sets each backend CORS_ORIGINS to the frontends', () => {
    expect(tree['apps/api/.env.example']).toContain('CORS_ORIGINS=http://localhost:3000\n')
  })
  it('generates ui-react only with a react frontend and one client per backend', () => {
    const backendOnly = generateProject(
      { ...stack, apps: [stack.apps[1] as StackConfig['apps'][number]], services: [] },
      defaultRegistry(),
    )
    expect(Object.keys(backendOnly).some((k) => k.startsWith('packages/ui-react/'))).toBe(false)
    expect(backendOnly['packages/api-client/package.json']).toBeDefined()
    expect(JSON.stringify(tree)).not.toMatch(/\{\{\w+\}\}/)
  })
})

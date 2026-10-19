import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMcpServer } from '../../src/mcp/server'
import type { StackConfig } from '../../src/model/stack'
import { defaultRegistry } from '../../src/plugins/registry'

const stack: StackConfig = {
  name: 'demo',
  monorepoTool: 'turbo',
  packageManager: 'pnpm',
  apps: [
    { name: 'web', kind: 'frontend', framework: 'react-vite', uses: ['api'] },
    { name: 'api', kind: 'backend', framework: 'express' },
  ],
  services: [],
}

interface ToolResult {
  isError?: boolean
  content: { type: string; text: string }[]
}

let cwd: string
let client: Client

async function call(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  return (await client.callTool({ name, arguments: args })) as ToolResult
}
// biome-ignore lint/suspicious/noExplicitAny: test helper over arbitrary tool JSON
const body = (r: ToolResult): any => JSON.parse(r.content[0]?.text ?? 'null')

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'octo-mcp-'))
  const server = createMcpServer(defaultRegistry(), { cwd })
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  client = new Client({ name: 'test', version: '0.0.0' })
  await Promise.all([server.connect(serverSide), client.connect(clientSide)])
})

describe('octorepo mcp server', () => {
  it('exposes exactly the six tools, each with an object input schema', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'add_app',
        'add_service',
        'create',
        'list_options',
        'read_manifest',
        'validate_stack',
      ].sort(),
    )
    for (const t of tools) {
      expect(t.inputSchema.type).toBe('object')
      expect(t.description).toBeTruthy()
    }
    const create = tools.find((t) => t.name === 'create')
    expect(create?.inputSchema.required).toEqual(expect.arrayContaining(['dir', 'stack']))
  })

  it('list_options returns the registry listing', async () => {
    const r = await call('list_options')
    expect(r.isError).toBeFalsy()
    expect(body(r).frameworks.backend.map((f: { id: string }) => f.id)).toContain('express')
  })

  it('validate_stack reports errors without writing anything', async () => {
    const r = await call('validate_stack', { ...stack, apps: [] })
    expect(r.isError).toBeFalsy()
    const out = body(r)
    expect(out.errors.map((e: { rule: string }) => e.rule)).toContain('at-least-one-app')
    expect(out).toHaveProperty('stack')
    expect(out).toHaveProperty('warnings')
    expect(out).toHaveProperty('fixes')
  })

  it('create writes the repo and returns the CLI --json result', async () => {
    const r = await call('create', { dir: 'repo', stack, install: false, git: false })
    expect(r.isError).toBeFalsy()
    const out = body(r)
    expect(out.root).toBe(join(cwd, 'repo'))
    expect(Object.keys(out).sort()).toEqual(['fixes', 'manual', 'root', 'warnings'])
    const manifest = JSON.parse(await readFile(join(cwd, 'repo', '.octorepo.json'), 'utf8'))
    expect(manifest.name).toBe('demo')
  })

  it('create resolves a relative ".." dir against the server cwd', async () => {
    const inner = join(cwd, 'inner')
    await mkdir(inner)
    const server = createMcpServer(defaultRegistry(), { cwd: inner })
    const [c, s] = InMemoryTransport.createLinkedPair()
    const other = new Client({ name: 'test', version: '0.0.0' })
    await Promise.all([server.connect(s), other.connect(c)])
    const { name: _name, ...noName } = stack
    const r = (await other.callTool({
      name: 'create',
      arguments: { dir: '../sibling', stack: noName, install: false, git: false },
    })) as ToolResult
    expect(r.isError).toBeFalsy()
    expect(existsSync(join(cwd, 'sibling', '.octorepo.json'))).toBe(true)
    // Like the CLI, the project name defaults to the directory name.
    const manifest = JSON.parse(await readFile(join(cwd, 'sibling', '.octorepo.json'), 'utf8'))
    expect(manifest.name).toBe('sibling')
  })

  it('create with a preset puts preset apps first and appends stack.apps', async () => {
    const r = await call('create', {
      dir: 'p',
      preset: 'api-platform',
      stack: {
        name: 'p',
        monorepoTool: 'turbo',
        apps: [{ name: 'jobs', kind: 'backend', framework: 'express' }],
      },
      install: false,
      git: false,
    })
    expect(r.isError).toBeFalsy()
    const m = JSON.parse(await readFile(join(cwd, 'p/.octorepo.json'), 'utf8'))
    expect(m.preset).toBe('api-platform')
    expect(m.apps.map((a: { name: string }) => a.name)).toEqual([
      'gateway',
      'users',
      'billing',
      'docs',
      'jobs',
    ])
  })

  it('create with a preset rejects a colliding app name and writes nothing', async () => {
    const r = await call('create', {
      dir: 'q',
      preset: 'saas',
      stack: {
        monorepoTool: 'turbo',
        apps: [{ name: 'api', kind: 'backend', framework: 'express' }],
      },
      install: false,
      git: false,
    })
    expect(r.isError).toBe(true)
    expect(r.content[0]?.text).toContain('collides with preset')
    expect(existsSync(join(cwd, 'q'))).toBe(false)
  })

  it('list_options includes the presets', async () => {
    expect(body(await call('list_options')).presets.map((p: { id: string }) => p.id)).toEqual([
      'saas',
      'api-platform',
    ])
  })

  it('create refuses a non-empty dir with the CLI message', async () => {
    await mkdir(join(cwd, 'full'))
    await writeFile(join(cwd, 'full', 'keep.txt'), 'x')
    const r = await call('create', { dir: 'full', stack, install: false, git: false })
    expect(r.isError).toBe(true)
    expect(r.content[0]?.text).toBe(
      `Directory ${join(cwd, 'full')} is not empty. Use --force to write into it anyway.`,
    )
    expect(existsSync(join(cwd, 'full', '.octorepo.json'))).toBe(false)
  })

  it('create refuses an invalid stack and writes nothing', async () => {
    const r = await call('create', { dir: 'bad', stack: { ...stack, apps: [] } })
    expect(r.isError).toBe(true)
    expect(r.content[0]?.text).toMatch(/^Invalid stack:/)
    expect(existsSync(join(cwd, 'bad'))).toBe(false)
  })

  it('read_manifest returns the manifest; add_app extends the repo', async () => {
    await call('create', { dir: 'repo', stack, install: false, git: false })
    const m = body(await call('read_manifest', { cwd: 'repo' }))
    expect(m).toMatchObject({ name: 'demo', schemaVersion: 1, monorepoTool: 'turbo' })

    const r = await call('add_app', {
      cwd: 'repo',
      app: { name: 'billing', kind: 'backend', framework: 'nest' },
      install: false,
    })
    expect(r.isError).toBeFalsy()
    expect(body(r).written).toEqual(
      expect.arrayContaining([expect.stringMatching(/apps\/billing\/package\.json$/)]),
    )
    const after = body(await call('read_manifest', { cwd: 'repo' }))
    expect(after.apps.map((a: { name: string }) => a.name)).toContain('billing')
  })

  it('add_service adds a service, then is a no-op for the same service', async () => {
    await call('create', { dir: 'repo', stack, install: false, git: false })
    const r = await call('add_service', { cwd: 'repo', service: 'mailpit' })
    expect(r.isError).toBeFalsy()
    const out = body(r)
    expect(Object.keys(out).sort()).toEqual(['fixes', 'message', 'warnings', 'written'])
    expect(out.written).toEqual(expect.arrayContaining([join(cwd, 'repo', 'docker-compose.yml')]))
    const m = body(await call('read_manifest', { cwd: 'repo' }))
    expect(m.services).toEqual(['mailpit'])
    const again = body(await call('add_service', { cwd: 'repo', service: 'mailpit' }))
    expect(again.written).toEqual([])
    expect(again.message).toMatch(/already/)
  })

  it('add_service refuses an unknown service like the CLI', async () => {
    await call('create', { dir: 'repo', stack, install: false, git: false })
    const r = await call('add_service', { cwd: 'repo', service: 'kafka' })
    expect(r.isError).toBe(true)
    expect(r.content[0]?.text).toMatch(/^Invalid stack:[\s\S]*Unknown service "kafka"/)
  })

  it('read_manifest outside a generated repo is an error result', async () => {
    const r = await call('read_manifest', { cwd: '.' })
    expect(r.isError).toBe(true)
    expect(r.content[0]?.text).toMatch(/No \.octorepo\.json found/)
  })
})

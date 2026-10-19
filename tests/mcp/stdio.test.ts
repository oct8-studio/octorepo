import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const tsx = fileURLToPath(new URL('../../node_modules/.bin/tsx', import.meta.url))

let child: ChildProcessWithoutNullStreams | undefined

afterAll(() => {
  child?.kill()
})

/** Spawns `octorepo mcp` over stdio and collects stdout lines until `count` JSON-RPC responses arrive. */
function exchange(messages: object[], count: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    child = spawn(tsx, ['src/cli.ts', 'mcp'], { cwd: repo, stdio: 'pipe' })
    const proc = child
    let buffer = ''
    const lines: string[] = []
    const timer = setTimeout(() => reject(new Error(`timed out; stdout so far: ${buffer}`)), 20_000)
    proc.on('error', reject)
    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', (chunk: string) => {
      buffer += chunk
      let nl = buffer.indexOf('\n')
      while (nl !== -1) {
        lines.push(buffer.slice(0, nl))
        buffer = buffer.slice(nl + 1)
        nl = buffer.indexOf('\n')
      }
      const responses = lines.filter((l) => l.includes('"id"'))
      if (responses.length >= count) {
        clearTimeout(timer)
        proc.kill()
        resolve(lines)
      }
    })
    for (const m of messages) proc.stdin.write(`${JSON.stringify(m)}\n`)
  })
}

describe('octorepo mcp over stdio', () => {
  it('answers initialize and tools/list with JSON-only stdout', async () => {
    const lines = await exchange(
      [
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'smoke', version: '0.0.0' },
          },
        },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      ],
      2,
    )
    // Any non-JSON stdout (logs, banners) would corrupt the protocol stream.
    const messages = lines.map((l) => JSON.parse(l))
    const init = messages.find((m) => m.id === 1)
    expect(init.result.serverInfo.name).toBeTruthy()
    const list = messages.find((m) => m.id === 2)
    expect(list.result.tools).toHaveLength(5)
  }, 30_000)
})

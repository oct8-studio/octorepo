import { createRequire } from 'node:module'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Nest relies on emitted decorator metadata, which vitest's transform does not produce, so this
// test runs against the compiled output (`pnpm test` builds first).
type Compiled = {
  createApp(): Promise<{
    listen(port: number): Promise<unknown>
    getHttpServer(): { address(): AddressInfo | string | null }
    close(): Promise<void>
  }>
}
const dist = createRequire(`${process.cwd()}/`)('./dist/app') as Compiled

let app: Awaited<ReturnType<Compiled['createApp']>>
let base = ''

beforeAll(async () => {
  process.env.CORS_ORIGINS = 'http://localhost:3000'
  app = await dist.createApp()
  await app.listen(0)
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`
})

afterAll(async () => {
  await app.close()
})

describe('{{name}}', () => {
  it('GET /hello', async () => {
    const res = await fetch(`${base}/hello`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ message: 'Hello from {{name}}' })
  })

  it('GET /health', async () => {
    const res = await fetch(`${base}/health`)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it('allows configured CORS origins only', async () => {
    const ok = await fetch(`${base}/hello`, { headers: { Origin: 'http://localhost:3000' } })
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:3000')
    const bad = await fetch(`${base}/hello`, { headers: { Origin: 'http://evil.test' } })
    expect(bad.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('sets Vary: Origin for allowed and disallowed origins', async () => {
    const ok = await fetch(`${base}/hello`, { headers: { Origin: 'http://localhost:3000' } })
    expect(ok.headers.get('vary')).toContain('Origin')
    const bad = await fetch(`${base}/hello`, { headers: { Origin: 'http://evil.test' } })
    expect(bad.headers.get('vary')).toContain('Origin')
  })

  it('answers allowed preflight with 204 and CORS headers', async () => {
    const res = await fetch(`${base}/hello`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:3000', 'Access-Control-Request-Method': 'GET' },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000')
    expect(res.headers.get('vary')).toContain('Origin')
  })
})

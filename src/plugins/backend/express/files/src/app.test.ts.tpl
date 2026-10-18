import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { buildOpenApiDocument } from './openapi.js'

let server: ReturnType<ReturnType<typeof createApp>['listen']>
let base = ''

beforeAll(async () => {
  process.env.CORS_ORIGINS = 'http://localhost:3000'
  server = createApp().listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
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

  it('documents its routes in OpenAPI', () => {
    expect(Object.keys(buildOpenApiDocument().paths ?? {})).toEqual(['/health', '/hello'])
  })
})

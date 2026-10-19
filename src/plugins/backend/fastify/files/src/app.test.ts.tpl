import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { buildOpenApiDocument } from './openapi.js'

let app: FastifyInstance
let base = ''

beforeAll(async () => {
  process.env.CORS_ORIGINS = 'http://localhost:3000'
  app = await createApp()
  base = await app.listen({ port: 0, host: '127.0.0.1' })
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

  it('answers allowed preflight with 204 and CORS headers', async () => {
    const res = await fetch(`${base}/hello`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:3000', 'Access-Control-Request-Headers': 'x-test' },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000')
    expect(res.headers.get('access-control-allow-headers')).toBe('x-test')
    expect(res.headers.get('vary')).toContain('Origin')
  })

  it('answers disallowed preflight without CORS headers but with Vary', async () => {
    const res = await fetch(`${base}/hello`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://evil.test' },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(res.headers.get('vary')).toContain('Origin')
  })

  it('documents its routes in OpenAPI', () => {
    expect(Object.keys(buildOpenApiDocument().paths)).toEqual(['/health', '/hello'])
  })
})

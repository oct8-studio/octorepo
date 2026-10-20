import { HelloResponseSchema } from '{{scope}}/types'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
{{dbImport}}import { DEFAULT_CORS_ORIGINS } from './generated/cors.js'

export function parseOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
}

const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  summary: 'Health check',
  responses: {
    200: {
      description: 'Service is healthy',
      content: { 'application/json': { schema: z.object({ status: z.literal('ok') }) } },
    },
  },
})

const helloRoute = createRoute({
  method: 'get',
  path: '/hello',
  summary: 'Hello message',
  responses: {
    200: {
      description: 'Greeting',
      content: { 'application/json': { schema: HelloResponseSchema } },
    },
  },
})

export function createApp() {
  const app = new OpenAPIHono()
  const origins = parseOrigins(process.env.CORS_ORIGINS ?? DEFAULT_CORS_ORIGINS.join(','))

  // hono/cors adds Vary: Origin for every non-wildcard origin policy.
  app.use(
    '*',
    cors({
      origin: (origin) => (origins.includes(origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  )

  app.openapi(healthRoute, (c) => c.json({ status: 'ok' as const }, 200))
  app.openapi(helloRoute, (c) =>
    c.json(HelloResponseSchema.parse({ message: 'Hello from {{name}}' }), 200),
  )

{{dbRoute}}  return app
}

export function buildOpenApiDocument() {
  return createApp().getOpenAPI31Document({
    openapi: '3.1.0',
    info: { title: '{{name}}', version: '0.0.0' },
  })
}

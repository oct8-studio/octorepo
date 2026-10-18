import { HelloResponseSchema } from '{{scope}}/types'
import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry()

  registry.registerPath({
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

  registry.registerPath({
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

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: '{{name}}', version: '0.0.0' },
  })
}

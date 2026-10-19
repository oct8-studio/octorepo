import { HelloResponseSchema } from '{{scope}}/types'
import { z } from 'zod'

const HealthResponseSchema = z.object({ status: z.literal('ok') })

function jsonResponse(description: string, schema: z.ZodType) {
  // OpenAPI 3.1 schemas are JSON Schema 2020-12 already, so drop the redundant $schema key.
  const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(schema)
  return { description, content: { 'application/json': { schema: jsonSchema } } }
}

export function buildOpenApiDocument() {
  return {
    openapi: '3.1.0',
    info: { title: '{{name}}', version: '0.0.0' },
    paths: {
      '/health': {
        get: {
          summary: 'Health check',
          responses: { '200': jsonResponse('Service is healthy', HealthResponseSchema) },
        },
      },
      '/hello': {
        get: {
          summary: 'Hello message',
          responses: { '200': jsonResponse('Greeting', HelloResponseSchema) },
        },
      },
    },
  }
}

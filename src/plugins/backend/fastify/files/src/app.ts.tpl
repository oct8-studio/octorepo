import cors from '@fastify/cors'
import { HelloResponseSchema } from '{{scope}}/types'
import Fastify, { type FastifyInstance } from 'fastify'
{{dbImport}}import { DEFAULT_CORS_ORIGINS } from './generated/cors.js'

export function parseOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
}

export async function createApp(): Promise<FastifyInstance> {
  const app = Fastify()
  const origins = parseOrigins(process.env.CORS_ORIGINS ?? DEFAULT_CORS_ORIGINS.join(','))

  // strictPreflight off: answer every OPTIONS with 204 like the other backends, even without
  // Access-Control-Request-Method.
  await app.register(cors, { origin: origins, strictPreflight: false })

  app.get('/health', async () => ({ status: 'ok' }))

  app.get('/hello', async () => HelloResponseSchema.parse({ message: 'Hello from {{name}}' }))

{{dbRoute}}  return app
}

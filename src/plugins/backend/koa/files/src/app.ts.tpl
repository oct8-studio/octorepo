import { HelloResponseSchema } from '{{scope}}/types'
import Router from '@koa/router'
import Koa from 'koa'
import { DEFAULT_CORS_ORIGINS } from './generated/cors.js'

export function parseOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
}

export function createApp(): Koa {
  const app = new Koa()
  const router = new Router()
  const origins = parseOrigins(process.env.CORS_ORIGINS ?? DEFAULT_CORS_ORIGINS.join(','))

  app.use(async (ctx, next) => {
    const origin = ctx.get('Origin')
    const preflight = ctx.method === 'OPTIONS'
    if (origin) ctx.vary('Origin')
    if (origin && origins.includes(origin)) {
      ctx.set('Access-Control-Allow-Origin', origin)
      if (preflight) {
        ctx.vary('Access-Control-Request-Headers')
        ctx.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
        ctx.set(
          'Access-Control-Allow-Headers',
          ctx.get('Access-Control-Request-Headers') || 'Content-Type,Authorization',
        )
      }
    }
    if (preflight) {
      ctx.status = 204
      return
    }
    await next()
  })

  router.get('/health', (ctx) => {
    ctx.body = { status: 'ok' }
  })

  router.get('/hello', (ctx) => {
    ctx.body = HelloResponseSchema.parse({ message: 'Hello from {{name}}' })
  })

  app.use(router.routes())

  return app
}

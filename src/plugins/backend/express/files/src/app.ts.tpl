import { HelloResponseSchema } from '{{scope}}/types'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
{{dbImport}}import { DEFAULT_CORS_ORIGINS } from './generated/cors.js'

export function parseOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
}

export function createApp(): Express {
  const app = express()
  const origins = parseOrigins(process.env.CORS_ORIGINS ?? DEFAULT_CORS_ORIGINS.join(','))

  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin
    const preflight = req.method === 'OPTIONS'
    if (origin) res.vary('Origin')
    if (origin && origins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      if (preflight) {
        res.vary('Access-Control-Request-Headers')
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
        res.setHeader(
          'Access-Control-Allow-Headers',
          req.headers['access-control-request-headers'] ?? 'Content-Type,Authorization',
        )
      }
    }
    if (preflight) {
      res.sendStatus(204)
      return
    }
    next()
  })

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  app.get('/hello', (_req, res) => {
    res.json(HelloResponseSchema.parse({ message: 'Hello from {{name}}' }))
  })

{{dbRoute}}  return app
}

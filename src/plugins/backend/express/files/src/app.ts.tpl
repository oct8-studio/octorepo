import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import { HelloResponseSchema } from '{{scope}}/types'

export function parseOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
}

export function createApp(): Express {
  const app = express()
  const origins = parseOrigins(process.env.CORS_ORIGINS)

  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin
    if (origin && origins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
      res.setHeader(
        'Access-Control-Allow-Headers',
        req.headers['access-control-request-headers'] ?? 'Content-Type,Authorization',
      )
    }
    if (req.method === 'OPTIONS') {
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

  return app
}

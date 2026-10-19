import 'reflect-metadata'
import type { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { DEFAULT_CORS_ORIGINS } from './generated/cors'

export function parseOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
}

export async function createApp(options: { logger?: false } = {}): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, options)
  const origins = parseOrigins(process.env.CORS_ORIGINS ?? DEFAULT_CORS_ORIGINS.join(','))
  app.enableCors({ origin: origins })
  return app
}

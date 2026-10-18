import 'reflect-metadata'
import type { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

export function parseOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
}

export async function createApp(options: { logger?: false } = {}): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, options)
  app.enableCors({ origin: parseOrigins(process.env.CORS_ORIGINS) })
  return app
}

import { IMAGES } from '../../../versions'
import type { ServicePlugin } from '../../types'

export const postgresPlugin: ServicePlugin = {
  id: 'postgres',
  label: 'PostgreSQL',
  compose: (ctx) => ({
    image: `postgres:${IMAGES.postgres}-alpine`,
    ports: ['127.0.0.1:5432:5432'],
    environment: {
      POSTGRES_USER: 'postgres',
      POSTGRES_PASSWORD: 'postgres',
      POSTGRES_DB: ctx.stack.name,
    },
    // Postgres 18+ images keep PGDATA under /var/lib/postgresql/<major>/docker.
    volumes: ['postgres-data:/var/lib/postgresql'],
    healthcheck: {
      test: ['CMD-SHELL', `pg_isready -U postgres -d ${ctx.stack.name}`],
      interval: '5s',
      timeout: '5s',
      retries: 10,
    },
  }),
  env: (ctx, host = 'postgres') => ({
    DATABASE_URL: `postgres://postgres:postgres@${host}:5432/${ctx.stack.name}`,
  }),
}

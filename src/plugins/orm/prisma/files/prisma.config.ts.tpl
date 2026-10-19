import { defineConfig } from 'prisma/config'
import { loadLocalEnv } from './src/env'

loadLocalEnv()

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Unset is fine for `prisma generate`; migrate commands need it.
  datasource: { url: process.env.DATABASE_URL },
})

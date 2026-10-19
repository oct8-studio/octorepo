import { describe, expect, it } from 'vitest'
import { drizzlePlugin } from '../../src/plugins/orm/drizzle'
import { prismaPlugin } from '../../src/plugins/orm/prisma'
import { backendDb } from '../../src/plugins/orm/shared'
import type { OrmPlugin, ProjectContext } from '../../src/plugins/types'
import { VERSIONS } from '../../src/versions'

const ctx = (orm?: 'drizzle' | 'prisma'): ProjectContext => ({
  stack: {
    name: 'acme',
    monorepoTool: 'turbo',
    packageManager: 'pnpm',
    apps: [{ name: 'api', kind: 'backend', framework: 'express', port: 4000 }],
    services: ['postgres'],
    ...(orm ? { orm } : {}),
  },
  scope: '@acme',
  versions: VERSIONS,
})

describe.each([
  ['drizzle', drizzlePlugin],
  ['prisma', prismaPlugin],
] as [string, OrmPlugin][])('%s plugin', (id, plugin) => {
  const tree = plugin.generate(ctx(id as 'drizzle' | 'prisma'))
  const pkg = JSON.parse(tree['packages/db/package.json'] as string)

  it('has the contract metadata', () => {
    expect(plugin.id).toBe(id)
    expect(plugin.migrateCommand).toEqual(['pnpm', 'run', 'db:migrate'])
  })
  it('generates a dual-built @acme/db package (R8) with the db scripts', () => {
    expect(pkg.name).toBe('@acme/db')
    expect(pkg.files).toEqual(['dist'])
    expect(pkg.exports['.'].require.default).toBe('./dist/index.cjs')
    expect(pkg.exports['.'].import.default).toBe('./dist/index.js')
    expect(tree['packages/db/tsdown.config.ts']).toContain("format: ['esm', 'cjs']")
    for (const s of ['build', 'dev', 'db:generate', 'db:migration', 'db:migrate', 'db:seed']) {
      expect(pkg.scripts[s], s).toBeDefined()
    }
    expect(pkg.dependencies.pg).toBe(VERSIONS.pg)
  })
  it('exports createDb and a greeting count, and seeds idempotently', () => {
    expect(tree['packages/db/src/index.ts']).toContain('export function createDb(url: string)')
    expect(tree['packages/db/src/index.ts']).toContain('export function countGreetings(db: Db)')
    const seed = tree['packages/db/src/seed.ts'] as string
    expect(seed).toContain("'Hello from the database'")
    expect(seed).toContain('=== 0')
    expect(tree['packages/db/src/env.ts']).toContain(
      'Missing environment variable DATABASE_URL (see .env.example)',
    )
  })
  it('writes local DATABASE_URL defaults for db:* scripts', () => {
    expect(tree['packages/db/.env.example']).toBe(
      'DATABASE_URL=postgres://postgres:postgres@localhost:5432/acme\n',
    )
    expect(tree['packages/db/.env']).toBe(tree['packages/db/.env.example'])
  })
  it('has a migrate image that migrates then seeds', () => {
    const df = tree['packages/db/Dockerfile'] as string
    expect(df).toMatch(/^FROM node:24-alpine\n/)
    expect(df).toContain('USER node\n')
    expect(df).toContain('ENV COREPACK_HOME=/opt/corepack')
    expect(df).toContain('COPY --chown=node:node . .')
    // Every RUN after USER node runs unprivileged.
    expect(df.indexOf('USER node')).toBeLessThan(df.indexOf('RUN pnpm install'))
    expect(df).toContain('RUN pnpm install --frozen-lockfile')
    expect(df).toContain('WORKDIR /repo/packages/db')
    expect(df).toContain('CMD ["sh", "-c", "pnpm run db:migrate && pnpm run db:seed"]')
  })
  it('leaves no template tokens', () => {
    expect(JSON.stringify(tree)).not.toMatch(/\{\{\w+\}\}/)
  })
})

describe('drizzle plugin', () => {
  const tree = drizzlePlugin.generate(ctx('drizzle'))
  it('uses drizzle-kit with committed SQL migrations', () => {
    expect(tree['packages/db/drizzle.config.ts']).toContain("out: './drizzle'")
    expect(tree['packages/db/drizzle.config.ts']).toContain("dialect: 'postgresql'")
    expect(tree['packages/db/drizzle/0000_init.sql']).toContain('CREATE TABLE "greeting"')
    const journal = JSON.parse(tree['packages/db/drizzle/meta/_journal.json'] as string)
    expect(journal.entries.map((e: { tag: string }) => e.tag)).toEqual(['0000_init'])
    expect(tree['packages/db/drizzle/meta/0000_snapshot.json']).toBeDefined()
    const pkg = JSON.parse(tree['packages/db/package.json'] as string)
    expect(pkg.scripts['db:migrate']).toBe('drizzle-kit migrate')
    expect(pkg.scripts['db:migration']).toBe('drizzle-kit generate')
    const biome = JSON.parse(tree['packages/db/biome.json'] as string)
    expect(biome.files.includes).toContain('!drizzle/meta')
    expect(pkg.dependencies['drizzle-orm']).toBe(VERSIONS['drizzle-orm'])
    expect(pkg.devDependencies['drizzle-kit']).toBe(VERSIONS['drizzle-kit'])
  })
  it('defines the greeting table', () => {
    expect(tree['packages/db/src/schema.ts']).toContain("pgTable('greeting'")
    expect(tree['packages/db/src/schema.ts']).toContain("message: text('message').notNull()")
  })
})

describe('prisma plugin', () => {
  const tree = prismaPlugin.generate(ctx('prisma'))
  const schema = tree['packages/db/prisma/schema.prisma'] as string
  it('uses the prisma-client generator into src/generated and the pg driver adapter', () => {
    expect(schema).toContain('provider = "prisma-client"')
    expect(schema).toContain('output   = "../src/generated/prisma"')
    expect(schema).toContain('@@map("greeting")')
    expect(tree['packages/db/prisma.config.ts']).toContain("from 'prisma/config'")
    expect(tree['packages/db/src/index.ts']).toContain('new PrismaPg({ connectionString: url })')
    expect(tree['packages/db/.gitignore']).toContain('src/generated')
  })
  it('commits the initial migration and keeps generated code out of biome', () => {
    expect(tree['packages/db/prisma/migrations/20261020000000_init/migration.sql']).toContain(
      'CREATE TABLE "greeting"',
    )
    expect(tree['packages/db/prisma/migrations/migration_lock.toml']).toContain(
      'provider = "postgresql"',
    )
    const biome = JSON.parse(tree['packages/db/biome.json'] as string)
    expect(biome).toMatchObject({ root: false, extends: '//' })
    expect(biome.files.includes).toEqual(expect.arrayContaining(['!src/generated', '!**/dist']))
  })
  it('regenerates the client on build and pins prisma 7', () => {
    const pkg = JSON.parse(tree['packages/db/package.json'] as string)
    expect(pkg.scripts.build).toBe('prisma generate && tsdown')
    expect(pkg.scripts['db:migrate']).toBe('prisma migrate deploy')
    expect(pkg.devDependencies.prisma).toMatch(/^7\.\d+\.\d+$/)
    expect(pkg.dependencies['@prisma/client']).toBe(VERSIONS['@prisma/client'])
    expect(pkg.dependencies['@prisma/adapter-pg']).toBe(VERSIONS['@prisma/adapter-pg'])
  })
  it('installs OpenSSL for the schema engine and allows its install scripts', () => {
    expect(tree['packages/db/Dockerfile']).toContain('RUN apk add --no-cache openssl\n')
    expect(prismaPlugin.allowBuilds).toEqual(['prisma', '@prisma/engines'])
  })
})

describe('backendDb', () => {
  it('is undefined without an ORM', () => {
    expect(backendDb(ctx())).toBeUndefined()
  })
  it('adds the workspace db package and a /db/health helper', () => {
    const db = backendDb(ctx('drizzle'))
    expect(db?.dependencies).toEqual({ '@acme/db': 'workspace:*' })
    expect(db?.file).toContain("from '@acme/db'")
    expect(db?.file).toContain('greetings: await countGreetings(db)')
    expect(db?.file).toContain("error: 'database unavailable'")
    expect(db?.file).toContain("console.error('GET /db/health failed:', e)")
    expect(db?.file).not.toContain('.message')
  })
})

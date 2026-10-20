import { describe, expect, it } from 'vitest'
import { expressPlugin } from '../../src/plugins/backend/express'
import { fastifyPlugin } from '../../src/plugins/backend/fastify'
import { honoPlugin } from '../../src/plugins/backend/hono'
import { koaPlugin } from '../../src/plugins/backend/koa'
import { nestPlugin } from '../../src/plugins/backend/nest'
import type { AppContext, FrameworkPlugin } from '../../src/plugins/types'
import { VERSIONS } from '../../src/versions'

const ctx = (framework: string, orm?: 'drizzle' | 'prisma'): AppContext => ({
  stack: {
    name: 'acme',
    monorepoTool: 'turbo',
    packageManager: 'pnpm',
    apps: [],
    services: orm ? ['postgres'] : [],
    ...(orm ? { orm } : {}),
  },
  scope: '@acme',
  versions: VERSIONS,
  app: { name: 'api', kind: 'backend', framework, port: 4000 },
  backends: [],
})

// Where each backend registers routes and how its relative imports are written.
const cases: [FrameworkPlugin, string, string][] = [
  [expressPlugin, 'src/app.ts', "import { dbHealth } from './db.js'"],
  [fastifyPlugin, 'src/app.ts', "import { dbHealth } from './db.js'"],
  [honoPlugin, 'src/app.ts', "import { dbHealth } from './db.js'"],
  [koaPlugin, 'src/app.ts', "import { dbHealth } from './db.js'"],
  [nestPlugin, 'src/app.module.ts', "import { DbController } from './db.controller'"],
]

const rows = cases.map(([plugin, routeFile, dbImport]) => ({
  id: plugin.id,
  plugin,
  routeFile,
  dbImport,
}))

describe.each(rows)('$id with an ORM', ({ plugin, routeFile, dbImport }) => {
  const tree = plugin.generate(ctx(plugin.id, 'prisma'))
  const pkg = JSON.parse(tree['apps/api/package.json'] as string)

  it('depends on @acme/db', () => {
    expect(pkg.dependencies['@acme/db']).toBe('workspace:*')
  })
  it('serves GET /db/health from src/db.ts', () => {
    expect(tree['apps/api/src/db.ts']).toContain("from '@acme/db'")
    expect(tree[`apps/api/${routeFile}`]).toContain(dbImport)
    const routes =
      plugin.id === 'nest' ? tree['apps/api/src/db.controller.ts'] : tree[`apps/api/${routeFile}`]
    expect(routes).toContain('db')
    expect(routes).toContain('health')
    expect(routes).toContain('await dbHealth()')
    expect(JSON.stringify(tree)).not.toMatch(/\{\{\w+\}\}/)
  })
})

describe.each(rows)('$id without an ORM', ({ plugin, routeFile }) => {
  const tree = plugin.generate(ctx(plugin.id))
  it('has no db dependency, file or route', () => {
    const pkg = JSON.parse(tree['apps/api/package.json'] as string)
    expect(pkg.dependencies['@acme/db']).toBeUndefined()
    expect(tree['apps/api/src/db.ts']).toBeUndefined()
    expect(tree[`apps/api/${routeFile}`]).not.toContain('db')
    expect(JSON.stringify(tree)).not.toMatch(/\{\{\w+\}\}/)
  })
})

it('nest keeps /db/health out of openapi.json like the other backends', () => {
  const tree = nestPlugin.generate(ctx('nest', 'drizzle'))
  expect(tree['apps/api/src/db.controller.ts']).toContain('@ApiExcludeController()')
  expect(tree['apps/api/src/app.module.ts']).toContain(
    '@Module({ controllers: [AppController, DbController] })',
  )
})

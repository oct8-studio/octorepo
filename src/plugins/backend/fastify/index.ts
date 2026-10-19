import { backendCorsDefaults } from '../../../engine/cors'
import { nodeServiceDockerfile } from '../../../engine/docker'
import { json, readPluginFiles } from '../../../engine/tree'
import { backendDb } from '../../orm/shared'
import type { AppContext, FileTree, FrameworkPlugin } from '../../types'

/** `GET /db/health` (stacks with an ORM), spliced into src/app.ts. */
const DB_ROUTE = `  app.get('/db/health', async (_req, reply) => {
    const { status, body } = await dbHealth()
    return reply.code(status).send(body)
  })

`

function generate(ctx: AppContext): FileTree {
  const { app, scope, versions: v } = ctx
  const dir = `apps/${app.name}`
  const cors = backendCorsDefaults(ctx)
  const db = backendDb(ctx)
  const files = readPluginFiles(new URL('./', import.meta.url), {
    name: app.name,
    scope,
    port: String(app.port),
    corsEnv: cors.envLine,
    dbImport: db ? "import { dbHealth } from './db.js'\n" : '',
    dbRoute: db ? DB_ROUTE : '',
  })
  const tree: FileTree = {}
  for (const [path, content] of Object.entries(files)) tree[`${dir}/${path}`] = content
  tree[`${dir}/src/generated/cors.ts`] = cors.file
  if (db) tree[`${dir}/src/db.ts`] = db.file
  tree[`${dir}/package.json`] = json({
    name: `${scope}/${app.name}`,
    version: '0.0.0',
    private: true,
    type: 'module',
    files: ['dist', 'openapi.json'],
    scripts: {
      dev: 'tsx watch src/main.ts',
      build: 'tsx scripts/write-openapi.ts && tsc -p tsconfig.build.json',
      start: 'node dist/main.js',
      lint: 'biome check src scripts',
      typecheck: 'tsc --noEmit',
      test: 'vitest run',
    },
    dependencies: {
      [`${scope}/types`]: 'workspace:*',
      ...db?.dependencies,
      '@fastify/cors': v['@fastify/cors'],
      fastify: v.fastify,
      zod: v.zod,
    },
    devDependencies: {
      [`${scope}/config`]: 'workspace:*',
      '@biomejs/biome': v['@biomejs/biome'],
      '@types/node': v['@types/node'],
      tsx: v.tsx,
      typescript: v.typescript,
      vitest: v.vitest,
    },
  })
  return tree
}

export const fastifyPlugin: FrameworkPlugin = {
  id: 'fastify',
  kind: 'backend',
  label: 'Fastify',
  apiStyles: ['rest'],
  defaultPort: 4000,
  generate,
  dockerfile: (ctx) => nodeServiceDockerfile(ctx, { startCmd: ['node', 'dist/main.js'] }),
}

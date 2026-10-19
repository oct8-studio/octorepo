import { backendCorsDefaults } from '../../../engine/cors'
import { nodeServiceDockerfile } from '../../../engine/docker'
import { backendEnv } from '../../../engine/env'
import { json, readPluginFiles } from '../../../engine/tree'
import { backendDb } from '../../orm/shared'
import type { AppContext, FileTree, FrameworkPlugin } from '../../types'

/** `GET /db/health` (stacks with an ORM). Kept out of openapi.json like the other backends'. */
const DB_CONTROLLER = `import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { type DbHealth, dbHealth } from './db'

@ApiExcludeController()
@Controller('db')
export class DbController {
  @Get('health')
  async health(): Promise<DbHealth> {
    const { status, body } = await dbHealth()
    if (status !== 200) throw new ServiceUnavailableException(body)
    return body
  }
}
`

function generate(ctx: AppContext): FileTree {
  const { app, scope, versions: v } = ctx
  const dir = `apps/${app.name}`
  const cors = backendCorsDefaults(ctx)
  const db = backendDb(ctx)
  const env = backendEnv(ctx)
  const files = readPluginFiles(new URL('./', import.meta.url), {
    name: app.name,
    scope,
    port: String(app.port),
    corsEnv: cors.envLine,
    dbImport: db ? "import { DbController } from './db.controller'\n" : '',
    controllers: db ? 'AppController, DbController' : 'AppController',
  })
  const tree: FileTree = {}
  for (const [path, content] of Object.entries(files)) tree[`${dir}/${path}`] = content
  tree[`${dir}/src/generated/cors.ts`] = cors.file
  tree[`${dir}/src/env.ts`] = env.file
  if (db) {
    tree[`${dir}/src/db.ts`] = db.file
    tree[`${dir}/src/db.controller.ts`] = DB_CONTROLLER
  }
  // No "type": "module": the app compiles to CommonJS and consumes the types package via its `require` export.
  // `files` is required: `pnpm deploy --prod --legacy` otherwise honors .gitignore and drops dist/ (R12).
  tree[`${dir}/package.json`] = json({
    name: `${scope}/${app.name}`,
    version: '0.0.0',
    private: true,
    files: ['dist', 'openapi.json'],
    scripts: {
      dev: 'nest start --watch',
      build: 'nest build && node dist/write-openapi.js',
      start: 'node dist/main.js',
      lint: 'biome check .',
      typecheck: 'tsc --noEmit',
      test: 'vitest run',
    },
    dependencies: {
      [`${scope}/types`]: 'workspace:*',
      ...db?.dependencies,
      '@nestjs/common': v['@nestjs/common'],
      '@nestjs/core': v['@nestjs/core'],
      '@nestjs/platform-express': v['@nestjs/platform-express'],
      '@nestjs/swagger': v['@nestjs/swagger'],
      'reflect-metadata': v['reflect-metadata'],
      rxjs: v.rxjs,
      zod: v.zod,
    },
    devDependencies: {
      [`${scope}/config`]: 'workspace:*',
      '@biomejs/biome': v['@biomejs/biome'],
      '@nestjs/cli': v['@nestjs/cli'],
      '@types/node': v['@types/node'],
      typescript: v.typescript,
      vitest: v.vitest,
    },
  })
  return tree
}

export const nestPlugin: FrameworkPlugin = {
  id: 'nest',
  kind: 'backend',
  label: 'NestJS',
  apiStyles: ['rest'],
  defaultPort: 4000,
  generate,
  dockerfile: (ctx) => nodeServiceDockerfile(ctx, { startCmd: ['node', 'dist/main.js'] }),
}

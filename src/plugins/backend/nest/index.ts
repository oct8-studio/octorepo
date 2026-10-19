import { backendCorsDefaults } from '../../../engine/cors'
import { nodeServiceDockerfile } from '../../../engine/docker'
import { json, readPluginFiles } from '../../../engine/tree'
import type { AppContext, FileTree, FrameworkPlugin } from '../../types'

function generate(ctx: AppContext): FileTree {
  const { app, scope, versions: v } = ctx
  const dir = `apps/${app.name}`
  const cors = backendCorsDefaults(ctx)
  const files = readPluginFiles(new URL('./', import.meta.url), {
    name: app.name,
    scope,
    port: String(app.port),
    corsEnv: cors.envLine,
  })
  const tree: FileTree = {}
  for (const [path, content] of Object.entries(files)) tree[`${dir}/${path}`] = content
  tree[`${dir}/src/generated/cors.ts`] = cors.file
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
      '@nestjs/common': v['@nestjs/common'],
      '@nestjs/core': v['@nestjs/core'],
      '@nestjs/platform-express': v['@nestjs/platform-express'],
      '@nestjs/swagger': v['@nestjs/swagger'],
      'reflect-metadata': v['reflect-metadata'],
      rxjs: v.rxjs,
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

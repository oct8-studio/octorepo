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
      '@hono/node-server': v['@hono/node-server'],
      '@hono/zod-openapi': v['@hono/zod-openapi'],
      hono: v.hono,
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

export const honoPlugin: FrameworkPlugin = {
  id: 'hono',
  kind: 'backend',
  label: 'Hono',
  apiStyles: ['rest'],
  defaultPort: 4000,
  generate,
  dockerfile: (ctx) => nodeServiceDockerfile(ctx, { startCmd: ['node', 'dist/main.js'] }),
}

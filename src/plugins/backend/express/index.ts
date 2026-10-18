import { nodeServiceDockerfile } from '../../../engine/docker'
import { json, readPluginFiles } from '../../../engine/tree'
import type { AppContext, FileTree, FrameworkPlugin } from '../../types'

function generate(ctx: AppContext): FileTree {
  const { app, scope, versions: v } = ctx
  const dir = `apps/${app.name}`
  const files = readPluginFiles(new URL('./', import.meta.url), {
    name: app.name,
    scope,
    port: String(app.port),
  })
  const tree: FileTree = {}
  for (const [path, content] of Object.entries(files)) tree[`${dir}/${path}`] = content
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
      '@asteasolutions/zod-to-openapi': v['@asteasolutions/zod-to-openapi'],
      express: v.express,
      zod: v.zod,
    },
    devDependencies: {
      [`${scope}/config`]: 'workspace:*',
      '@biomejs/biome': v['@biomejs/biome'],
      '@types/express': v['@types/express'],
      '@types/node': v['@types/node'],
      tsx: v.tsx,
      typescript: v.typescript,
      vitest: v.vitest,
    },
  })
  return tree
}

export const expressPlugin: FrameworkPlugin = {
  id: 'express',
  kind: 'backend',
  label: 'Express',
  apiStyles: ['rest'],
  defaultPort: 4000,
  generate,
  dockerfile: (ctx) => nodeServiceDockerfile(ctx, { startCmd: ['node', 'dist/main.js'] }),
}

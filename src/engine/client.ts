import type { AppSpec } from '../model/stack'
import type { FileTree, ProjectContext } from '../plugins/types'
import { json } from './tree'

/** Generates packages/<backend>-client: a typed openapi-fetch client built from the backend's openapi.json. */
export function restClientFiles(ctx: ProjectContext, backend: AppSpec): FileTree {
  const dir = `packages/${backend.name}-client`
  const v = ctx.versions
  const schema = `openapi-typescript ../../apps/${backend.name}/openapi.json -o src/schema.d.ts`
  const pkg = {
    name: `${ctx.scope}/${backend.name}-client`,
    version: '0.0.0',
    private: true,
    type: 'module',
    main: './dist/index.cjs',
    module: './dist/index.js',
    types: './dist/index.d.ts',
    exports: {
      '.': {
        import: { types: './dist/index.d.ts', default: './dist/index.js' },
        require: { types: './dist/index.d.cts', default: './dist/index.cjs' },
      },
    },
    files: ['dist'],
    scripts: {
      build: `${schema} && tsdown`,
      // `dev` runs alongside this package's own build (both after the backend build), so it
      // generates the schema itself and never cleans dist/ under a running consumer.
      dev: `${schema} && tsdown --watch --no-clean`,
      lint: 'biome check .',
      typecheck: 'tsc --noEmit',
      test: 'vitest run --passWithNoTests',
    },
    dependencies: {
      'openapi-fetch': v['openapi-fetch'],
    },
    devDependencies: {
      // Only orders the build after the backend's (it writes openapi.json); never shipped.
      [`${ctx.scope}/${backend.name}`]: 'workspace:*',
      [`${ctx.scope}/config`]: 'workspace:*',
      '@biomejs/biome': v['@biomejs/biome'],
      '@types/node': v['@types/node'],
      'openapi-typescript': v['openapi-typescript'],
      tsdown: v.tsdown,
      typescript: v.typescript,
      vitest: v.vitest,
    },
  }
  const tsdownConfig = `import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  fixedExtension: false,
})
`
  const index = `import createOpenApiClient from 'openapi-fetch'
import type { paths } from './schema'

export type { paths }

export function createClient(baseUrl: string) {
  return createOpenApiClient<paths>({ baseUrl })
}
`
  const tsconfig = {
    extends: `${ctx.scope}/config/tsconfig.node.json`,
    include: ['src', 'tsdown.config.ts'],
  }
  return {
    [`${dir}/package.json`]: json(pkg),
    [`${dir}/tsconfig.json`]: json(tsconfig),
    [`${dir}/tsdown.config.ts`]: tsdownConfig,
    [`${dir}/src/index.ts`]: index,
  }
}

/**
 * One `hello('<name>', (signal) => <client>.GET('/hello', { <init> })),` entry of a generated
 * `Promise.all([...])`, wrapped the way biome formats it when it exceeds 100 columns.
 */
export function helloCall(name: string, client: string, init = 'signal', indent = '    '): string {
  const call = `${client}.GET('/hello', { ${init} })`
  const oneLine = `${indent}hello('${name}', (signal) => ${call}),`
  return oneLine.length <= 100
    ? oneLine
    : `${indent}hello('${name}', (signal) =>\n${indent}  ${call},\n${indent}),`
}

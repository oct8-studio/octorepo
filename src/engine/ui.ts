import type { FileTree, ProjectContext } from '../plugins/types'
import { json } from './tree'

/** Generates packages/ui-<framework>: a shared UI component package built as dual ESM+CJS with tsdown. */
export function uiPackageFiles(ctx: ProjectContext, framework: 'react'): FileTree {
  const dir = `packages/ui-${framework}`
  const v = ctx.versions
  const pkg = {
    name: `${ctx.scope}/ui-${framework}`,
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
      build: 'tsdown',
      dev: 'tsdown --watch',
      lint: 'biome check .',
      typecheck: 'tsc --noEmit',
      test: 'vitest run --passWithNoTests',
    },
    peerDependencies: { react: v.react },
    devDependencies: {
      [`${ctx.scope}/config`]: 'workspace:*',
      '@biomejs/biome': v['@biomejs/biome'],
      '@types/react': v['@types/react'],
      react: v.react,
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
  const card = `import type { ReactNode } from 'react'

export interface CardProps {
  title: string
  children?: ReactNode
}

export function Card({ title, children }: CardProps) {
  return (
    <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, margin: '8px 0' }}>
      <h2 style={{ margin: '0 0 8px' }}>{title}</h2>
      <div>{children}</div>
    </section>
  )
}
`
  return {
    [`${dir}/package.json`]: json(pkg),
    [`${dir}/tsconfig.json`]: `{
  "extends": "${ctx.scope}/config/tsconfig.react.json",
  "include": ["src", "tsdown.config.ts"]
}
`,
    [`${dir}/tsdown.config.ts`]: tsdownConfig,
    [`${dir}/src/index.ts`]: "export { Card, type CardProps } from './Card'\n",
    [`${dir}/src/Card.tsx`]: card,
  }
}

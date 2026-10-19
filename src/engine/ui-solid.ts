import type { FileTree, ProjectContext } from '../plugins/types'
import { json } from './tree'

/**
 * Generates packages/ui-solid. Solid JSX must be compiled by the consumer's bundler (separately for
 * the server and the browser), so the package ships its source under the `solid` export condition,
 * which vite-plugin-solid resolves, instead of a prebuilt dist.
 */
export function uiSolidPackageFiles(ctx: ProjectContext): FileTree {
  const dir = 'packages/ui-solid'
  const v = ctx.versions
  const pkg = {
    name: `${ctx.scope}/ui-solid`,
    version: '0.0.0',
    private: true,
    type: 'module',
    types: './src/index.ts',
    exports: {
      '.': {
        types: './src/index.ts',
        solid: './src/index.ts',
        default: './src/index.ts',
      },
    },
    files: ['src'],
    scripts: {
      lint: 'biome check .',
      typecheck: 'tsc --noEmit',
      test: 'vitest run --passWithNoTests',
    },
    peerDependencies: { 'solid-js': v['solid-js'] },
    devDependencies: {
      [`${ctx.scope}/config`]: 'workspace:*',
      '@biomejs/biome': v['@biomejs/biome'],
      'solid-js': v['solid-js'],
      typescript: v.typescript,
      vitest: v.vitest,
    },
  }
  const card = `import type { JSX } from 'solid-js'

export interface CardProps {
  title: string
  children?: JSX.Element
}

export function Card(props: CardProps) {
  return (
    <section
      style={{ border: '1px solid #ddd', 'border-radius': '8px', padding: '16px', margin: '8px 0' }}
    >
      <h2 style={{ margin: '0 0 8px' }}>{props.title}</h2>
      <div>{props.children}</div>
    </section>
  )
}
`
  return {
    [`${dir}/package.json`]: json(pkg),
    [`${dir}/tsconfig.json`]: json({
      extends: `${ctx.scope}/config/tsconfig.base.json`,
      compilerOptions: {
        lib: ['ES2023', 'DOM', 'DOM.Iterable'],
        jsx: 'preserve',
        jsxImportSource: 'solid-js',
        noEmit: true,
      },
      include: ['src'],
    }),
    [`${dir}/src/index.ts`]: "export { Card, type CardProps } from './Card'\n",
    [`${dir}/src/Card.tsx`]: card,
  }
}

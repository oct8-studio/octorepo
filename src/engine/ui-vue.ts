import type { FileTree, ProjectContext } from '../plugins/types'
import { json } from './tree'

/** Generates packages/ui-vue: a shared Vue component package built as dual ESM+CJS with tsdown (plain TS, no SFC build step). */
export function uiVuePackageFiles(ctx: ProjectContext): FileTree {
  const dir = 'packages/ui-vue'
  const v = ctx.versions
  const pkg = {
    name: `${ctx.scope}/ui-vue`,
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
      dev: 'tsdown --watch --no-clean',
      lint: 'biome check .',
      typecheck: 'tsc --noEmit',
      test: 'vitest run',
    },
    peerDependencies: { vue: v.vue },
    devDependencies: {
      [`${ctx.scope}/config`]: 'workspace:*',
      '@biomejs/biome': v['@biomejs/biome'],
      '@vue/compiler-dom': v['@vue/compiler-dom'],
      '@vue/test-utils': v['@vue/test-utils'],
      jsdom: v.jsdom,
      tsdown: v.tsdown,
      typescript: v.typescript,
      vitest: v.vitest,
      vue: v.vue,
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
  const card = `import { defineComponent, h } from 'vue'

export const Card = defineComponent({
  props: {
    title: { type: String, required: true },
  },
  setup(props, { slots }) {
    return () =>
      h(
        'section',
        {
          style: {
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '16px',
            margin: '8px 0',
          },
        },
        [h('h2', { style: { margin: '0 0 8px' } }, props.title), h('div', slots.default?.())],
      )
  },
})
`
  const cardTest = `// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import { Card } from './index'

it('renders the title and slot content', () => {
  const wrapper = mount(Card, { props: { title: 'Hello' }, slots: { default: 'Body text' } })
  expect(wrapper.find('h2').text()).toBe('Hello')
  expect(wrapper.text()).toContain('Body text')
})
`
  return {
    [`${dir}/package.json`]: json(pkg),
    [`${dir}/tsconfig.json`]: `{
  "extends": "${ctx.scope}/config/tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2023", "DOM", "DOM.Iterable"] },
  "include": ["src", "tsdown.config.ts"]
}
`,
    [`${dir}/tsdown.config.ts`]: tsdownConfig,
    [`${dir}/src/index.ts`]: "export { Card } from './Card'\n",
    [`${dir}/src/Card.ts`]: card,
    [`${dir}/src/Card.test.ts`]: cardTest,
  }
}

import type { FileTree, ProjectContext } from '../plugins/types'
import { json } from './tree'

/**
 * Generates packages/ui-svelte: shared Svelte components packaged with `@sveltejs/package`.
 * It ships `.svelte` sources (compiled by each consuming app) under the `svelte` export condition,
 * plus generated `.d.ts` types; not dual ESM+CJS like the tsdown packages.
 */
export function uiSveltePackageFiles(ctx: ProjectContext): FileTree {
  const dir = 'packages/ui-svelte'
  const v = ctx.versions
  const pkg = {
    name: `${ctx.scope}/ui-svelte`,
    version: '0.0.0',
    private: true,
    type: 'module',
    svelte: './dist/index.js',
    types: './dist/index.d.ts',
    exports: {
      '.': { types: './dist/index.d.ts', svelte: './dist/index.js' },
    },
    files: ['dist'],
    scripts: {
      build: 'svelte-package --input src --output dist',
      dev: 'svelte-package --input src --output dist --watch',
      lint: 'biome check .',
      typecheck: 'svelte-check --tsconfig ./tsconfig.json',
      test: 'vitest run --passWithNoTests',
    },
    peerDependencies: { svelte: v.svelte },
    devDependencies: {
      [`${ctx.scope}/config`]: 'workspace:*',
      '@biomejs/biome': v['@biomejs/biome'],
      '@sveltejs/package': v['@sveltejs/package'],
      svelte: v.svelte,
      'svelte-check': v['svelte-check'],
      typescript: v.typescript,
      vitest: v.vitest,
    },
  }
  const card = `<script lang="ts" module>
  import type { Snippet } from 'svelte'

  export interface CardProps {
    title: string
    children?: Snippet
  }
</script>

<script lang="ts">
  const { title, children }: CardProps = $props()
</script>

<section style="border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin: 8px 0">
  <h2 style="margin: 0 0 8px">{title}</h2>
  <div>{@render children?.()}</div>
</section>
`
  return {
    [`${dir}/package.json`]: json(pkg),
    // JSON written pre-formatted (as Biome prints it) so the package passes `biome check` as generated.
    [`${dir}/tsconfig.json`]: `{
  "extends": "${ctx.scope}/config/tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "verbatimModuleSyntax": true,
    "noEmit": true
  },
  "include": ["src"]
}
`,
    // Without full support Biome lints only the <script> block and flags template-only usages.
    // A nested config's includes replace the root's, so build output is excluded here too
    // (svelte-package also leaves its staging dir in .svelte-kit/).
    [`${dir}/biome.json`]: `{
  "root": false,
  "extends": "//",
  "files": {
    "includes": ["**", "!dist", "!.svelte-kit"]
  },
  "html": { "experimentalFullSupportEnabled": true }
}
`,
    [`${dir}/.gitignore`]: '/.svelte-kit\n',
    [`${dir}/src/index.ts`]: "export { type CardProps, default as Card } from './Card.svelte'\n",
    [`${dir}/src/Card.svelte`]: card,
  }
}

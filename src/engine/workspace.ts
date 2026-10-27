import { stringify } from 'yaml'
import { MANIFEST_FILE } from '../meta'
import type { Manifest } from '../model/stack'
import type { ProjectContext } from '../plugins/types'
import { agentsSection, CLAUDE_CONTENT, CLAUDE_FILE, databaseSection, kbeeHint } from './agents'
import { type FileTree, json } from './tree'

// Build output and generated dirs of every supported framework, so apps need no own .gitignore.
export const GITIGNORE_LINES = [
  'node_modules',
  'dist',
  'apps/*/build',
  '.next',
  '.nuxt',
  '.output',
  '.nitro',
  '.data',
  '.svelte-kit',
  '.astro',
  '.react-router',
  '.tanstack',
  '.solid',
  'routeTree.gen.ts',
  '.turbo',
  '.nx',
  '.env',
  '*.log',
  'coverage',
  '.DS_Store',
]

// `.env` files stay out of images; `.env.example` is kept as documentation.
export const DOCKERIGNORE_LINES = [
  'node_modules',
  '**/node_modules',
  '**/dist',
  '**/build',
  '**/.solid',
  '**/.data',
  '**/.next',
  '**/.output',
  '**/.nuxt',
  '**/.nitro',
  '**/.svelte-kit',
  '**/.astro',
  '**/.react-router',
  '**/.tanstack',
  '.git',
  '**/.turbo',
  '.nx',
  '.env',
  '**/.env',
  '**/.env.local',
  '**/.env.*',
  '!**/.env.example',
]

// Build output and framework-generated dirs/files are never linted (nor rewritten by --write).
export const BIOME_INCLUDES = [
  '**',
  '!**/dist',
  '!apps/*/build',
  '!**/.next',
  '!**/.nuxt',
  '!**/.output',
  '!**/.nitro',
  '!**/.data',
  '!**/.svelte-kit',
  '!**/.astro',
  '!**/.react-router',
  '!**/.tanstack',
  '!**/.solid',
  '!**/routeTree.gen.ts',
  '!**/.turbo',
  '!**/.nx',
  '!**/node_modules',
  '!**/openapi.json',
  '!**/*.d.ts',
  // Agent skills installed by `npx skills add` (e.g. kbee) keep their own formatting.
  '!.agents/skills',
  '!.claude/skills',
  '!skills-lock.json',
]

function tsconfigs(): FileTree {
  return {
    'packages/config/tsconfig.base.json': json({
      $schema: 'https://json.schemastore.org/tsconfig',
      compilerOptions: {
        target: 'ES2023',
        lib: ['ES2023'],
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        noUncheckedIndexedAccess: true,
        esModuleInterop: true,
        skipLibCheck: true,
        resolveJsonModule: true,
        isolatedModules: true,
        forceConsistentCasingInFileNames: true,
      },
    }),
    'packages/config/tsconfig.node.json': json({
      extends: './tsconfig.base.json',
      compilerOptions: { types: ['node'] },
    }),
    'packages/config/tsconfig.react.json': json({
      extends: './tsconfig.base.json',
      compilerOptions: { lib: ['ES2023', 'DOM', 'DOM.Iterable'], jsx: 'react-jsx' },
    }),
  }
}

function readme(manifest: Manifest): string {
  const rows = manifest.apps.map(
    (a) => `| ${a.name} | ${a.kind} | ${a.framework} | ${a.port ?? '-'} |`,
  )
  const devCommands = manifest.apps
    .map((a) => `pnpm --filter @${manifest.name}/${a.name} dev`)
    .join('\n')
  return `# ${manifest.name}

Generated with octorepo (${manifest.monorepoTool}, pnpm workspace).

## Apps

| App | Kind | Framework | Port |
| --- | --- | --- | --- |
${rows.join('\n')}

## Commands

\`\`\`sh
pnpm install
pnpm dev        # run all apps
${devCommands}
pnpm build
pnpm lint
pnpm typecheck
pnpm test
\`\`\`

Each app reads local-development settings from its own \`.env\` (a gitignored copy of
\`.env.example\`). Backends allow CORS from the frontends that use them unless \`CORS_ORIGINS\` is set.

Requires Node 24 and pnpm.
${databaseSection(manifest, 2)}
## AI agents

${
  manifest.kbee
    ? `\`AGENTS.md\` (and \`CLAUDE.md\`, which imports it) describes this repo for coding agents. A
[kbee](https://github.com/oct8-studio/kbee) knowledge base lives in \`kb/\`: commit the repo, then
run \`/kbee audit\` in Claude Code or Codex to build it.`
    : kbeeHint()
}
`
}

function ci(buildCommand: string): string {
  return `name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          # Full history so the monorepo tool can compute affected projects.
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: ${buildCommand}
`
}

/** Base workspace files, independent of monorepo tool/apps. Root scripts are left to the monorepo plugin. */
export function workspaceFiles(
  ctx: ProjectContext,
  manifest: Manifest,
  opts: { ciBuildCommand?: string } = {},
): FileTree {
  const v = ctx.versions
  const scope = ctx.scope
  return {
    'package.json': json({
      name: ctx.stack.name,
      private: true,
      packageManager: `pnpm@${v.pnpm}`,
      engines: { node: '>=24' },
      devDependencies: {
        typescript: v.typescript,
        '@biomejs/biome': v['@biomejs/biome'],
      },
    }),
    // pnpm 11+ fails install on unapproved dependency build scripts; esbuild needs its postinstall.
    'pnpm-workspace.yaml': stringify({
      packages: ['apps/*', 'packages/*'],
      strictDepBuilds: false,
      allowBuilds: { esbuild: true },
      // openapi-typescript declares a TypeScript 5 peer; the repo pins TypeScript 6, which works.
      peerDependencyRules: { allowedVersions: { typescript: '6' } },
    }),
    '.gitignore': `${GITIGNORE_LINES.join('\n')}\n`,
    '.nvmrc': '24\n',
    '.dockerignore': `${DOCKERIGNORE_LINES.join('\n')}\n`,
    'biome.json': json({
      $schema: `https://biomejs.dev/schemas/${v['@biomejs/biome']}/schema.json`,
      files: {
        includes: BIOME_INCLUDES,
      },
      // Lint .vue/.svelte/.astro templates too; otherwise imports used only in a template look
      // unused and the post-install `biome check --write` could drop them.
      html: { experimentalFullSupportEnabled: true },
      formatter: { indentStyle: 'space', indentWidth: 2, lineWidth: 100 },
      javascript: { formatter: { quoteStyle: 'single', semicolons: 'asNeeded' } },
      linter: { enabled: true },
    }),
    ...tsconfigs(),
    'packages/config/package.json': json({
      name: `${scope}/config`,
      version: '0.0.0',
      private: true,
      exports: {
        './tsconfig.base.json': './tsconfig.base.json',
        './tsconfig.node.json': './tsconfig.node.json',
        './tsconfig.react.json': './tsconfig.react.json',
      },
    }),
    'packages/types/package.json': json({
      name: `${scope}/types`,
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
        test: 'vitest run --passWithNoTests',
      },
      dependencies: { zod: v.zod },
      devDependencies: {
        [`${scope}/config`]: 'workspace:*',
        '@types/node': v['@types/node'],
        tsdown: v.tsdown,
        typescript: v.typescript,
        vitest: v.vitest,
      },
    }),
    'packages/types/tsdown.config.ts': `import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  fixedExtension: false,
  dts: true,
  clean: true,
})
`,
    'packages/types/tsconfig.json': json({
      extends: `${scope}/config/tsconfig.node.json`,
      include: ['src', 'tsdown.config.ts'],
    }),
    'packages/types/src/index.ts': `import { z } from 'zod'

export const HelloResponseSchema = z.object({ message: z.string() })

export type HelloResponse = { message: string }
`,
    [MANIFEST_FILE]: json(manifest),
    '.github/workflows/ci.yml': ci(opts.ciBuildCommand ?? 'pnpm build'),
    'README.md': readme(manifest),
    'AGENTS.md': `# AGENTS.md\n\n${agentsSection(manifest)}`,
    [CLAUDE_FILE]: CLAUDE_CONTENT,
  }
}

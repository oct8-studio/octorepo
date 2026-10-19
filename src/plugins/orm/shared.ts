import { json } from '../../engine/tree'
import { postgresPlugin } from '../service/postgres'
import type { FileTree, ProjectContext } from '../types'

export const DB_DIR = 'packages/db'

/** `@<scope>/db`, the package every backend depends on when the stack has an ORM. */
export function dbPackageName(ctx: ProjectContext): string {
  return `${ctx.scope}/db`
}

const SEED = 'pnpm run db:seed'

/**
 * One-shot image for the compose `migrate` service: the full workspace install (the ORM CLIs are
 * dev dependencies), then migrations and the idempotent seed. `apk` adds Alpine packages first.
 * Runs as `node`: corepack's pnpm lives in a shared COREPACK_HOME and /repo belongs to node, so
 * install, build, migrate and seed never need root.
 */
export function dbDockerfile(migrateCommand: string[], apk: string[] = []): string {
  const pkgs = apk.length ? `RUN apk add --no-cache ${apk.join(' ')}\n` : ''
  return `FROM node:24-alpine
${pkgs}ENV COREPACK_HOME=/opt/corepack
RUN corepack enable && mkdir -p /opt/corepack /repo && chown node:node /opt/corepack /repo
USER node
WORKDIR /repo
COPY --chown=node:node package.json ./
RUN pnpm --version
COPY --chown=node:node . .
RUN pnpm install --frozen-lockfile
WORKDIR /repo/packages/db
RUN pnpm run build
CMD ["sh", "-c", ${JSON.stringify(`${migrateCommand.join(' ')} && ${SEED}`)}]
`
}

/** The files both ORMs share: a dual-built (R8) package.json, tsconfig, tsdown and biome configs. */
export function dbPackageFiles(
  ctx: ProjectContext,
  opts: {
    scripts: Record<string, string>
    dependencies: Record<string, string>
    devDependencies: Record<string, string>
    /** Root-level TS config files the package typechecks, e.g. drizzle.config.ts. */
    configFiles: string[]
    /** Paths biome must skip (ORM-generated code). */
    lintIgnore?: string[]
  },
): FileTree {
  const v = ctx.versions
  const pkg = {
    name: dbPackageName(ctx),
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
      lint: 'biome check .',
      typecheck: 'tsc --noEmit',
      test: 'vitest run --passWithNoTests',
      'db:seed': 'tsx src/seed.ts',
      ...opts.scripts,
    },
    dependencies: opts.dependencies,
    devDependencies: {
      [`${ctx.scope}/config`]: 'workspace:*',
      '@biomejs/biome': v['@biomejs/biome'],
      '@types/node': v['@types/node'],
      tsdown: v.tsdown,
      tsx: v.tsx,
      typescript: v.typescript,
      vitest: v.vitest,
      ...opts.devDependencies,
    },
  }
  const env = Object.entries(postgresPlugin.env(ctx, 'localhost'))
    .map(([k, val]) => `${k}=${val}\n`)
    .join('')
  const tree: FileTree = {
    [`${DB_DIR}/package.json`]: json(pkg),
    // Local `db:*` runs read these (compose passes DATABASE_URL to the migrate service instead).
    [`${DB_DIR}/.env.example`]: env,
    [`${DB_DIR}/.env`]: env,
    [`${DB_DIR}/src/env.ts`]: `/** Loads this package's .env for local runs; variables already set (e.g. by compose) win. */
export function loadLocalEnv(): void {
  try {
    process.loadEnvFile()
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
}

/** DATABASE_URL, or exit with a message naming it. */
export function databaseUrl(): string {
  loadLocalEnv()
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('Missing environment variable DATABASE_URL (see .env.example)')
    process.exit(1)
  }
  return url
}
`,
    [`${DB_DIR}/tsconfig.json`]: json({
      extends: `${ctx.scope}/config/tsconfig.node.json`,
      include: ['src', 'tsdown.config.ts', ...opts.configFiles],
    }),
    [`${DB_DIR}/tsdown.config.ts`]: `import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  fixedExtension: false,
  dts: true,
  clean: true,
})
`,
  }
  if (opts.lintIgnore?.length) {
    // Nested config inheriting the root biome.json. Its files.includes replaces the root's, so it
    // repeats the root's build-output ignores next to the generated code.
    tree[`${DB_DIR}/biome.json`] = json({
      $schema: `https://biomejs.dev/schemas/${v['@biomejs/biome']}/schema.json`,
      root: false,
      extends: '//',
      files: {
        includes: [
          '**',
          '!**/dist',
          '!**/node_modules',
          '!**/*.d.ts',
          ...opts.lintIgnore.map((p) => `!${p}`),
        ],
      },
    })
  }
  return tree
}

/**
 * Backend side of the ORM: the `@<scope>/db` dependency and `src/db.ts`, whose `dbHealth()` backs
 * `GET /db/health` (200 `{ ok: true, greetings }`, or 503 while the database is unreachable).
 * Undefined when the stack has no ORM.
 */
export function backendDb(
  ctx: ProjectContext,
): { dependencies: Record<string, string>; file: string } | undefined {
  if (!ctx.stack.orm) return undefined
  const pkg = dbPackageName(ctx)
  return {
    dependencies: { [pkg]: 'workspace:*' },
    file: `import { countGreetings, createDb, type Db } from '${pkg}'

export type DbHealth = { ok: true; greetings: number } | { ok: false; error: string }

let db: Db | undefined

export async function dbHealth(): Promise<{ status: 200 | 503; body: DbHealth }> {
  const url = process.env.DATABASE_URL
  if (!url) {
    return { status: 503, body: { ok: false, error: 'Missing environment variable DATABASE_URL' } }
  }
  try {
    db ??= createDb(url)
    return { status: 200, body: { ok: true, greetings: await countGreetings(db) } }
  } catch (e) {
    // Details stay in the server log; the response does not leak connection strings or hosts.
    console.error('GET /db/health failed:', e)
    return { status: 503, body: { ok: false, error: 'database unavailable' } }
  }
}
`,
  }
}

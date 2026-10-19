import { json, readPluginFiles } from '../../../engine/tree'
import type { FileTree, OrmPlugin, ProjectContext } from '../../types'
import { DB_DIR, dbDockerfile, dbPackageFiles } from '../shared'

const MIGRATE = ['pnpm', 'run', 'db:migrate']
const GENERATE = 'prisma generate'

/**
 * `dev` runs after this package's own `build`: both run `prisma generate` into src/generated,
 * and two concurrent runs fail with EEXIST (turbo and nx otherwise start them in parallel).
 */
const DEV_DEPENDS_ON = ['^build', 'build']

function generate(ctx: ProjectContext): FileTree {
  const v = ctx.versions
  const nx = ctx.stack.monorepoTool === 'nx'
  const tree = dbPackageFiles(ctx, {
    // The client in src/generated is tool-owned: every build regenerates it from the schema.
    scripts: {
      build: `${GENERATE} && tsdown`,
      dev: `${GENERATE} && tsdown --watch --no-clean`,
      'db:generate': GENERATE,
      'db:migrate': 'prisma migrate deploy',
      // Creates a new migration from schema changes against the local database; commit it.
      'db:migration': 'prisma migrate dev',
    },
    dependencies: {
      '@prisma/adapter-pg': v['@prisma/adapter-pg'],
      '@prisma/client': v['@prisma/client'],
      pg: v.pg,
    },
    devDependencies: { '@types/pg': v['@types/pg'], prisma: v.prisma },
    configFiles: ['prisma.config.ts'],
    lintIgnore: ['src/generated'],
    ...(nx ? { extra: { nx: { targets: { dev: { dependsOn: DEV_DEPENDS_ON } } } } } : {}),
  })
  if (!nx) {
    tree[`${DB_DIR}/turbo.json`] = json({
      $schema: 'https://turborepo.dev/schema.json',
      extends: ['//'],
      tasks: { dev: { dependsOn: DEV_DEPENDS_ON } },
    })
  }
  for (const [path, content] of Object.entries(readPluginFiles(new URL('./', import.meta.url), {})))
    tree[`${DB_DIR}/${path}`] = content
  // Prisma's schema engine needs OpenSSL, which node:alpine does not ship.
  tree[`${DB_DIR}/Dockerfile`] = dbDockerfile(MIGRATE, ['openssl'])
  return tree
}

export const prismaPlugin: OrmPlugin = {
  id: 'prisma',
  label: 'Prisma',
  generate,
  migrateCommand: MIGRATE,
  allowBuilds: ['prisma', '@prisma/engines'],
}

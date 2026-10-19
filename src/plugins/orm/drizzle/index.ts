import { readPluginFiles } from '../../../engine/tree'
import type { FileTree, OrmPlugin, ProjectContext } from '../../types'
import { DB_DIR, dbDockerfile, dbPackageFiles } from '../shared'

const MIGRATE = ['pnpm', 'run', 'db:migrate']

function generate(ctx: ProjectContext): FileTree {
  const v = ctx.versions
  const tree = dbPackageFiles(ctx, {
    scripts: {
      build: 'tsdown',
      dev: 'tsdown --watch --no-clean',
      // Both write a new SQL migration under drizzle/ from changes to src/schema.ts; commit it.
      // db:migration is the cross-ORM name, db:generate drizzle-kit's own.
      'db:migration': 'drizzle-kit generate',
      'db:generate': 'drizzle-kit generate',
      'db:migrate': 'drizzle-kit migrate',
    },
    dependencies: { 'drizzle-orm': v['drizzle-orm'], pg: v.pg },
    devDependencies: { '@types/pg': v['@types/pg'], 'drizzle-kit': v['drizzle-kit'] },
    configFiles: ['drizzle.config.ts'],
    // drizzle-kit rewrites its snapshots on every db:migration; never reformat or lint them.
    lintIgnore: ['drizzle/meta'],
  })
  for (const [path, content] of Object.entries(readPluginFiles(new URL('./', import.meta.url), {})))
    tree[`${DB_DIR}/${path}`] = content
  tree[`${DB_DIR}/Dockerfile`] = dbDockerfile(MIGRATE)
  return tree
}

export const drizzlePlugin: OrmPlugin = {
  id: 'drizzle',
  label: 'Drizzle',
  generate,
  migrateCommand: MIGRATE,
}

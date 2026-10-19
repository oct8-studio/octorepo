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
      // Writes a new SQL migration under drizzle/ from changes to src/schema.ts; commit it.
      'db:generate': 'drizzle-kit generate',
      'db:migrate': 'drizzle-kit migrate',
    },
    dependencies: { 'drizzle-orm': v['drizzle-orm'], pg: v.pg },
    devDependencies: { '@types/pg': v['@types/pg'], 'drizzle-kit': v['drizzle-kit'] },
    configFiles: ['drizzle.config.ts'],
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

import { json } from '../../../engine/tree'
import type { MonorepoPlugin } from '../../types'

export const nxPlugin: MonorepoPlugin & { ciBuildCommand: string } = {
  id: 'nx',
  label: 'Nx',
  // PR checkouts have no local main branch, so compare against the fetched remote ref.
  ciBuildCommand: 'pnpm nx affected -t build --base=origin/main --head=HEAD',
  generate(ctx) {
    return {
      'package.json': json({
        scripts: {
          build: 'nx run-many -t build',
          dev: 'nx run-many -t dev',
          lint: 'nx run-many -t lint',
          typecheck: 'nx run-many -t typecheck',
          test: 'nx run-many -t test',
        },
        devDependencies: { nx: ctx.versions.nx },
      }),
      'nx.json': json({
        $schema: './node_modules/nx/schemas/nx-schema.json',
        defaultBase: 'main',
        targetDefaults: {
          build: {
            dependsOn: ['^build'],
            outputs: [
              '{projectRoot}/dist',
              '{projectRoot}/openapi.json',
              '{projectRoot}/.next',
              '!{projectRoot}/.next/cache',
            ],
            cache: true,
          },
          typecheck: { dependsOn: ['build'], cache: true },
          test: { dependsOn: ['build'], cache: true },
          lint: { cache: true },
          dev: { cache: false },
        },
      }),
    }
  },
}

import { json } from '../../../engine/tree'
import type { MonorepoPlugin } from '../../types'

export const turboPlugin: MonorepoPlugin & { ciBuildCommand: string } = {
  id: 'turbo',
  label: 'Turborepo',
  ciBuildCommand: 'pnpm turbo run build --affected',
  generate(ctx) {
    return {
      'package.json': json({
        scripts: {
          build: 'turbo run build',
          dev: 'turbo run dev',
          lint: 'turbo run lint',
          typecheck: 'turbo run typecheck',
          test: 'turbo run test',
        },
        devDependencies: { turbo: ctx.versions.turbo },
      }),
      'turbo.json': json({
        $schema: 'https://turborepo.dev/schema.json',
        tasks: {
          build: { dependsOn: ['^build'], outputs: ['dist/**', '.next/**', '!.next/cache/**'] },
          typecheck: { dependsOn: ['^build'] },
          test: { dependsOn: ['^build'] },
          lint: {},
          dev: { cache: false, persistent: true },
        },
      }),
    }
  },
}

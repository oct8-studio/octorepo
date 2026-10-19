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
          // Every app and package watcher is a persistent task; turbo refuses to start when they
          // outnumber its default concurrency of 10. Fixed (not per-repo) so `add app` never
          // leaves it stale, and scoped to dev so `build` keeps the default parallelism.
          dev: 'turbo run dev --concurrency=64',
          lint: 'turbo run lint',
          typecheck: 'turbo run typecheck',
          test: 'turbo run test',
        },
        devDependencies: { turbo: ctx.versions.turbo },
      }),
      'turbo.json': json({
        $schema: 'https://turborepo.dev/schema.json',
        tasks: {
          build: {
            dependsOn: ['^build'],
            // dist (Vite, Astro, React Router, packages), .next, .output (Nuxt, TanStack Start,
            // SolidStart), build (SvelteKit).
            outputs: [
              'dist/**',
              'openapi.json',
              '.next/**',
              '!.next/cache/**',
              '.output/**',
              'build/**',
            ],
          },
          typecheck: { dependsOn: ['build'] },
          test: { dependsOn: ['build'] },
          lint: {},
          // Apps import built workspace packages (types, clients, ui), so build those first.
          dev: { dependsOn: ['^build'], cache: false, persistent: true },
        },
      }),
    }
  },
}

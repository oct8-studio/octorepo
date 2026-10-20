import type { Config } from '@react-router/dev/config'

export default {
  // Server-side render every request; loaders fetch the backends at request time, never at build.
  ssr: true,
  // dist/ is already gitignored, dockerignored, biome-ignored and cached as a build output.
  buildDirectory: 'dist',
} satisfies Config

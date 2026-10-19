import { defineConfig } from 'vitest/config'

// Kept apart from vite.config.ts so unit tests don't load the SolidStart and nitro build plugins.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
})

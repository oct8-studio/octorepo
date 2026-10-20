import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts: the React Router plugin is not meant to run under Vitest.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
})

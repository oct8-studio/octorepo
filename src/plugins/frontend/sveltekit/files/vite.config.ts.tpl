import adapter from '@sveltejs/adapter-node'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    sveltekit({
      compilerOptions: {
        // Runes mode for the app's own components; libraries in node_modules choose their own.
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
      },
      // A standalone Node server in build/ (`node build/index.js`); devDependencies are bundled into it.
      adapter: adapter(),
    }),
  ],
  test: { include: ['src/**/*.test.ts'] },
})

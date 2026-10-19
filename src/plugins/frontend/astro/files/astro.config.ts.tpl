import node from '@astrojs/node'
import { defineConfig } from 'astro/config'

// Astro only exposes .env through import.meta.env (inlined at build); load it into process.env so
// `astro dev` sees the backend URLs the server reads at request time. Real env vars take precedence.
try {
  process.loadEnvFile()
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
}

export default defineConfig({
  // Every page renders on request, so the build never needs a backend to be reachable.
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: { port: {{port}} },
})

import { createApp } from './app.js'

// Local dev: load this app's .env if present (variables already set in the environment win).
try {
  process.loadEnvFile()
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
}

const port = Number(process.env.PORT ?? {{port}})

const app = await createApp()
await app.listen({ port, host: '0.0.0.0' })
console.log(`{{name}} listening on http://localhost:${port}`)

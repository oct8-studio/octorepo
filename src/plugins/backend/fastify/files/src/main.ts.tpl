import { createApp } from './app.js'

// Local dev: load this app's .env if present (variables already set in the environment win).
try {
  process.loadEnvFile()
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
}

const port = Number(process.env.PORT ?? {{port}})

const app = await createApp()
// '::' is dual-stack (IPv6 and IPv4), matching what the other backends get from Node's default.
await app.listen({ port, host: '::' })
console.log(`{{name}} listening on http://localhost:${port}`)

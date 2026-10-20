import { createApp } from './app.js'

// Local dev: load this app's .env if present (variables already set in the environment win).
try {
  process.loadEnvFile()
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
}

const port = Number(process.env.PORT ?? {{port}})

const app = await createApp()
// '::' is dual-stack (IPv6 and IPv4), matching what the other backends get from Node's default;
// fall back to IPv4 on hosts where IPv6 is unavailable, as Node's default does.
try {
  await app.listen({ port, host: '::' })
} catch (e) {
  const code = (e as NodeJS.ErrnoException).code
  if (code !== 'EAFNOSUPPORT' && code !== 'EADDRNOTAVAIL') throw e
  await app.listen({ port, host: '0.0.0.0' })
}
console.log(`{{name}} listening on http://localhost:${port}`)

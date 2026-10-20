import { createApp } from './app.js'
import { loadEnv } from './generated/env.js'

const { PORT: port } = loadEnv()

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

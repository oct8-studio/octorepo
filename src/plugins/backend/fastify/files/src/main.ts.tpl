import { createApp } from './app.js'
import { loadEnv } from './generated/env.js'

const { PORT: port } = loadEnv()

const app = await createApp()
await app.listen({ port, host: '0.0.0.0' })
console.log(`{{name}} listening on http://localhost:${port}`)

import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { loadEnv } from './env.js'

const { PORT: port } = loadEnv()

serve({ fetch: createApp().fetch, port }, () => {
  console.log(`{{name}} listening on http://localhost:${port}`)
})

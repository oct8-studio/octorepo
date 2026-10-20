import { serve } from '@hono/node-server'
import { createApp } from './app.js'

// Local dev: load this app's .env if present (variables already set in the environment win).
try {
  process.loadEnvFile()
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
}

const port = Number(process.env.PORT ?? {{port}})

serve({ fetch: createApp().fetch, port }, () => {
  console.log(`{{name}} listening on http://localhost:${port}`)
})

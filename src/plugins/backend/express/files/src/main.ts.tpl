import { createApp } from './app.js'
import { loadEnv } from './env.js'

const { PORT: port } = loadEnv()

createApp().listen(port, () => {
  console.log(`{{name}} listening on http://localhost:${port}`)
})

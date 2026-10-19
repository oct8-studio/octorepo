import 'reflect-metadata'
import { createApp } from './app'
import { loadEnv } from './generated/env'

async function bootstrap(): Promise<void> {
  const { PORT: port } = loadEnv()
  const app = await createApp()
  await app.listen(port)
  console.log(`{{name}} listening on http://localhost:${port}`)
}

bootstrap().catch((e) => {
  console.error(e)
  process.exit(1)
})

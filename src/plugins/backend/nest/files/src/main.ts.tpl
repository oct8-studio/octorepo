import 'reflect-metadata'
import { createApp } from './app'

async function bootstrap(): Promise<void> {
  const port = Number(process.env.PORT ?? {{port}})
  const app = await createApp()
  await app.listen(port)
  console.log(`{{name}} listening on http://localhost:${port}`)
}

void bootstrap()

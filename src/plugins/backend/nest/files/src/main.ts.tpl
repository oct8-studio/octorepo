import 'reflect-metadata'
import { createApp } from './app'

// Local dev: load this app's .env if present (variables already set in the environment win).
try {
  process.loadEnvFile()
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
}

async function bootstrap(): Promise<void> {
  const port = Number(process.env.PORT ?? {{port}})
  const app = await createApp()
  await app.listen(port)
  console.log(`{{name}} listening on http://localhost:${port}`)
}

bootstrap().catch((e) => {
  console.error(e)
  process.exit(1)
})

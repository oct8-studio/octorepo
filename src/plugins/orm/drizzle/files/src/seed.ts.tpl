import { databaseUrl } from './env'
import { countGreetings, createDb, greeting } from './index'

// Idempotent: the compose `migrate` service runs it on every `docker compose up`.
const db = createDb(databaseUrl())
if ((await countGreetings(db)) === 0) {
  await db.insert(greeting).values({ message: 'Hello from the database' })
}
await db.$client.end()

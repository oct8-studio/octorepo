import { databaseUrl } from './env'
import { countGreetings, createDb } from './index'

// Idempotent: the compose `migrate` service runs it on every `docker compose up`.
const db = createDb(databaseUrl())
if ((await countGreetings(db)) === 0) {
  await db.greeting.create({ data: { message: 'Hello from the database' } })
}
await db.$disconnect()

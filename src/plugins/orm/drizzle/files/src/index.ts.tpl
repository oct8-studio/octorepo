import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema'

export { greeting } from './schema'

/** A Drizzle client over a node-postgres pool; connects on the first query. */
export function createDb(url: string) {
  return drizzle(url, { schema })
}

export type Db = ReturnType<typeof createDb>

export function countGreetings(db: Db): Promise<number> {
  return db.$count(schema.greeting)
}

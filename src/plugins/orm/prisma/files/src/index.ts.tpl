import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client'

export type { Greeting } from './generated/prisma/client'

/** A Prisma client over the node-postgres driver adapter; connects on the first query. */
export function createDb(url: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
}

export type Db = ReturnType<typeof createDb>

export function countGreetings(db: Db): Promise<number> {
  return db.greeting.count()
}

generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model Greeting {
  id      Int    @id @default(autoincrement())
  message String

  @@map("greeting")
}

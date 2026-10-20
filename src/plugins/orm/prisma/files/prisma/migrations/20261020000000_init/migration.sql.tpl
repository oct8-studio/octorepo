-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "greeting" (
    "id" SERIAL NOT NULL,
    "message" TEXT NOT NULL,

    CONSTRAINT "greeting_pkey" PRIMARY KEY ("id")
);

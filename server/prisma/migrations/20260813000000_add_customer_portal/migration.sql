-- Customer portal accounts + refresh tokens (idempotent for existing databases).

CREATE TABLE IF NOT EXISTS "public"."CustomerAccount" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "resetTokenHash" TEXT,
    "resetTokenExpiry" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerAccount_customerId_key" ON "public"."CustomerAccount"("customerId");

CREATE TABLE IF NOT EXISTS "public"."CustomerRefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerRefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerRefreshToken_token_key" ON "public"."CustomerRefreshToken"("token");
CREATE INDEX IF NOT EXISTS "CustomerRefreshToken_customerAccountId_idx" ON "public"."CustomerRefreshToken"("customerAccountId");

ALTER TABLE "public"."CustomerAccount" DROP CONSTRAINT IF EXISTS "CustomerAccount_customerId_fkey";
ALTER TABLE "public"."CustomerAccount" ADD CONSTRAINT "CustomerAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."CustomerRefreshToken" DROP CONSTRAINT IF EXISTS "CustomerRefreshToken_customerAccountId_fkey";
ALTER TABLE "public"."CustomerRefreshToken" ADD CONSTRAINT "CustomerRefreshToken_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "public"."CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

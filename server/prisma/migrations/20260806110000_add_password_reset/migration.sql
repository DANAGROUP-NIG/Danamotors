-- Add password-reset token fields to User (idempotent for existing databases).
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "resetTokenHash" TEXT;
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "resetTokenExpiry" TIMESTAMP(3);

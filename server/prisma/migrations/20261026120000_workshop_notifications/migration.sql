ALTER TABLE "Notification" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Notification" ADD COLUMN "dedupeKey" TEXT, ADD COLUMN "customerId" TEXT;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");
CREATE UNIQUE INDEX "Notification_customerId_dedupeKey_key" ON "Notification"("customerId", "dedupeKey");
CREATE INDEX "Notification_customerId_readAt_createdAt_idx" ON "Notification"("customerId", "readAt", "createdAt");
CREATE INDEX "JobCard_status_promisedAt_idx" ON "JobCard"("status", "promisedAt");

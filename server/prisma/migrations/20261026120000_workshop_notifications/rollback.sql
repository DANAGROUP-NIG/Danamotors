DELETE FROM "Notification" WHERE "userId" IS NULL;
DROP INDEX "JobCard_status_promisedAt_idx";
DROP INDEX "Notification_customerId_readAt_createdAt_idx";
DROP INDEX "Notification_userId_dedupeKey_key";
ALTER TABLE "Notification" DROP COLUMN "dedupeKey", DROP COLUMN "customerId";
ALTER TABLE "Notification" ALTER COLUMN "userId" SET NOT NULL;

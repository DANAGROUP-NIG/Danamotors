-- The sender of a handheld job is told when it is cancelled, by the handheld sweep (after the cancelling
-- transaction commits). Jobs cancelled before this change are taken as already told.
ALTER TABLE "HandheldDocument" ADD COLUMN "cancelNotifiedAt" TIMESTAMP(3);
UPDATE "HandheldDocument" SET "cancelNotifiedAt" = "cancelledAt" WHERE "status" = 'CANCELLED';

-- Prisma submits the migration as one SQL batch. Regular index builds are
-- transaction-compatible; run during maintenance while writers are stopped.
-- Abort rather than wait indefinitely for an active writer's table lock.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE INDEX IF NOT EXISTS "JobCard_createdAt_id_idx" ON "JobCard"("createdAt", "id");
CREATE INDEX IF NOT EXISTS "JobCard_branchId_createdAt_id_idx" ON "JobCard"("branchId", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "JobCard_branchId_status_createdAt_id_idx" ON "JobCard"("branchId", "status", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "JobCard_customerId_createdAt_id_idx" ON "JobCard"("customerId", "createdAt", "id");
COMMIT;

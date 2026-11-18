-- Handheld stations and devices, and the job states of the web-driven handheld (see doc/handheld.md).

-- AlterTable
ALTER TABLE "HandheldDocument" ADD COLUMN     "claimDeviceId" TEXT,
ADD COLUMN     "claimExpiresAt" TIMESTAMP(3),
ADD COLUMN     "claimStationId" TEXT,
ADD COLUMN     "deliveredDeviceId" TEXT,
ADD COLUMN     "deliveredStationId" TEXT,
ADD COLUMN     "deviceClearedAt" TIMESTAMP(3),
ADD COLUMN     "deviceKeptEntries" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "receivedStationId" TEXT,
ADD COLUMN     "result" JSONB,
ADD COLUMN     "resultHash" TEXT,
ADD COLUMN     "stockTakeSheetId" TEXT,
ADD COLUMN     "waitNotifiedAt" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'QUEUED',
ALTER COLUMN "sentAt" DROP NOT NULL,
ALTER COLUMN "sentAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "HandheldStation" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "linkVersion" TEXT,
    "dockedDeviceId" TEXT,
    "lastError" TEXT,
    "offlineNotifiedAt" TIMESTAMP(3),

    CONSTRAINT "HandheldStation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandheldDevice" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "appVersion" TEXT,
    "appStatus" TEXT,
    "appError" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "lastStationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandheldDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HandheldStation_branchId_idx" ON "HandheldStation"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "HandheldDevice_branchId_name_key" ON "HandheldDevice"("branchId", "name");

-- CreateIndex
CREATE INDEX "HandheldDocument_stockTakeSheetId_idx" ON "HandheldDocument"("stockTakeSheetId");

-- AddForeignKey
ALTER TABLE "HandheldDocument" ADD CONSTRAINT "HandheldDocument_stockTakeSheetId_fkey" FOREIGN KEY ("stockTakeSheetId") REFERENCES "StockTakeSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandheldDocument" ADD CONSTRAINT "HandheldDocument_deliveredStationId_fkey" FOREIGN KEY ("deliveredStationId") REFERENCES "HandheldStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandheldDocument" ADD CONSTRAINT "HandheldDocument_deliveredDeviceId_fkey" FOREIGN KEY ("deliveredDeviceId") REFERENCES "HandheldDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandheldDocument" ADD CONSTRAINT "HandheldDocument_receivedStationId_fkey" FOREIGN KEY ("receivedStationId") REFERENCES "HandheldStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandheldStation" ADD CONSTRAINT "HandheldStation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandheldStation" ADD CONSTRAINT "HandheldStation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandheldStation" ADD CONSTRAINT "HandheldStation_dockedDeviceId_fkey" FOREIGN KEY ("dockedDeviceId") REFERENCES "HandheldDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandheldDevice" ADD CONSTRAINT "HandheldDevice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandheldDevice" ADD CONSTRAINT "HandheldDevice_lastStationId_fkey" FOREIGN KEY ("lastStationId") REFERENCES "HandheldStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Documents already on a handheld or uploaded keep their state; they were queued when they were sent.
UPDATE "HandheldDocument" SET "queuedAt" = COALESCE("sentAt", "createdAt");

-- At most one active job per source (legacy "already under process"): waiting, on a handheld or
-- finished and not yet posted.
DROP INDEX "HandheldDocument_sent_pickingList_key";
DROP INDEX "HandheldDocument_sent_customerOrder_key";
DROP INDEX "HandheldDocument_sent_mit_key";
CREATE UNIQUE INDEX "HandheldDocument_active_pickingList_key" ON "HandheldDocument"("pickingListId") WHERE "status" IN ('QUEUED', 'SENT', 'RECEIVED');
CREATE UNIQUE INDEX "HandheldDocument_active_customerOrder_key" ON "HandheldDocument"("customerOrderId") WHERE "status" IN ('QUEUED', 'SENT', 'RECEIVED');
CREATE UNIQUE INDEX "HandheldDocument_active_mit_key" ON "HandheldDocument"("mitId") WHERE "status" IN ('QUEUED', 'SENT', 'RECEIVED');
CREATE UNIQUE INDEX "HandheldDocument_active_stockTakeSheet_key" ON "HandheldDocument"("stockTakeSheetId") WHERE "status" IN ('QUEUED', 'SENT', 'RECEIVED');

-- The station's queue query: waiting jobs of a branch.
CREATE INDEX "HandheldDocument_branchId_status_idx" ON "HandheldDocument"("branchId", "status");

-- Exactly one source, matching the type (now with count sheets).
ALTER TABLE "HandheldDocument" DROP CONSTRAINT "HandheldDocument_source_check";
ALTER TABLE "HandheldDocument" ADD CONSTRAINT "HandheldDocument_source_check" CHECK (
  ("type" = 'INDENT_PICK' AND "pickingListId" IS NOT NULL AND "customerOrderId" IS NULL AND "mitId" IS NULL AND "stockTakeSheetId" IS NULL) OR
  ("type" = 'CPO_PICK' AND "customerOrderId" IS NOT NULL AND "pickingListId" IS NULL AND "mitId" IS NULL AND "stockTakeSheetId" IS NULL) OR
  ("type" = 'MIT_RECEIVE' AND "mitId" IS NOT NULL AND "pickingListId" IS NULL AND "customerOrderId" IS NULL AND "stockTakeSheetId" IS NULL) OR
  ("type" = 'COUNT_SHEET' AND "stockTakeSheetId" IS NOT NULL AND "pickingListId" IS NULL AND "customerOrderId" IS NULL AND "mitId" IS NULL)
);

-- Station keys are managed by an admin; IT can be given the permission later from the Roles page.
INSERT INTO "Permission"(id,name,description) VALUES
 (md5('handheld:stations')::uuid::text,'handheld:stations','Register store PCs as handheld stations, issue and revoke their keys, rename handhelds')
ON CONFLICT(name) DO NOTHING;
INSERT INTO "RolePermission"("roleId","permissionId")
SELECT r.id,p.id FROM "Role" r CROSS JOIN "Permission" p
WHERE r.name IN ('SuperAdmin','Admin') AND p.name = 'handheld:stations'
ON CONFLICT DO NOTHING;

-- Job card revamp, phase 0: the stage model.
-- Adds the stage each job card is at, who holds it and since when, plus a stage event log.
-- Existing rows get a stage derived from their status (the same mapping as
-- stageForLegacyStatus in src/modules/service/job-stage.logic.ts). Legacy status spellings
-- are normalised to the canonical lifecycle values in the same step.
-- Only the statements for this change are included; unrelated schema drift is left alone.

-- CreateEnum
CREATE TYPE "JobStage" AS ENUM ('CHECK_IN', 'DIAGNOSIS', 'WARRANTY', 'ESTIMATE', 'REPAIR', 'QUALITY_CHECK', 'BILLING', 'DELIVERY', 'CLOSED', 'CANCELLED');

-- AlterTable
ALTER TABLE "JobCard" ADD COLUMN "stage" "JobStage" NOT NULL DEFAULT 'CHECK_IN',
ADD COLUMN "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "stageOwnerId" TEXT,
ADD COLUMN "stageOwnerRole" TEXT,
ALTER COLUMN "status" SET DEFAULT 'OPEN';

-- CreateTable
CREATE TABLE "JobStageEvent" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "fromStage" "JobStage",
    "toStage" "JobStage" NOT NULL,
    "action" TEXT,
    "actorId" TEXT,
    "ownerId" TEXT,
    "ownerRole" TEXT,
    "note" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobStageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobStageEvent_jobCardId_createdAt_idx" ON "JobStageEvent"("jobCardId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobStageEvent_jobCardId_requestId_key" ON "JobStageEvent"("jobCardId", "requestId");

-- CreateIndex
CREATE INDEX "JobCard_branchId_stage_idx" ON "JobCard"("branchId", "stage");

-- AddForeignKey
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_stageOwnerId_fkey" FOREIGN KEY ("stageOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStageEvent" ADD CONSTRAINT "JobStageEvent_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStageEvent" ADD CONSTRAINT "JobStageEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStageEvent" ADD CONSTRAINT "JobStageEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data: normalise legacy status spellings to the canonical lifecycle.
-- Mirrors normaliseJobStatus in job-stage.logic.ts and canonicalJobStatus on the client.
-- A spelling change is not a lifecycle change, so the notification capture trigger is paused.
ALTER TABLE "JobCard" DISABLE TRIGGER "jobcard_notification_capture";
UPDATE "JobCard" SET "status" = CASE "status"
    WHEN 'Open' THEN 'OPEN'
    WHEN 'Pending' THEN 'OPEN'
    WHEN 'In Progress' THEN 'IN_PROGRESS'
    WHEN 'On Hold' THEN 'IN_PROGRESS'
    WHEN 'Quality Check' THEN 'QC'
    WHEN 'Ready' THEN 'READY'
    WHEN 'Completed' THEN 'READY'
    WHEN 'COMPLETED' THEN 'READY'
    WHEN 'Billed' THEN 'BILLED'
    WHEN 'Closed' THEN 'DELIVERED'
    WHEN 'CLOSED' THEN 'DELIVERED'
    WHEN 'Delivered' THEN 'DELIVERED'
    WHEN 'Cancelled' THEN 'CANCELLED'
    WHEN 'Canceled' THEN 'CANCELLED'
    WHEN 'CANCELED' THEN 'CANCELLED'
    ELSE "status"
  END
WHERE "status" IN ('Open', 'Pending', 'In Progress', 'On Hold', 'Quality Check', 'Ready', 'Completed', 'COMPLETED',
                   'Billed', 'Closed', 'CLOSED', 'Delivered', 'Cancelled', 'Canceled', 'CANCELED');
ALTER TABLE "JobCard" ENABLE TRIGGER "jobcard_notification_capture";

-- Data: stage from status. Unknown statuses are treated as open work at the estimate stage.
-- TODO(confirm): no unknown statuses were expected; any found are left as they are and shown at Estimate.
UPDATE "JobCard" SET "stage" = (CASE "status"
    WHEN 'OPEN' THEN 'ESTIMATE'
    WHEN 'IN_PROGRESS' THEN 'REPAIR'
    WHEN 'WAITING_PARTS' THEN 'REPAIR'
    WHEN 'QC' THEN 'QUALITY_CHECK'
    WHEN 'READY' THEN 'BILLING'
    WHEN 'BILLED' THEN 'DELIVERY'
    WHEN 'DELIVERED' THEN 'CLOSED'
    WHEN 'CANCELLED' THEN 'CANCELLED'
    ELSE 'ESTIMATE'
  END)::"JobStage";

-- Data: the stage owner. Mirrors stageOwnerFor in job-stage.logic.ts.
UPDATE "JobCard" SET
  "stageOwnerId" = CASE
    WHEN "stage" = 'ESTIMATE' THEN "serviceAdvisorId"
    WHEN "stage" = 'REPAIR' THEN "technicianId"
    WHEN "stage" = 'QUALITY_CHECK' THEN "qualityInspectorId"
    WHEN "stage" = 'DELIVERY' THEN COALESCE("deliveryAdvisorId", "serviceAdvisorId")
    ELSE NULL
  END,
  "stageOwnerRole" = CASE
    WHEN "stage" = 'ESTIMATE' THEN 'ServiceAdviser'
    WHEN "stage" = 'REPAIR' AND "technicianId" IS NOT NULL THEN 'Technician'
    WHEN "stage" = 'REPAIR' THEN 'WorkshopManager'
    WHEN "stage" = 'QUALITY_CHECK' THEN 'WorkshopManager'
    WHEN "stage" = 'BILLING' THEN 'BillingOfficer'
    WHEN "stage" = 'DELIVERY' THEN 'ServiceAdviser'
    ELSE NULL
  END;

-- Data: when the job entered its stage. The latest status change, or the last update.
UPDATE "JobCard" j SET "stageEnteredAt" = COALESCE(
  (SELECT max(h."createdAt") FROM "JobCardStatusHistory" h WHERE h."jobCardId" = j.id),
  j."updatedAt",
  j."createdAt"
);

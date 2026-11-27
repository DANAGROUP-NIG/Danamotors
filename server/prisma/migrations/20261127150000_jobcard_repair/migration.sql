-- Job card revamp phase 6: Repair. Work lines, new findings during repair and supplementary estimates.
-- Additive. Work lines are backfilled for jobs already at Repair from their approved estimate.

-- CreateEnum
CREATE TYPE "WorkLineStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'WAITING_PARTS', 'DONE');

-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN "supplementary" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "EstimateLine" ADD COLUMN "carriedOver" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "JobFinding" ADD COLUMN "estimateId" TEXT,
ADD COLUMN "raisedDuringRepair" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "requestId" TEXT;

-- CreateTable
CREATE TABLE "JobWorkLine" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "estimateLineId" TEXT,
    "kind" TEXT NOT NULL,
    "labourItemId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "payer" "FindingPayer" NOT NULL DEFAULT 'CUSTOMER',
    "campaignId" TEXT,
    "supplementary" BOOLEAN NOT NULL DEFAULT false,
    "status" "WorkLineStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "technicianId" TEXT,
    "startedAt" TIMESTAMP(3),
    "resumedAt" TIMESTAMP(3),
    "workedSeconds" INTEGER NOT NULL DEFAULT 0,
    "doneAt" TIMESTAMP(3),
    "labourLineId" TEXT,
    "lastRequestId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobWorkLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobWorkLine_labourLineId_key" ON "JobWorkLine"("labourLineId");
CREATE INDEX "JobWorkLine_technicianId_status_idx" ON "JobWorkLine"("technicianId", "status");
CREATE UNIQUE INDEX "JobWorkLine_jobCardId_sourceKey_key" ON "JobWorkLine"("jobCardId", "sourceKey");
CREATE UNIQUE INDEX "JobFinding_requestId_key" ON "JobFinding"("requestId");

-- AddForeignKey
ALTER TABLE "JobFinding" ADD CONSTRAINT "JobFinding_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobWorkLine" ADD CONSTRAINT "JobWorkLine_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobWorkLine" ADD CONSTRAINT "JobWorkLine_estimateLineId_fkey" FOREIGN KEY ("estimateLineId") REFERENCES "EstimateLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobWorkLine" ADD CONSTRAINT "JobWorkLine_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobWorkLine" ADD CONSTRAINT "JobWorkLine_labourLineId_fkey" FOREIGN KEY ("labourLineId") REFERENCES "JobCardLabour"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: jobs already at Repair get a work line for each approved service and labour line of their
-- latest decided estimate revision. Work already recorded on a labour line counts as done.
WITH latest AS (
  SELECT DISTINCT ON (e."jobCardId") e."id", e."jobCardId"
  FROM "Estimate" e
  JOIN "JobCard" j ON j."id" = e."jobCardId"
  WHERE j."stage" = 'REPAIR' AND j."jobType" <> 'PDI'
  ORDER BY e."jobCardId", e."version" DESC, e."createdAt" DESC, e."id" DESC
), approved AS (
  SELECT l.*, j."technicianId", fi."campaignId" AS "itemCampaignId"
  FROM latest
  JOIN "EstimateLine" l ON l."estimateId" = latest."id"
  JOIN "JobCard" j ON j."id" = latest."jobCardId"
  LEFT JOIN "JobFindingItem" fi ON fi."id" = l."findingItemId"
  WHERE EXISTS (SELECT 1 FROM "CustomerApproval" a WHERE a."estimateId" = latest."id" AND a."approved" = true)
    AND l."type" IN ('SERVICE', 'LABOUR', 'INCLUDED_LABOUR')
    AND l."referenceId" IS NOT NULL
    AND l."customerDecision" IS DISTINCT FROM 'DECLINED'
)
INSERT INTO "JobWorkLine" ("id", "jobCardId", "sourceKey", "estimateLineId", "kind", "labourItemId", "description", "quantity", "payer", "campaignId", "status", "technicianId", "doneAt", "labourLineId", "sortOrder", "updatedAt")
SELECT DISTINCT ON (a."estimateId", CASE WHEN a."type" = 'SERVICE' THEN 'SERVICE:' ELSE 'LABOUR:' END || a."referenceId")
  gen_random_uuid()::text,
  (SELECT e."jobCardId" FROM "Estimate" e WHERE e."id" = a."estimateId"),
  CASE WHEN a."type" = 'SERVICE' THEN 'SERVICE:' ELSE 'LABOUR:' END || a."referenceId",
  a."id",
  CASE WHEN a."type" = 'SERVICE' THEN 'SERVICE' ELSE 'LABOUR' END,
  CASE WHEN a."type" = 'SERVICE' THEN NULL ELSE a."referenceId" END,
  a."description",
  a."quantity",
  a."payer",
  a."itemCampaignId",
  CASE WHEN done."id" IS NULL THEN 'NOT_STARTED'::"WorkLineStatus" ELSE 'DONE'::"WorkLineStatus" END,
  a."technicianId",
  done."createdAt",
  done."id",
  a."sortOrder",
  CURRENT_TIMESTAMP
FROM approved a
LEFT JOIN LATERAL (
  SELECT jl."id", jl."createdAt" FROM "JobCardLabour" jl
  JOIN "Estimate" e ON e."id" = a."estimateId"
  WHERE a."type" <> 'SERVICE' AND jl."jobCardId" = e."jobCardId" AND jl."labourItemId" = a."referenceId"
  ORDER BY jl."createdAt" ASC, jl."id" ASC LIMIT 1
) done ON true
ORDER BY a."estimateId", CASE WHEN a."type" = 'SERVICE' THEN 'SERVICE:' ELSE 'LABOUR:' END || a."referenceId", a."sortOrder"
ON CONFLICT DO NOTHING;

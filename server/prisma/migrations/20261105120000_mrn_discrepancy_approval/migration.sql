-- Legacy S/E approval: MIT and STN receipts with damaged or short units wait for approval by a user with
-- stock:discrepancy:approve. Stock is posted at receipt either way.
CREATE TYPE "MrnDiscrepancyStatus" AS ENUM ('PENDING', 'APPROVED');

ALTER TABLE "MaterialReceiptNote"
  ADD COLUMN "discrepancyStatus" "MrnDiscrepancyStatus",
  ADD COLUMN "discrepancyApprovedById" TEXT,
  ADD COLUMN "discrepancyApprovedAt" TIMESTAMP(3),
  ADD COLUMN "discrepancyRemark" TEXT;

ALTER TABLE "MaterialReceiptNote"
  ADD CONSTRAINT "MaterialReceiptNote_discrepancyApprovedById_fkey"
  FOREIGN KEY ("discrepancyApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "MaterialReceiptNote_discrepancyStatus_idx" ON "MaterialReceiptNote"("discrepancyStatus");

-- Existing Mobis and transfer receipts with damaged or short units have never been approved: they wait too.
UPDATE "MaterialReceiptNote"
SET "discrepancyStatus" = 'PENDING'
WHERE "source" IN ('MOBIS', 'BRANCH_TRANSFER') AND ("totalDamaged" > 0 OR "totalShort" > 0);

-- An approved discrepancy always records when it was approved. (The approver may later be cleared
-- if that user is deleted, so only the time is required.)
ALTER TABLE "MaterialReceiptNote"
  ADD CONSTRAINT "MaterialReceiptNote_discrepancy_approval_check"
  CHECK ("discrepancyStatus" IS DISTINCT FROM 'APPROVED' OR "discrepancyApprovedAt" IS NOT NULL);

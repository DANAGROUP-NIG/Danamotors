ALTER TABLE "Receipt" ADD COLUMN "advanceJobCardId" TEXT;
ALTER TABLE "Receipt" ADD COLUMN "advanceSnapshot" JSONB;
ALTER TABLE "ReceiptAllocation" ADD COLUMN "advanceReference" TEXT;
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_advanceJobCardId_fkey"
  FOREIGN KEY ("advanceJobCardId") REFERENCES "JobCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Receipt_advanceJobCardId_status_idx" ON "Receipt"("advanceJobCardId", "status");

-- Retain existing deposits and reserve their unallocated funds for their job.
UPDATE "Receipt" r SET "advanceJobCardId" = j.id
FROM "JobCard" j WHERE j."depositReceiptId" = r.id;

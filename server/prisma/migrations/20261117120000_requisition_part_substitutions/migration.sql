ALTER TABLE "PartRequisitionLine" ADD COLUMN "requestedSparePartId" TEXT;
ALTER TABLE "PartRequisitionLine" ADD COLUMN "substitutionReason" TEXT;
ALTER TABLE "PartRequisitionLine" ADD CONSTRAINT "PartRequisitionLine_requestedSparePartId_fkey"
  FOREIGN KEY ("requestedSparePartId") REFERENCES "SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PartRequisitionLine_requestedSparePartId_idx" ON "PartRequisitionLine"("requestedSparePartId");
-- Historical requested identities are unknown; do not invent a backfill.

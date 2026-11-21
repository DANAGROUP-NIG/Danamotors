-- Roll back application code first and retain/export substitution trace before dropping it.
DROP INDEX "PartRequisitionLine_requestedSparePartId_idx";
ALTER TABLE "PartRequisitionLine" DROP CONSTRAINT "PartRequisitionLine_requestedSparePartId_fkey";
ALTER TABLE "PartRequisitionLine" DROP COLUMN "substitutionReason";
ALTER TABLE "PartRequisitionLine" DROP COLUMN "requestedSparePartId";

-- CPD transfers as CPD actually works (legacy CPDAutoEnhancer, 2024-2026):
--   * an indent is filled over several STNs as stock arrives (38% of indents),
--   * one STN carries several indents of the same branch (30% of STNs),
--   * CPD sends stock with no indent at all (10% of STNs, e.g. the monthly Microcat recharge).

ALTER TYPE "IndentStatus" ADD VALUE 'PARTLY_DISPATCHED';

-- Indent line: how much has shipped across all STNs.
ALTER TABLE "BranchIndentLine" ADD COLUMN "dispatchedQuantity" INTEGER NOT NULL DEFAULT 0;
UPDATE "BranchIndentLine" l SET "dispatchedQuantity" = s.qty
FROM (SELECT "indentLineId", SUM("quantity")::int qty FROM "StockTransferNoteLine" GROUP BY "indentLineId") s
WHERE s."indentLineId" = l.id;
ALTER TABLE "BranchIndentLine" ADD CONSTRAINT "BranchIndentLine_dispatched_check"
  CHECK ("dispatchedQuantity" >= 0 AND ("approvedQuantity" IS NULL OR "dispatchedQuantity" <= "approvedQuantity"));

-- STN <-> indents becomes many-to-many.
CREATE TABLE "_StnIndents" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_StnIndents_AB_pkey" PRIMARY KEY ("A","B")
);
CREATE INDEX "_StnIndents_B_index" ON "_StnIndents"("B");
INSERT INTO "_StnIndents" ("A","B") SELECT "indentId", "id" FROM "StockTransferNote";
ALTER TABLE "_StnIndents" ADD CONSTRAINT "_StnIndents_A_fkey" FOREIGN KEY ("A") REFERENCES "BranchIndent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_StnIndents" ADD CONSTRAINT "_StnIndents_B_fkey" FOREIGN KEY ("B") REFERENCES "StockTransferNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Picking list -> the STN it shipped on; several picking lists per indent, one OPEN at a time.
ALTER TABLE "PickingList" ADD COLUMN "pickerName" TEXT, ADD COLUMN "stnId" TEXT;
UPDATE "PickingList" p SET "stnId" = s.id FROM "StockTransferNote" s WHERE s."pickingListId" = p.id;
DROP INDEX "PickingList_indentId_key";
CREATE INDEX "PickingList_indentId_idx" ON "PickingList"("indentId");
CREATE INDEX "PickingList_stnId_idx" ON "PickingList"("stnId");
CREATE UNIQUE INDEX "PickingList_one_open_per_indent" ON "PickingList"("indentId") WHERE "status" = 'OPEN';
ALTER TABLE "PickingList" ADD CONSTRAINT "PickingList_stnId_fkey" FOREIGN KEY ("stnId") REFERENCES "StockTransferNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockTransferNote" DROP CONSTRAINT "StockTransferNote_indentId_fkey";
ALTER TABLE "StockTransferNote" DROP CONSTRAINT "StockTransferNote_pickingListId_fkey";
ALTER TABLE "StockTransferNote" DROP COLUMN "indentId", DROP COLUMN "pickingListId";

-- Direct STN lines have no indent line or picking line; indent STN lines have both.
ALTER TABLE "StockTransferNoteLine" ALTER COLUMN "indentLineId" DROP NOT NULL, ALTER COLUMN "pickingLineId" DROP NOT NULL;
ALTER TABLE "StockTransferNoteLine" ADD CONSTRAINT "StockTransferNoteLine_source_check"
  CHECK (("indentLineId" IS NULL) = ("pickingLineId" IS NULL));

-- Packing list cum gate pass.
ALTER TABLE "PackingList" ADD COLUMN "gatePassNumber" TEXT;
CREATE UNIQUE INDEX "PackingList_gatePassNumber_key" ON "PackingList"("gatePassNumber");

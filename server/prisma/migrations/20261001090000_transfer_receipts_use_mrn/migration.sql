-- Branch-to-branch transfers no longer use MIT or SRN.
--
-- MIT (material in transit) is now only for Mobis invoices. A transfer travels on its STN, and
-- the receiving branch posts it with an MRN, the same document used for Mobis receipts. A
-- transfer received in parts gets one MRN per receipt, so receipt tallies move to the STN line.
--
-- Not yet deployed anywhere with real transfers: internal MITs are removed and SRNs are dropped
-- rather than converted. Received quantities already recorded are kept on the STN lines.

-- CreateEnum
CREATE TYPE "MrnSource" AS ENUM ('MOBIS', 'BRANCH_TRANSFER');

-- The receipt stage of an indent is now "MRN created". Renaming keeps existing history rows.
ALTER TYPE "IndentStatus" RENAME VALUE 'SRN_CREATED' TO 'MRN_CREATED';

-- ── STN lines carry the receipt tallies ──────────────────────────────────────
ALTER TABLE "StockTransferNoteLine" ADD COLUMN "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "damagedQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "shortQuantity" INTEGER NOT NULL DEFAULT 0;

UPDATE "StockTransferNoteLine" s
SET "receivedQuantity" = m."receivedQuantity",
    "damagedQuantity" = m."damagedQuantity",
    "shortQuantity" = m."shortQuantity"
FROM "MaterialInTransitLine" m
WHERE m."stnLineId" = s."id";

-- Nothing can be received beyond what the STN line sent.
ALTER TABLE "StockTransferNoteLine" ADD CONSTRAINT "StockTransferNoteLine_receipt_check"
  CHECK ("receivedQuantity" >= 0 AND "damagedQuantity" >= 0 AND "shortQuantity" >= 0
         AND "receivedQuantity" + "damagedQuantity" + "shortQuantity" <= "quantity");

-- ── Drop SRN ─────────────────────────────────────────────────────────────────
ALTER TABLE "StockReceiptLine" DROP CONSTRAINT "StockReceiptLine_mitLineId_fkey";
ALTER TABLE "StockReceiptLine" DROP CONSTRAINT "StockReceiptLine_partId_fkey";
ALTER TABLE "StockReceiptLine" DROP CONSTRAINT "StockReceiptLine_srnId_fkey";
ALTER TABLE "StockReceiptNote" DROP CONSTRAINT "StockReceiptNote_mitId_fkey";
ALTER TABLE "StockReceiptNote" DROP CONSTRAINT "StockReceiptNote_receivedById_fkey";
ALTER TABLE "StockReceiptNote" DROP CONSTRAINT "StockReceiptNote_receivingBranchId_fkey";
ALTER TABLE "StockReceiptNote" DROP CONSTRAINT "StockReceiptNote_sourceBranchId_fkey";
ALTER TABLE "StockReceiptNote" DROP CONSTRAINT "StockReceiptNote_stnId_fkey";
DROP TABLE "StockReceiptLine";
DROP TABLE "StockReceiptNote";
DROP TYPE "SrnStatus";

-- ── MIT becomes Mobis only ───────────────────────────────────────────────────
-- Internal transfer MITs never have an MRN, so they can be removed outright.
DELETE FROM "MaterialInTransitLine"
WHERE "mitId" IN (SELECT "id" FROM "MaterialInTransit" WHERE "sourceType" = 'INTERNAL_TRANSFER');
DELETE FROM "MaterialInTransit" WHERE "sourceType" = 'INTERNAL_TRANSFER';

ALTER TABLE "MaterialInTransit" DROP CONSTRAINT "MaterialInTransit_sourceBranchId_fkey";
ALTER TABLE "MaterialInTransit" DROP CONSTRAINT "MaterialInTransit_stnId_fkey";
ALTER TABLE "MaterialInTransitLine" DROP CONSTRAINT "MaterialInTransitLine_requestedPartId_fkey";
ALTER TABLE "MaterialInTransitLine" DROP CONSTRAINT "MaterialInTransitLine_stnLineId_fkey";

DROP INDEX "MaterialInTransit_sourceBranchId_idx";
DROP INDEX "MaterialInTransit_sourceType_idx";
DROP INDEX "MaterialInTransit_stnId_key";
DROP INDEX "MaterialInTransitLine_stnLineId_key";

ALTER TABLE "MaterialInTransit" DROP COLUMN "dispatchMode",
DROP COLUMN "sourceBranchId",
DROP COLUMN "sourceType",
DROP COLUMN "stnId",
DROP COLUMN "waybillNumber";

ALTER TABLE "MaterialInTransitLine" DROP COLUMN "requestedPartId",
DROP COLUMN "stnLineId";

DROP TYPE "MitSourceType";

-- ── MRN serves both Mobis and branch transfers ───────────────────────────────
-- Every existing MRN came from a Mobis MIT.
ALTER TABLE "MaterialReceiptNote" ADD COLUMN "source" "MrnSource" NOT NULL DEFAULT 'MOBIS',
ADD COLUMN "sourceBranchId" TEXT,
ADD COLUMN "stnId" TEXT,
ALTER COLUMN "mitId" DROP NOT NULL,
ALTER COLUMN "vendor" DROP NOT NULL,
ALTER COLUMN "conversionRate" SET DEFAULT 1,
-- P is the purchase form; a transfer MRN takes the STN's form, which may be blank.
ALTER COLUMN "taxForm" DROP NOT NULL,
ALTER COLUMN "taxForm" DROP DEFAULT;
ALTER TABLE "MaterialReceiptNote" ALTER COLUMN "source" DROP DEFAULT;

ALTER TABLE "MaterialReceiptNote" ADD CONSTRAINT "MaterialReceiptNote_source_check" CHECK (
  ("source" = 'MOBIS' AND "mitId" IS NOT NULL AND "stnId" IS NULL AND "vendor" IS NOT NULL)
  OR ("source" = 'BRANCH_TRANSFER' AND "stnId" IS NOT NULL AND "sourceBranchId" IS NOT NULL AND "mitId" IS NULL)
);

ALTER TABLE "MaterialReceiptLine" ADD COLUMN "stnLineId" TEXT,
ALTER COLUMN "mitLineId" DROP NOT NULL;

-- A receipt line comes from exactly one Mobis invoice line or one STN line.
ALTER TABLE "MaterialReceiptLine" ADD CONSTRAINT "MaterialReceiptLine_source_check" CHECK (
  ("mitLineId" IS NULL) <> ("stnLineId" IS NULL)
);

CREATE INDEX "MaterialReceiptLine_stnLineId_idx" ON "MaterialReceiptLine"("stnLineId");
CREATE INDEX "MaterialReceiptNote_stnId_idx" ON "MaterialReceiptNote"("stnId");
CREATE INDEX "MaterialReceiptNote_source_idx" ON "MaterialReceiptNote"("source");

ALTER TABLE "MaterialReceiptNote" ADD CONSTRAINT "MaterialReceiptNote_stnId_fkey" FOREIGN KEY ("stnId") REFERENCES "StockTransferNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialReceiptNote" ADD CONSTRAINT "MaterialReceiptNote_sourceBranchId_fkey" FOREIGN KEY ("sourceBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialReceiptLine" ADD CONSTRAINT "MaterialReceiptLine_stnLineId_fkey" FOREIGN KEY ("stnLineId") REFERENCES "StockTransferNoteLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Part sources become Part Master records: a local, used or repaired version of a part is its own
-- SparePart (own part number, stock, rates, bin), linked to its main part. Its source is its part flag.
--
-- The per-source prices table is retired. Existing estimate, issue, job card and bill lines are left
-- untouched: lines whose partSource differs from their part's flag (demo data only) cannot be mapped to
-- a source record automatically, and their partSource stays as a snapshot.
DROP TABLE "SparePartSourcePrice";

ALTER TABLE "SparePart" ADD COLUMN "sourceOfPartId" TEXT;
CREATE UNIQUE INDEX "SparePart_sourceOfPartId_partFlag_key" ON "SparePart"("sourceOfPartId", "partFlag");
ALTER TABLE "SparePart" ADD CONSTRAINT "SparePart_sourceOfPartId_fkey" FOREIGN KEY ("sourceOfPartId") REFERENCES "SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Source records are not alternates and are never claimed under warranty.
ALTER TABLE "SparePart" ADD CONSTRAINT "SparePart_source_record_check" CHECK (
  "sourceOfPartId" IS NULL OR ("role" = 'MAIN' AND "mainPartId" IS NULL AND "warrantyApplicable" = false)
);

-- One level deep, and a source record's flag differs from its main part's.
CREATE OR REPLACE FUNCTION spare_part_source_record_guard() RETURNS trigger AS $$
DECLARE
  main_flag TEXT;
  main_source TEXT;
BEGIN
  IF NEW."sourceOfPartId" IS NOT NULL THEN
    SELECT "partFlag", "sourceOfPartId" INTO main_flag, main_source FROM "SparePart" WHERE "id" = NEW."sourceOfPartId";
    IF main_source IS NOT NULL THEN
      RAISE EXCEPTION 'A source record cannot have source records of its own';
    END IF;
    IF main_flag = NEW."partFlag" THEN
      RAISE EXCEPTION 'A source record must have a different part flag from its main part';
    END IF;
    IF EXISTS (SELECT 1 FROM "SparePart" WHERE "sourceOfPartId" = NEW."id") THEN
      RAISE EXCEPTION 'A part with source records cannot itself be a source record';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM "SparePart" WHERE "sourceOfPartId" = NEW."id" AND "partFlag" = NEW."partFlag") THEN
    RAISE EXCEPTION 'A main part cannot share a part flag with one of its source records';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "SparePart_source_record_guard"
BEFORE INSERT OR UPDATE OF "sourceOfPartId", "partFlag" ON "SparePart"
FOR EACH ROW EXECUTE FUNCTION spare_part_source_record_guard();

-- Vendor receipts: local, used and repaired parts (and CPD's non-Mobis purchases) bought from a vendor.
ALTER TYPE "MrnSource" ADD VALUE 'VENDOR';

ALTER TABLE "MaterialReceiptNote" ADD COLUMN "vendorId" TEXT;
ALTER TABLE "MaterialReceiptNote" ADD COLUMN "invoiceDate" TIMESTAMP(3);
CREATE INDEX "MaterialReceiptNote_vendorId_idx" ON "MaterialReceiptNote"("vendorId");
ALTER TABLE "MaterialReceiptNote" ADD CONSTRAINT "MaterialReceiptNote_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A vendor receipt names its vendor and has no MIT, STN or source branch. (source is compared as text:
-- the new enum value cannot be used as a literal in the transaction that adds it.)
ALTER TABLE "MaterialReceiptNote" DROP CONSTRAINT "MaterialReceiptNote_source_check";
ALTER TABLE "MaterialReceiptNote" ADD CONSTRAINT "MaterialReceiptNote_source_check" CHECK (
  ("source"::text = 'MOBIS' AND "mitId" IS NOT NULL AND "stnId" IS NULL AND "vendor" IS NOT NULL)
  OR ("source"::text = 'BRANCH_TRANSFER' AND "stnId" IS NOT NULL AND "sourceBranchId" IS NOT NULL AND "mitId" IS NULL)
  OR ("source"::text = 'VENDOR' AND "vendorId" IS NOT NULL AND "vendor" IS NOT NULL AND "mitId" IS NULL AND "stnId" IS NULL AND "sourceBranchId" IS NULL)
);

-- A receipt line comes from at most one Mobis invoice line or STN line; vendor receipt lines have neither.
ALTER TABLE "MaterialReceiptLine" DROP CONSTRAINT "MaterialReceiptLine_source_check";
ALTER TABLE "MaterialReceiptLine" ADD CONSTRAINT "MaterialReceiptLine_source_check" CHECK (
  "mitLineId" IS NULL OR "stnLineId" IS NULL
);

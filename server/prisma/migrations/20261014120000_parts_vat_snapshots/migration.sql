BEGIN;
CREATE TABLE IF NOT EXISTS "PartTaxCategory" (code TEXT PRIMARY KEY,name TEXT NOT NULL);
INSERT INTO "PartTaxCategory" VALUES ('SPARES','Spares'),('OIL','Oil and lubricants'),('ACCESSORIES','Accessories') ON CONFLICT DO NOTHING;
ALTER TABLE "SparePart" ADD COLUMN IF NOT EXISTS "reportTaxCategoryCode" TEXT REFERENCES "PartTaxCategory"(code) ON DELETE RESTRICT;
-- Preserve taxCategory verbatim. Unknown values (including VAT) remain NULL for review.
UPDATE "SparePart" SET "reportTaxCategoryCode"=CASE UPPER(TRIM("taxCategory")) WHEN 'A' THEN 'SPARES' WHEN 'B' THEN 'OIL' WHEN 'C' THEN 'ACCESSORIES' WHEN 'SPARES' THEN 'SPARES' WHEN 'OIL' THEN 'OIL' WHEN 'ACCESSORIES' THEN 'ACCESSORIES' END WHERE "reportTaxCategoryCode" IS NULL;
INSERT INTO "FinanceSetting" VALUES ('JOB_BILL_PARTS_VAT_ENABLED','false',CURRENT_TIMESTAMP),('partsVatRates','{"SPARES":7.5,"OIL":7.5,"ACCESSORIES":7.5}',CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "billType" TEXT;
CREATE TABLE IF NOT EXISTS "InvoiceVatBreakdown" (id TEXT PRIMARY KEY,"invoiceId" TEXT NOT NULL REFERENCES "Invoice"(id) ON DELETE CASCADE,category TEXT NOT NULL,rate NUMERIC(5,2) NOT NULL,"saleAmount" NUMERIC(18,2) NOT NULL,discount NUMERIC(18,2) NOT NULL,"taxableAmount" NUMERIC(18,2) NOT NULL,vat NUMERIC(18,2) NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS "InvoiceVatBreakdown_invoiceId_category_rate_key" ON "InvoiceVatBreakdown"("invoiceId",category,rate);
ALTER TABLE "InvoiceLine" ADD COLUMN IF NOT EXISTS "jobCardLineId" TEXT REFERENCES "JobCardLine"(id) ON DELETE RESTRICT;
COMMIT;

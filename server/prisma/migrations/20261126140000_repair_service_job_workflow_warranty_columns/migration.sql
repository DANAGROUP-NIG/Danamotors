-- Repair databases that recorded the workflow migration before these columns were added.
ALTER TABLE "EstimateLine"
    ADD COLUMN IF NOT EXISTS "isUnderWarranty" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "catalogueRate" DOUBLE PRECISION;

ALTER TABLE "InvoiceLine"
    ADD COLUMN IF NOT EXISTS "isUnderWarranty" BOOLEAN NOT NULL DEFAULT false;

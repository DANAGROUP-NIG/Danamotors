-- Optional, immutable report data. Existing invoices and amounts are untouched.
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "taxRegisterSnapshot" JSONB;

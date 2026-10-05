-- Preserve the receiving branch independently of the customer's home branch.
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "serviceTotal" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "requestHash" TEXT;

UPDATE "Receipt" r SET "branchId" = COALESCE(
  (SELECT MIN(j."branchId") FROM "ReceiptAllocation" a
   JOIN "Invoice" i ON i.id = a."invoiceId" JOIN "JobCard" j ON j.id = i."jobCardId"
   WHERE a."receiptId" = r.id HAVING COUNT(DISTINCT j."branchId") = 1),
  (SELECT j."branchId" FROM "Invoice" i JOIN "JobCard" j ON j.id = i."jobCardId" WHERE i.id = r."invoiceId"),
  (SELECT u."branchId" FROM "User" u WHERE u.id = r."issuedById"),
  (SELECT c."branchId" FROM "Customer" c WHERE c.id = r."customerId")
) WHERE r."branchId" IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Receipt_branchId_fkey') THEN
    ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "Receipt_branchId_issuedAt_idx" ON "Receipt"("branchId", "issuedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Receipt_idempotencyKey_key" ON "Receipt"("idempotencyKey");

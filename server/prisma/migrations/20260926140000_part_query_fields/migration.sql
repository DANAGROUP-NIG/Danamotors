-- Legacy Part Query fields. Additive only, written idempotently.

-- Branch: legacy store-location code and premises grouping (sub-locations such as QSB or godowns).
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "parentBranchId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Branch_code_key" ON "Branch"("code");
DO $$ BEGIN
  ALTER TABLE "Branch" ADD CONSTRAINT "Branch_parentBranchId_fkey" FOREIGN KEY ("parentBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- InventoryStock: bin card per store location (legacy PARTBAL.bincard).
ALTER TABLE "InventoryStock" ADD COLUMN IF NOT EXISTS "binCard" TEXT;

-- SparePart: retail rate, tax status and part flag (legacy partmast.rtlrate, taxable, partflag).
ALTER TABLE "SparePart" ADD COLUMN IF NOT EXISTS "retailRate" DOUBLE PRECISION;
ALTER TABLE "SparePart" ADD COLUMN IF NOT EXISTS "taxable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SparePart" ADD COLUMN IF NOT EXISTS "partFlag" TEXT NOT NULL DEFAULT 'O';

-- Align Part Master and branch indents with the legacy system.
-- Additive only, written idempotently so it can run against existing databases.

-- ── Enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "MobisOrderMode" AS ENUM ('AIR', 'COURIER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "TransportMode" ADD VALUE IF NOT EXISTS 'DOOR_DELIVERY';

-- ── Legacy pricing categories (Category table) ───────────────────────────────
CREATE TABLE IF NOT EXISTS "PartCategory" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "markupMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartCategory_pkey" PRIMARY KEY ("code")
);

-- Retail rate = dealer rate x multiplier (e.g. 9056.34 x 2.07 = 18746.62 for category A).
INSERT INTO "PartCategory" ("code", "description", "markupMultiplier") VALUES
  ('A', 'Co-op parts', 2.07),
  ('B', 'Service parts', 2.07),
  ('C', 'General parts', 3.33),
  ('D', 'DGR parts', 3.33),
  ('E', 'Engine / gear-box', 2.5),
  ('F', 'FOC parts', 0.0001),
  ('H', 'High value (RR > 1M)', 2.5),
  ('I', 'DFM consumables', 1.5),
  ('L', 'Local consumable', 1.5),
  ('M', 'DFM parts', 3.8),
  ('N', 'Non-Kia parts', 3.33),
  ('O', 'Oil & lubricants', 1.5),
  ('P', 'Paint & paint material', 1.5),
  ('Q', 'TSB / QC parts', 2.5),
  ('R', 'Renault parts', 5.58),
  ('S', 'SST / tools / KDS / GDS', 1.5),
  ('T', 'Tyre & battery', 1.5),
  ('V', 'Microcat DVD', 1),
  ('W', 'Local workshop tools', 1),
  ('X', 'Slow moving (5-10 years)', 3.5),
  ('Y', 'Surplus stock', 1),
  ('Z', 'Vintage (> 10 years)', 2.5)
ON CONFLICT ("code") DO NOTHING;

-- ── Spare parts ──────────────────────────────────────────────────────────────
ALTER TABLE "SparePart" ADD COLUMN IF NOT EXISTS "priceCategoryCode" TEXT;
DO $$ BEGIN
  ALTER TABLE "SparePart" ADD CONSTRAINT "SparePart_priceCategoryCode_fkey" FOREIGN KEY ("priceCategoryCode") REFERENCES "PartCategory"("code") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Parts created without a code received a random UUID. Use the part number
-- instead, unless another part already uses that value as its code.
UPDATE "SparePart" s
SET "partCode" = s."partNumber"
WHERE s."partCode" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND NOT EXISTS (
    SELECT 1 FROM "SparePart" o WHERE o."partCode" = s."partNumber" AND o."id" <> s."id"
  );

-- ── Branch indent lines ──────────────────────────────────────────────────────
ALTER TABLE "BranchIndentLine" ADD COLUMN IF NOT EXISTS "stockOrderQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BranchIndentLine" ADD COLUMN IF NOT EXISTS "mobisOrderMode" "MobisOrderMode";
DO $$ BEGIN
  ALTER TABLE "BranchIndentLine" ADD CONSTRAINT "BranchIndentLine_stockOrderQuantity_check" CHECK ("stockOrderQuantity" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

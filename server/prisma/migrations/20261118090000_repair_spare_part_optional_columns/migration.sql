-- Repair optional catalogue columns omitted from older databases or migration baselines.
-- Existing columns and values are preserved; historical values remain unknown.
ALTER TABLE "SparePart"
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "category" TEXT,
  ADD COLUMN IF NOT EXISTS "binLocation" TEXT,
  ADD COLUMN IF NOT EXISTS "storeLocation" TEXT;

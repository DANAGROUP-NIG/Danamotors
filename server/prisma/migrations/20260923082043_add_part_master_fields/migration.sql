-- CreateEnum
CREATE TYPE "PartStatus" AS ENUM ('ACTIVE', 'BLOCKED');

-- AlterTable
ALTER TABLE "SparePart" ADD COLUMN     "binLocation" TEXT,
ADD COLUMN     "maxLevel" DOUBLE PRECISION,
ADD COLUMN     "minLevel" DOUBLE PRECISION,
ADD COLUMN     "partCode" TEXT,
ADD COLUMN     "partStatus" "PartStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "reorderQty" DOUBLE PRECISION,
ADD COLUMN     "storeLocation" TEXT,
ADD COLUMN     "taxCategory" TEXT,
ADD COLUMN     "taxForm" TEXT,
ADD COLUMN     "uom" TEXT NOT NULL DEFAULT 'UNIT';

-- Backfill partCode for existing rows with a deterministic, unique value.
UPDATE "SparePart" SET "partCode" = "id" WHERE "partCode" IS NULL;

-- Make partCode required and enforce uniqueness now that all rows have a value.
ALTER TABLE "SparePart" ALTER COLUMN "partCode" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "SparePart_partCode_key" ON "SparePart"("partCode");

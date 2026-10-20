-- Part rate and bin location history (legacy PartRateHistory, PartBinHistory) for the MIS reports.
-- CreateEnum
CREATE TYPE "PartChangeAction" AS ENUM ('ADDED', 'EDITED', 'DELETED');

-- CreateTable
CREATE TABLE "PartRateHistory" (
    "id" TEXT NOT NULL,
    "partId" TEXT,
    "partNumber" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "partFlag" TEXT NOT NULL,
    "priceCategoryCode" TEXT,
    "action" "PartChangeAction" NOT NULL,
    "oldDealerRate" DOUBLE PRECISION,
    "newDealerRate" DOUBLE PRECISION,
    "oldRetailRate" DOUBLE PRECISION,
    "newRetailRate" DOUBLE PRECISION,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartRateHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartBinHistory" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "branchId" TEXT,
    "oldBin" TEXT,
    "newBin" TEXT,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartBinHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartRateHistory_changedAt_idx" ON "PartRateHistory"("changedAt");

-- CreateIndex
CREATE INDEX "PartRateHistory_partId_idx" ON "PartRateHistory"("partId");

-- CreateIndex
CREATE INDEX "PartBinHistory_changedAt_idx" ON "PartBinHistory"("changedAt");

-- CreateIndex
CREATE INDEX "PartBinHistory_partId_idx" ON "PartBinHistory"("partId");

-- AddForeignKey
ALTER TABLE "PartRateHistory" ADD CONSTRAINT "PartRateHistory_partId_fkey" FOREIGN KEY ("partId") REFERENCES "SparePart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartRateHistory" ADD CONSTRAINT "PartRateHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartBinHistory" ADD CONSTRAINT "PartBinHistory_partId_fkey" FOREIGN KEY ("partId") REFERENCES "SparePart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartBinHistory" ADD CONSTRAINT "PartBinHistory_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartBinHistory" ADD CONSTRAINT "PartBinHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


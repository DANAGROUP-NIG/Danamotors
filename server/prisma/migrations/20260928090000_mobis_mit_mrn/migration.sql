-- Mobis purchase receiving: MIT import fields and Material Receipt Note (issue #62, Process B).
-- Additive only. Written idempotently so it can run against existing databases.

-- AlterTable
ALTER TABLE "MaterialInTransit" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "MaterialInTransit" ADD COLUMN IF NOT EXISTS "physicalReceiptDate" TIMESTAMP(3);
ALTER TABLE "MaterialInTransit" ADD COLUMN IF NOT EXISTS "sourceFileName" TEXT;

-- AlterTable
ALTER TABLE "MaterialInTransitLine" ADD COLUMN IF NOT EXISTS "filePartName" TEXT;
ALTER TABLE "MaterialInTransitLine" ADD COLUMN IF NOT EXISTS "filePartNumber" TEXT;
ALTER TABLE "MaterialInTransitLine" ADD COLUMN IF NOT EXISTS "intRef" TEXT;
ALTER TABLE "MaterialInTransitLine" ADD COLUMN IF NOT EXISTS "newPart" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "MaterialReceiptNote" (
    "id" TEXT NOT NULL,
    "mrnNumber" TEXT NOT NULL,
    "mitId" TEXT NOT NULL,
    "receivingBranchId" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "taxForm" TEXT NOT NULL DEFAULT 'P',
    "conversionRate" DOUBLE PRECISION NOT NULL,
    "receiptDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remarks" TEXT,
    "totalReceived" INTEGER NOT NULL DEFAULT 0,
    "totalDamaged" INTEGER NOT NULL DEFAULT 0,
    "totalShort" INTEGER NOT NULL DEFAULT 0,
    "totalValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialReceiptNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MaterialReceiptLine" (
    "id" TEXT NOT NULL,
    "mrnId" TEXT NOT NULL,
    "mitLineId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "damagedQuantity" INTEGER NOT NULL DEFAULT 0,
    "shortQuantity" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "remarks" TEXT,

    CONSTRAINT "MaterialReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MaterialReceiptNote_mrnNumber_key" ON "MaterialReceiptNote"("mrnNumber");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MaterialReceiptNote_mitId_key" ON "MaterialReceiptNote"("mitId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MaterialReceiptNote_receivingBranchId_idx" ON "MaterialReceiptNote"("receivingBranchId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MaterialReceiptLine_mrnId_idx" ON "MaterialReceiptLine"("mrnId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MaterialReceiptLine_mitLineId_idx" ON "MaterialReceiptLine"("mitLineId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MaterialInTransit_vendor_invoiceNumber_idx" ON "MaterialInTransit"("vendor", "invoiceNumber");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MaterialReceiptNote" ADD CONSTRAINT "MaterialReceiptNote_mitId_fkey" FOREIGN KEY ("mitId") REFERENCES "MaterialInTransit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MaterialReceiptNote" ADD CONSTRAINT "MaterialReceiptNote_receivingBranchId_fkey" FOREIGN KEY ("receivingBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MaterialReceiptNote" ADD CONSTRAINT "MaterialReceiptNote_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MaterialReceiptLine" ADD CONSTRAINT "MaterialReceiptLine_mrnId_fkey" FOREIGN KEY ("mrnId") REFERENCES "MaterialReceiptNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MaterialReceiptLine" ADD CONSTRAINT "MaterialReceiptLine_mitLineId_fkey" FOREIGN KEY ("mitLineId") REFERENCES "MaterialInTransitLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MaterialReceiptLine" ADD CONSTRAINT "MaterialReceiptLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- Quantity guards for MRN lines.
DO $$ BEGIN
  ALTER TABLE "MaterialReceiptLine" ADD CONSTRAINT "MaterialReceiptLine_quantities_check" CHECK ("receivedQuantity" >= 0 AND "damagedQuantity" >= 0 AND "shortQuantity" >= 0 AND "receivedQuantity" + "damagedQuantity" + "shortQuantity" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

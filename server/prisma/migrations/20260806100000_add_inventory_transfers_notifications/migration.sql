-- Reconciliation migration: brings the migration history in sync with schema.prisma.
-- The live database was previously updated via `prisma db push`, so these statements
-- are written idempotently (IF [NOT] EXISTS / existence-checked constraints) so they
-- can be applied safely to BOTH fresh databases and the existing production database.

-- Drop legacy stock columns from SparePart (stock now lives on InventoryStock)
ALTER TABLE "public"."SparePart" DROP COLUMN IF EXISTS "stock";
ALTER TABLE "public"."SparePart" DROP COLUMN IF EXISTS "minimumStock";

-- Add registrationNumber to Vehicle
ALTER TABLE "public"."Vehicle" ADD COLUMN IF NOT EXISTS "registrationNumber" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."InventoryStock" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
    "minimumStock" INTEGER NOT NULL DEFAULT 0,
    "rackLocation" TEXT,
    "maximumStock" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."StockTransaction" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "referenceId" TEXT,
    "notes" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."InterBranchTransfer" (
    "id" TEXT NOT NULL,
    "transferNumber" TEXT NOT NULL,
    "requestingBranchId" TEXT NOT NULL,
    "sourceBranchId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "dispatchedById" TEXT,
    "receivedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "notes" TEXT,
    "approvedAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterBranchTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."InterBranchTransferItem" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "requestedQuantity" INTEGER NOT NULL,
    "dispatchedQuantity" INTEGER,
    "receivedQuantity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterBranchTransferItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Vehicle_registrationNumber_key" ON "public"."Vehicle"("registrationNumber");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryStock_branchId_partId_key" ON "public"."InventoryStock"("branchId", "partId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "InterBranchTransfer_transferNumber_key" ON "public"."InterBranchTransfer"("transferNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_userId_readAt_idx" ON "public"."Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "public"."Notification"("userId", "createdAt");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryStock_branchId_fkey') THEN
    ALTER TABLE "public"."InventoryStock" ADD CONSTRAINT "InventoryStock_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryStock_partId_fkey') THEN
    ALTER TABLE "public"."InventoryStock" ADD CONSTRAINT "InventoryStock_partId_fkey" FOREIGN KEY ("partId") REFERENCES "public"."SparePart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockTransaction_partId_fkey') THEN
    ALTER TABLE "public"."StockTransaction" ADD CONSTRAINT "StockTransaction_partId_fkey" FOREIGN KEY ("partId") REFERENCES "public"."SparePart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockTransaction_recordedById_fkey') THEN
    ALTER TABLE "public"."StockTransaction" ADD CONSTRAINT "StockTransaction_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterBranchTransfer_requestingBranchId_fkey') THEN
    ALTER TABLE "public"."InterBranchTransfer" ADD CONSTRAINT "InterBranchTransfer_requestingBranchId_fkey" FOREIGN KEY ("requestingBranchId") REFERENCES "public"."Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterBranchTransfer_sourceBranchId_fkey') THEN
    ALTER TABLE "public"."InterBranchTransfer" ADD CONSTRAINT "InterBranchTransfer_sourceBranchId_fkey" FOREIGN KEY ("sourceBranchId") REFERENCES "public"."Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterBranchTransfer_requestedById_fkey') THEN
    ALTER TABLE "public"."InterBranchTransfer" ADD CONSTRAINT "InterBranchTransfer_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterBranchTransfer_approvedById_fkey') THEN
    ALTER TABLE "public"."InterBranchTransfer" ADD CONSTRAINT "InterBranchTransfer_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterBranchTransfer_dispatchedById_fkey') THEN
    ALTER TABLE "public"."InterBranchTransfer" ADD CONSTRAINT "InterBranchTransfer_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterBranchTransfer_receivedById_fkey') THEN
    ALTER TABLE "public"."InterBranchTransfer" ADD CONSTRAINT "InterBranchTransfer_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterBranchTransferItem_transferId_fkey') THEN
    ALTER TABLE "public"."InterBranchTransferItem" ADD CONSTRAINT "InterBranchTransferItem_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "public"."InterBranchTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InterBranchTransferItem_partId_fkey') THEN
    ALTER TABLE "public"."InterBranchTransferItem" ADD CONSTRAINT "InterBranchTransferItem_partId_fkey" FOREIGN KEY ("partId") REFERENCES "public"."SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_userId_fkey') THEN
    ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

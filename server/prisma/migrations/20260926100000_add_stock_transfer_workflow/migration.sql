-- Stock transfer workflow (issue #62, Process A).
-- Additive only. Written idempotently so it can run against existing databases.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "IndentStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PICKING', 'PICKED', 'STN_CREATED', 'PACKED', 'DISPATCHED', 'IN_TRANSIT', 'SRN_CREATED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'COMPLETED', 'REJECTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PickingListStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "StnStatus" AS ENUM ('CREATED', 'DISPATCHED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "TransferCaseStatus" AS ENUM ('PACKED', 'DISPATCHED', 'RECEIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PackingListStatus" AS ENUM ('PACKED', 'DISPATCHED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "TransportMode" AS ENUM ('ROAD', 'AIR', 'SEA', 'COURIER', 'HAND_DELIVERY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "MitSourceType" AS ENUM ('INTERNAL_TRANSFER', 'EXTERNAL_VENDOR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "MitStatus" AS ENUM ('IN_TRANSIT', 'VERIFIED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SrnStatus" AS ENUM ('COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "DocumentSequence" (
    "docType" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("docType","year")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BranchIndent" (
    "id" TEXT NOT NULL,
    "indentNumber" TEXT NOT NULL,
    "requestingBranchId" TEXT NOT NULL,
    "sourceBranchId" TEXT NOT NULL,
    "status" "IndentStatus" NOT NULL DEFAULT 'DRAFT',
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remarks" TEXT,
    "authorisedBy" TEXT,
    "authorisedAt" TIMESTAMP(3),
    "requestedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalRemarks" TEXT,
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchIndent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BranchIndentLine" (
    "id" TEXT NOT NULL,
    "indentId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "partId" TEXT NOT NULL,
    "partFlag" TEXT,
    "urgentQuantity" INTEGER NOT NULL DEFAULT 0,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "requestedQuantity" INTEGER NOT NULL,
    "approvedQuantity" INTEGER,
    "backOrderQuantity" INTEGER NOT NULL DEFAULT 0,
    "unitRate" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currentStock" INTEGER,
    "jobCardId" TEXT,
    "jobNumber" TEXT,
    "jobDate" TIMESTAMP(3),
    "vin" TEXT,
    "registrationNumber" TEXT,
    "vehicleModel" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchIndentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TransferStatusHistory" (
    "id" TEXT NOT NULL,
    "indentId" TEXT NOT NULL,
    "fromStatus" "IndentStatus",
    "toStatus" "IndentStatus" NOT NULL,
    "actorId" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PickingList" (
    "id" TEXT NOT NULL,
    "pickingNumber" TEXT NOT NULL,
    "indentId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" "PickingListStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PickingList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PickingListLine" (
    "id" TEXT NOT NULL,
    "pickingListId" TEXT NOT NULL,
    "indentLineId" TEXT NOT NULL,
    "requestedPartId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "isAlternate" BOOLEAN NOT NULL DEFAULT false,
    "availableQuantity" INTEGER NOT NULL,
    "pickedQuantity" INTEGER NOT NULL,
    "binLocation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PickingListLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StockTransferNote" (
    "id" TEXT NOT NULL,
    "stnNumber" TEXT NOT NULL,
    "indentId" TEXT NOT NULL,
    "pickingListId" TEXT NOT NULL,
    "sourceBranchId" TEXT NOT NULL,
    "destinationBranchId" TEXT NOT NULL,
    "status" "StnStatus" NOT NULL DEFAULT 'CREATED',
    "documentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taxForm" TEXT,
    "transportMode" "TransportMode",
    "remarks" TEXT,
    "stockDeducted" BOOLEAN NOT NULL DEFAULT false,
    "totalQuantity" INTEGER NOT NULL DEFAULT 0,
    "totalValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "dispatchedById" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockTransferNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StockTransferNoteLine" (
    "id" TEXT NOT NULL,
    "stnId" TEXT NOT NULL,
    "indentLineId" TEXT NOT NULL,
    "pickingLineId" TEXT NOT NULL,
    "requestedPartId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "isAlternate" BOOLEAN NOT NULL DEFAULT false,
    "quantity" INTEGER NOT NULL,
    "unitRate" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockTransferNoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TransferCase" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "stnId" TEXT NOT NULL,
    "packingListId" TEXT,
    "branchId" TEXT NOT NULL,
    "status" "TransferCaseStatus" NOT NULL DEFAULT 'PACKED',
    "packerName" TEXT,
    "weight" DOUBLE PRECISION,
    "totalQuantity" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransferCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TransferCaseLine" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "stnLineId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "TransferCaseLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PackingList" (
    "id" TEXT NOT NULL,
    "packingNumber" TEXT NOT NULL,
    "stnId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" "PackingListStatus" NOT NULL DEFAULT 'PACKED',
    "dispatchMode" "TransportMode",
    "waybillNumber" TEXT,
    "courierName" TEXT,
    "consignmentWeight" DOUBLE PRECISION,
    "packingDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    "remarks" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackingList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MaterialInTransit" (
    "id" TEXT NOT NULL,
    "mitNumber" TEXT NOT NULL,
    "sourceType" "MitSourceType" NOT NULL,
    "status" "MitStatus" NOT NULL DEFAULT 'IN_TRANSIT',
    "stnId" TEXT,
    "sourceBranchId" TEXT,
    "destinationBranchId" TEXT NOT NULL,
    "vendor" TEXT,
    "invoiceNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "conversionRate" DOUBLE PRECISION,
    "receivedMode" "TransportMode",
    "dispatchMode" "TransportMode",
    "waybillNumber" TEXT,
    "transitDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalCases" INTEGER NOT NULL DEFAULT 0,
    "totalQuantity" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialInTransit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MaterialInTransitLine" (
    "id" TEXT NOT NULL,
    "mitId" TEXT NOT NULL,
    "stnLineId" TEXT,
    "partId" TEXT NOT NULL,
    "requestedPartId" TEXT,
    "caseNumbers" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "orderNumber" TEXT,
    "lineNumber" INTEGER,
    "weight" DOUBLE PRECISION,
    "hsCode" TEXT,
    "orderedQuantity" INTEGER,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "damagedQuantity" INTEGER NOT NULL DEFAULT 0,
    "shortQuantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialInTransitLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StockReceiptNote" (
    "id" TEXT NOT NULL,
    "srnNumber" TEXT NOT NULL,
    "mitId" TEXT NOT NULL,
    "stnId" TEXT NOT NULL,
    "receivingBranchId" TEXT NOT NULL,
    "sourceBranchId" TEXT NOT NULL,
    "status" "SrnStatus" NOT NULL DEFAULT 'COMPLETED',
    "receiptDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taxForm" TEXT,
    "transportMode" "TransportMode",
    "remarks" TEXT,
    "totalReceived" INTEGER NOT NULL DEFAULT 0,
    "totalDamaged" INTEGER NOT NULL DEFAULT 0,
    "totalShort" INTEGER NOT NULL DEFAULT 0,
    "receivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockReceiptNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StockReceiptLine" (
    "id" TEXT NOT NULL,
    "srnId" TEXT NOT NULL,
    "mitLineId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "damagedQuantity" INTEGER NOT NULL DEFAULT 0,
    "shortQuantity" INTEGER NOT NULL DEFAULT 0,
    "remarks" TEXT,

    CONSTRAINT "StockReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BranchIndent_indentNumber_key" ON "BranchIndent"("indentNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BranchIndent_requestingBranchId_idx" ON "BranchIndent"("requestingBranchId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BranchIndent_sourceBranchId_idx" ON "BranchIndent"("sourceBranchId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BranchIndent_status_idx" ON "BranchIndent"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BranchIndent_requestedById_idx" ON "BranchIndent"("requestedById");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BranchIndent_createdAt_idx" ON "BranchIndent"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BranchIndentLine_partId_idx" ON "BranchIndentLine"("partId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BranchIndentLine_jobCardId_idx" ON "BranchIndentLine"("jobCardId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BranchIndentLine_indentId_lineNumber_key" ON "BranchIndentLine"("indentId", "lineNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TransferStatusHistory_indentId_createdAt_idx" ON "TransferStatusHistory"("indentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PickingList_pickingNumber_key" ON "PickingList"("pickingNumber");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PickingList_indentId_key" ON "PickingList"("indentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PickingList_branchId_idx" ON "PickingList"("branchId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PickingList_status_idx" ON "PickingList"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PickingListLine_partId_idx" ON "PickingListLine"("partId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PickingListLine_pickingListId_indentLineId_key" ON "PickingListLine"("pickingListId", "indentLineId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StockTransferNote_stnNumber_key" ON "StockTransferNote"("stnNumber");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StockTransferNote_indentId_key" ON "StockTransferNote"("indentId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StockTransferNote_pickingListId_key" ON "StockTransferNote"("pickingListId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StockTransferNote_sourceBranchId_idx" ON "StockTransferNote"("sourceBranchId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StockTransferNote_destinationBranchId_idx" ON "StockTransferNote"("destinationBranchId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StockTransferNote_status_idx" ON "StockTransferNote"("status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StockTransferNoteLine_pickingLineId_key" ON "StockTransferNoteLine"("pickingLineId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StockTransferNoteLine_stnId_idx" ON "StockTransferNoteLine"("stnId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StockTransferNoteLine_partId_idx" ON "StockTransferNoteLine"("partId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TransferCase_caseNumber_key" ON "TransferCase"("caseNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TransferCase_stnId_idx" ON "TransferCase"("stnId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TransferCase_packingListId_idx" ON "TransferCase"("packingListId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TransferCaseLine_stnLineId_idx" ON "TransferCaseLine"("stnLineId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TransferCaseLine_caseId_stnLineId_key" ON "TransferCaseLine"("caseId", "stnLineId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PackingList_packingNumber_key" ON "PackingList"("packingNumber");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PackingList_stnId_key" ON "PackingList"("stnId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PackingList_branchId_idx" ON "PackingList"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MaterialInTransit_mitNumber_key" ON "MaterialInTransit"("mitNumber");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MaterialInTransit_stnId_key" ON "MaterialInTransit"("stnId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MaterialInTransit_sourceType_idx" ON "MaterialInTransit"("sourceType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MaterialInTransit_status_idx" ON "MaterialInTransit"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MaterialInTransit_destinationBranchId_idx" ON "MaterialInTransit"("destinationBranchId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MaterialInTransit_sourceBranchId_idx" ON "MaterialInTransit"("sourceBranchId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MaterialInTransitLine_stnLineId_key" ON "MaterialInTransitLine"("stnLineId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MaterialInTransitLine_mitId_idx" ON "MaterialInTransitLine"("mitId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MaterialInTransitLine_partId_idx" ON "MaterialInTransitLine"("partId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StockReceiptNote_srnNumber_key" ON "StockReceiptNote"("srnNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StockReceiptNote_mitId_idx" ON "StockReceiptNote"("mitId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StockReceiptNote_stnId_idx" ON "StockReceiptNote"("stnId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StockReceiptNote_receivingBranchId_idx" ON "StockReceiptNote"("receivingBranchId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StockReceiptLine_srnId_idx" ON "StockReceiptLine"("srnId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StockReceiptLine_mitLineId_idx" ON "StockReceiptLine"("mitLineId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "BranchIndent" ADD CONSTRAINT "BranchIndent_requestingBranchId_fkey" FOREIGN KEY ("requestingBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "BranchIndent" ADD CONSTRAINT "BranchIndent_sourceBranchId_fkey" FOREIGN KEY ("sourceBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "BranchIndent" ADD CONSTRAINT "BranchIndent_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "BranchIndent" ADD CONSTRAINT "BranchIndent_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "BranchIndent" ADD CONSTRAINT "BranchIndent_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "BranchIndent" ADD CONSTRAINT "BranchIndent_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "BranchIndentLine" ADD CONSTRAINT "BranchIndentLine_indentId_fkey" FOREIGN KEY ("indentId") REFERENCES "BranchIndent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "BranchIndentLine" ADD CONSTRAINT "BranchIndentLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "BranchIndentLine" ADD CONSTRAINT "BranchIndentLine_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "TransferStatusHistory" ADD CONSTRAINT "TransferStatusHistory_indentId_fkey" FOREIGN KEY ("indentId") REFERENCES "BranchIndent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "TransferStatusHistory" ADD CONSTRAINT "TransferStatusHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PickingList" ADD CONSTRAINT "PickingList_indentId_fkey" FOREIGN KEY ("indentId") REFERENCES "BranchIndent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PickingList" ADD CONSTRAINT "PickingList_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PickingList" ADD CONSTRAINT "PickingList_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PickingList" ADD CONSTRAINT "PickingList_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PickingListLine" ADD CONSTRAINT "PickingListLine_pickingListId_fkey" FOREIGN KEY ("pickingListId") REFERENCES "PickingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PickingListLine" ADD CONSTRAINT "PickingListLine_indentLineId_fkey" FOREIGN KEY ("indentLineId") REFERENCES "BranchIndentLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PickingListLine" ADD CONSTRAINT "PickingListLine_requestedPartId_fkey" FOREIGN KEY ("requestedPartId") REFERENCES "SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PickingListLine" ADD CONSTRAINT "PickingListLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StockTransferNote" ADD CONSTRAINT "StockTransferNote_indentId_fkey" FOREIGN KEY ("indentId") REFERENCES "BranchIndent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StockTransferNote" ADD CONSTRAINT "StockTransferNote_pickingListId_fkey" FOREIGN KEY ("pickingListId") REFERENCES "PickingList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StockTransferNote" ADD CONSTRAINT "StockTransferNote_sourceBranchId_fkey" FOREIGN KEY ("sourceBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StockTransferNote" ADD CONSTRAINT "StockTransferNote_destinationBranchId_fkey" FOREIGN KEY ("destinationBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StockTransferNote" ADD CONSTRAINT "StockTransferNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StockTransferNote" ADD CONSTRAINT "StockTransferNote_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StockTransferNoteLine" ADD CONSTRAINT "StockTransferNoteLine_stnId_fkey" FOREIGN KEY ("stnId") REFERENCES "StockTransferNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StockTransferNoteLine" ADD CONSTRAINT "StockTransferNoteLine_indentLineId_fkey" FOREIGN KEY ("indentLineId") REFERENCES "BranchIndentLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StockTransferNoteLine" ADD CONSTRAINT "StockTransferNoteLine_pickingLineId_fkey" FOREIGN KEY ("pickingLineId") REFERENCES "PickingListLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StockTransferNoteLine" ADD CONSTRAINT "StockTransferNoteLine_requestedPartId_fkey" FOREIGN KEY ("requestedPartId") REFERENCES "SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StockTransferNoteLine" ADD CONSTRAINT "StockTransferNoteLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "TransferCase" ADD CONSTRAINT "TransferCase_stnId_fkey" FOREIGN KEY ("stnId") REFERENCES "StockTransferNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "TransferCase" ADD CONSTRAINT "TransferCase_packingListId_fkey" FOREIGN KEY ("packingListId") REFERENCES "PackingList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "TransferCase" ADD CONSTRAINT "TransferCase_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "TransferCase" ADD CONSTRAINT "TransferCase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "TransferCaseLine" ADD CONSTRAINT "TransferCaseLine_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TransferCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "TransferCaseLine" ADD CONSTRAINT "TransferCaseLine_stnLineId_fkey" FOREIGN KEY ("stnLineId") REFERENCES "StockTransferNoteLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PackingList" ADD CONSTRAINT "PackingList_stnId_fkey" FOREIGN KEY ("stnId") REFERENCES "StockTransferNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PackingList" ADD CONSTRAINT "PackingList_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PackingList" ADD CONSTRAINT "PackingList_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MaterialInTransit" ADD CONSTRAINT "MaterialInTransit_stnId_fkey" FOREIGN KEY ("stnId") REFERENCES "StockTransferNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MaterialInTransit" ADD CONSTRAINT "MaterialInTransit_sourceBranchId_fkey" FOREIGN KEY ("sourceBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MaterialInTransit" ADD CONSTRAINT "MaterialInTransit_destinationBranchId_fkey" FOREIGN KEY ("destinationBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MaterialInTransit" ADD CONSTRAINT "MaterialInTransit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MaterialInTransitLine" ADD CONSTRAINT "MaterialInTransitLine_mitId_fkey" FOREIGN KEY ("mitId") REFERENCES "MaterialInTransit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MaterialInTransitLine" ADD CONSTRAINT "MaterialInTransitLine_stnLineId_fkey" FOREIGN KEY ("stnLineId") REFERENCES "StockTransferNoteLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MaterialInTransitLine" ADD CONSTRAINT "MaterialInTransitLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MaterialInTransitLine" ADD CONSTRAINT "MaterialInTransitLine_requestedPartId_fkey" FOREIGN KEY ("requestedPartId") REFERENCES "SparePart"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StockReceiptNote" ADD CONSTRAINT "StockReceiptNote_mitId_fkey" FOREIGN KEY ("mitId") REFERENCES "MaterialInTransit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StockReceiptNote" ADD CONSTRAINT "StockReceiptNote_stnId_fkey" FOREIGN KEY ("stnId") REFERENCES "StockTransferNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StockReceiptNote" ADD CONSTRAINT "StockReceiptNote_receivingBranchId_fkey" FOREIGN KEY ("receivingBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StockReceiptNote" ADD CONSTRAINT "StockReceiptNote_sourceBranchId_fkey" FOREIGN KEY ("sourceBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StockReceiptNote" ADD CONSTRAINT "StockReceiptNote_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StockReceiptLine" ADD CONSTRAINT "StockReceiptLine_srnId_fkey" FOREIGN KEY ("srnId") REFERENCES "StockReceiptNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StockReceiptLine" ADD CONSTRAINT "StockReceiptLine_mitLineId_fkey" FOREIGN KEY ("mitLineId") REFERENCES "MaterialInTransitLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StockReceiptLine" ADD CONSTRAINT "StockReceiptLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- Quantity guards. The receipt check makes double-posting impossible at the database level.
DO $$ BEGIN
  ALTER TABLE "BranchIndentLine" ADD CONSTRAINT "BranchIndentLine_quantities_check" CHECK ("requestedQuantity" > 0 AND "urgentQuantity" >= 0 AND "stockQuantity" >= 0 AND "backOrderQuantity" >= 0 AND ("approvedQuantity" IS NULL OR ("approvedQuantity" >= 0 AND "approvedQuantity" <= "requestedQuantity")));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PickingListLine" ADD CONSTRAINT "PickingListLine_quantities_check" CHECK ("pickedQuantity" >= 0 AND "availableQuantity" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StockTransferNoteLine" ADD CONSTRAINT "StockTransferNoteLine_quantity_check" CHECK ("quantity" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TransferCaseLine" ADD CONSTRAINT "TransferCaseLine_quantity_check" CHECK ("quantity" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "MaterialInTransitLine" ADD CONSTRAINT "MaterialInTransitLine_receipt_check" CHECK ("receivedQuantity" >= 0 AND "damagedQuantity" >= 0 AND "shortQuantity" >= 0 AND "receivedQuantity" + "damagedQuantity" + "shortQuantity" <= "quantity");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StockReceiptLine" ADD CONSTRAINT "StockReceiptLine_quantities_check" CHECK ("receivedQuantity" >= 0 AND "damagedQuantity" >= 0 AND "shortQuantity" >= 0 AND "receivedQuantity" + "damagedQuantity" + "shortQuantity" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

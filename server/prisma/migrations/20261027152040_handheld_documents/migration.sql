-- Handheld (HHDC) documents for picking lists, CPOs and Mobis MITs: see doc/handheld.md.
-- Only the handheld objects; nothing else in the schema changes.

-- CreateEnum
CREATE TYPE "HandheldDocumentType" AS ENUM ('INDENT_PICK', 'CPO_PICK', 'MIT_RECEIVE');

-- CreateEnum
CREATE TYPE "HandheldDocumentStatus" AS ENUM ('SENT', 'UPLOADED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HandheldShortReason" AS ENUM ('NOT_FOUND', 'DAMAGED', 'LESS_IN_BIN', 'OTHER');

-- CreateTable
CREATE TABLE "HandheldDocument" (
    "id" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "type" "HandheldDocumentType" NOT NULL,
    "status" "HandheldDocumentStatus" NOT NULL DEFAULT 'SENT',
    "pickingListId" TEXT,
    "customerOrderId" TEXT,
    "mitId" TEXT,
    "branchId" TEXT NOT NULL,
    "pickerId" TEXT,
    "pickerName" TEXT NOT NULL,
    "lineCount" INTEGER NOT NULL,
    "sentById" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelRemark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HandheldDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandheldDocumentLine" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "pickingListLineId" TEXT,
    "customerOrderLineId" TEXT,
    "mitLineId" TEXT,
    "partId" TEXT,
    "partNumber" TEXT NOT NULL,
    "partName" TEXT,
    "binLocation" TEXT,
    "caseNumber" TEXT,
    "expectedQuantity" INTEGER NOT NULL,
    "extra" BOOLEAN NOT NULL DEFAULT false,
    "quantity" INTEGER,
    "damagedQuantity" INTEGER NOT NULL DEFAULT 0,
    "shortReason" "HandheldShortReason",
    "scannedPartNumber" TEXT,
    "note" TEXT,

    CONSTRAINT "HandheldDocumentLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HandheldDocument_documentNumber_key" ON "HandheldDocument"("documentNumber");

-- CreateIndex
CREATE INDEX "HandheldDocument_type_status_idx" ON "HandheldDocument"("type", "status");

-- CreateIndex
CREATE INDEX "HandheldDocument_branchId_idx" ON "HandheldDocument"("branchId");

-- CreateIndex
CREATE INDEX "HandheldDocument_pickingListId_idx" ON "HandheldDocument"("pickingListId");

-- CreateIndex
CREATE INDEX "HandheldDocument_customerOrderId_idx" ON "HandheldDocument"("customerOrderId");

-- CreateIndex
CREATE INDEX "HandheldDocument_mitId_idx" ON "HandheldDocument"("mitId");

-- CreateIndex
CREATE INDEX "HandheldDocumentLine_pickingListLineId_idx" ON "HandheldDocumentLine"("pickingListLineId");

-- CreateIndex
CREATE INDEX "HandheldDocumentLine_customerOrderLineId_idx" ON "HandheldDocumentLine"("customerOrderLineId");

-- CreateIndex
CREATE INDEX "HandheldDocumentLine_mitLineId_idx" ON "HandheldDocumentLine"("mitLineId");

-- CreateIndex
CREATE UNIQUE INDEX "HandheldDocumentLine_documentId_lineNumber_key" ON "HandheldDocumentLine"("documentId", "lineNumber");

-- AddForeignKey
ALTER TABLE "HandheldDocument" ADD CONSTRAINT "HandheldDocument_pickingListId_fkey" FOREIGN KEY ("pickingListId") REFERENCES "PickingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandheldDocument" ADD CONSTRAINT "HandheldDocument_customerOrderId_fkey" FOREIGN KEY ("customerOrderId") REFERENCES "CustomerOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandheldDocument" ADD CONSTRAINT "HandheldDocument_mitId_fkey" FOREIGN KEY ("mitId") REFERENCES "MaterialInTransit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandheldDocument" ADD CONSTRAINT "HandheldDocument_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandheldDocument" ADD CONSTRAINT "HandheldDocument_pickerId_fkey" FOREIGN KEY ("pickerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandheldDocument" ADD CONSTRAINT "HandheldDocument_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandheldDocument" ADD CONSTRAINT "HandheldDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandheldDocument" ADD CONSTRAINT "HandheldDocument_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandheldDocumentLine" ADD CONSTRAINT "HandheldDocumentLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "HandheldDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandheldDocumentLine" ADD CONSTRAINT "HandheldDocumentLine_pickingListLineId_fkey" FOREIGN KEY ("pickingListLineId") REFERENCES "PickingListLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandheldDocumentLine" ADD CONSTRAINT "HandheldDocumentLine_customerOrderLineId_fkey" FOREIGN KEY ("customerOrderLineId") REFERENCES "CustomerOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandheldDocumentLine" ADD CONSTRAINT "HandheldDocumentLine_mitLineId_fkey" FOREIGN KEY ("mitLineId") REFERENCES "MaterialInTransitLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandheldDocumentLine" ADD CONSTRAINT "HandheldDocumentLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- At most one document on a device per source at a time (legacy "already under process").
CREATE UNIQUE INDEX "HandheldDocument_sent_pickingList_key" ON "HandheldDocument"("pickingListId") WHERE "status" = 'SENT';
CREATE UNIQUE INDEX "HandheldDocument_sent_customerOrder_key" ON "HandheldDocument"("customerOrderId") WHERE "status" = 'SENT';
CREATE UNIQUE INDEX "HandheldDocument_sent_mit_key" ON "HandheldDocument"("mitId") WHERE "status" = 'SENT';

-- Exactly one source, matching the type.
ALTER TABLE "HandheldDocument" ADD CONSTRAINT "HandheldDocument_source_check" CHECK (
  ("type" = 'INDENT_PICK' AND "pickingListId" IS NOT NULL AND "customerOrderId" IS NULL AND "mitId" IS NULL) OR
  ("type" = 'CPO_PICK' AND "customerOrderId" IS NOT NULL AND "pickingListId" IS NULL AND "mitId" IS NULL) OR
  ("type" = 'MIT_RECEIVE' AND "mitId" IS NOT NULL AND "pickingListId" IS NULL AND "customerOrderId" IS NULL)
);

ALTER TABLE "HandheldDocumentLine" ADD CONSTRAINT "HandheldDocumentLine_quantities_check" CHECK (
  "expectedQuantity" >= 0 AND ("quantity" IS NULL OR "quantity" >= 0) AND "damagedQuantity" >= 0
);

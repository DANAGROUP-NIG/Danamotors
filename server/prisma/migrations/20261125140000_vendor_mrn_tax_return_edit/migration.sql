-- Part purchase review 2026-11-25 (dana_projects/part_purchase_screens_review_2026-11-25_recheck.md):
-- vendor MRN tax form, VAT under form Z and round-off; MRN edit log; MRN return (vendor return).

-- Legacy control1.roundmrn: on at CPD (DH) and Abuja (UG), off at Kia Plaza.
ALTER TABLE "Branch" ADD COLUMN "roundMrnTotal" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Branch" SET "roundMrnTotal" = true WHERE "code" IN ('DH', 'UG');

ALTER TABLE "MaterialReceiptNote"
  ADD COLUMN "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "roundOff" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "duplicateReason" TEXT,
  ADD COLUMN "editedAt" TIMESTAMP(3);

ALTER TABLE "MaterialReceiptLine"
  ADD COLUMN "vatPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "returnedQuantity" INTEGER NOT NULL DEFAULT 0;

-- Existing MRNs carried no VAT or round-off: the amount payable is the goods value.
-- The books-closed trigger is off for this one-off backfill of a new column.
ALTER TABLE "MaterialReceiptNote" DISABLE TRIGGER "MaterialReceiptNote_books_closed";
UPDATE "MaterialReceiptNote" SET "netAmount" = "totalValue";
ALTER TABLE "MaterialReceiptNote" ENABLE TRIGGER "MaterialReceiptNote_books_closed";

-- CreateTable
CREATE TABLE "MaterialReceiptNoteEdit" (
    "id" TEXT NOT NULL,
    "mrnId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "partNumber" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT NOT NULL,
    "editedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialReceiptNoteEdit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorReturn" (
    "id" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "mrnId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "returnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taxForm" TEXT,
    "fullReturn" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "totalQuantity" INTEGER NOT NULL DEFAULT 0,
    "totalValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "roundOff" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorReturnLine" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "mrnLineId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "vatPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "VendorReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialReceiptNoteEdit_mrnId_idx" ON "MaterialReceiptNoteEdit"("mrnId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorReturn_returnNumber_key" ON "VendorReturn"("returnNumber");

-- CreateIndex
CREATE INDEX "VendorReturn_mrnId_idx" ON "VendorReturn"("mrnId");

-- CreateIndex
CREATE INDEX "VendorReturn_branchId_idx" ON "VendorReturn"("branchId");

-- CreateIndex
CREATE INDEX "VendorReturn_vendorId_idx" ON "VendorReturn"("vendorId");

-- CreateIndex
CREATE INDEX "VendorReturnLine_returnId_idx" ON "VendorReturnLine"("returnId");

-- CreateIndex
CREATE INDEX "VendorReturnLine_mrnLineId_idx" ON "VendorReturnLine"("mrnLineId");

-- AddForeignKey
ALTER TABLE "MaterialReceiptNoteEdit" ADD CONSTRAINT "MaterialReceiptNoteEdit_mrnId_fkey" FOREIGN KEY ("mrnId") REFERENCES "MaterialReceiptNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialReceiptNoteEdit" ADD CONSTRAINT "MaterialReceiptNoteEdit_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorReturn" ADD CONSTRAINT "VendorReturn_mrnId_fkey" FOREIGN KEY ("mrnId") REFERENCES "MaterialReceiptNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorReturn" ADD CONSTRAINT "VendorReturn_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorReturn" ADD CONSTRAINT "VendorReturn_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorReturn" ADD CONSTRAINT "VendorReturn_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorReturnLine" ADD CONSTRAINT "VendorReturnLine_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "VendorReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorReturnLine" ADD CONSTRAINT "VendorReturnLine_mrnLineId_fkey" FOREIGN KEY ("mrnLineId") REFERENCES "MaterialReceiptLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorReturnLine" ADD CONSTRAINT "VendorReturnLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Closed books also lock the new MRN amounts, and vendor returns like other stock documents (doc/books-closed.md).
DROP TRIGGER IF EXISTS "MaterialReceiptNote_books_closed" ON "MaterialReceiptNote";
CREATE TRIGGER "MaterialReceiptNote_books_closed" BEFORE INSERT OR UPDATE OR DELETE ON "MaterialReceiptNote" FOR EACH ROW
    EXECUTE FUNCTION books_closed_guard('MRN', 'r."receiptDate"', 'r."receivingBranchId"',
        'receiptDate,receivingBranchId,totalReceived,totalDamaged,totalShort,totalValue,taxAmount,roundOff,netAmount');

DROP TRIGGER IF EXISTS "VendorReturn_books_closed" ON "VendorReturn";
CREATE TRIGGER "VendorReturn_books_closed" BEFORE INSERT OR UPDATE OR DELETE ON "VendorReturn" FOR EACH ROW
    EXECUTE FUNCTION books_closed_guard('MRN return', 'r."returnDate"', 'r."branchId"',
        'returnDate,branchId,vendorId,totalQuantity,totalValue,taxAmount,roundOff,netAmount');

-- STN tax form VAT (legacy forms L and Z), cancellation before receipt, and the STN edit log (legacy CSSTNEditLog).

ALTER TYPE "TransferCaseStatus" ADD VALUE 'CANCELLED';
ALTER TYPE "PackingListStatus" ADD VALUE 'CANCELLED';

ALTER TABLE "StockTransferNote"
  ADD COLUMN "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledById" TEXT,
  ADD COLUMN "cancellationReason" TEXT;

ALTER TABLE "StockTransferNote"
  ADD CONSTRAINT "StockTransferNote_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockTransferNoteLine"
  ADD COLUMN "vatPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE "StockTransferNoteEdit" (
    "id" TEXT NOT NULL,
    "stnId" TEXT NOT NULL,
    "partId" TEXT,
    "partNumber" TEXT,
    "oldQuantity" INTEGER,
    "newQuantity" INTEGER,
    "oldTaxForm" TEXT,
    "newTaxForm" TEXT,
    "reason" TEXT NOT NULL,
    "editedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockTransferNoteEdit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StockTransferNoteEdit_stnId_idx" ON "StockTransferNoteEdit"("stnId");

ALTER TABLE "StockTransferNoteEdit" ADD CONSTRAINT "StockTransferNoteEdit_stnId_fkey" FOREIGN KEY ("stnId") REFERENCES "StockTransferNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockTransferNoteEdit" ADD CONSTRAINT "StockTransferNoteEdit_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

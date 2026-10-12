-- Physical stock taking (legacy PSTBatchHead/Detail, PhysicalStockHead/Detail, PSTDownloadHEAD, PhyStkUploadLog).
-- CreateEnum
CREATE TYPE "StockTakeType" AS ENUM ('ANNUAL', 'PERPETUAL');

-- CreateEnum
CREATE TYPE "StockTakeStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "StockTake" (
    "id" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "type" "StockTakeType" NOT NULL,
    "status" "StockTakeStatus" NOT NULL DEFAULT 'ACTIVE',
    "remarks" TEXT,
    "createdById" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "binsUpdatedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelRemark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockTake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTakeLine" (
    "id" TEXT NOT NULL,
    "stockTakeId" TEXT NOT NULL,
    "partId" TEXT,
    "partNumber" TEXT NOT NULL,
    "binLocation" TEXT,
    "systemStock" INTEGER NOT NULL,
    "addedDuringCount" BOOLEAN NOT NULL DEFAULT false,
    "sheetId" TEXT,
    "countedQuantity" INTEGER,
    "damagedQuantity" INTEGER NOT NULL DEFAULT 0,
    "countedBins" TEXT,
    "remarks" TEXT,
    "countedAt" TIMESTAMP(3),
    "stockAtCount" INTEGER,
    "notRequired" BOOLEAN NOT NULL DEFAULT false,
    "dealerRate" DOUBLE PRECISION,
    "adjustedQuantity" INTEGER,

    CONSTRAINT "StockTakeLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTakeSheet" (
    "id" TEXT NOT NULL,
    "sheetNumber" TEXT NOT NULL,
    "stockTakeId" TEXT NOT NULL,
    "checkerId" TEXT,
    "criteria" TEXT,
    "showSystemStock" BOOLEAN NOT NULL DEFAULT false,
    "lineCount" INTEGER NOT NULL,
    "countedCount" INTEGER,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedAt" TIMESTAMP(3),
    "uploadedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelRemark" TEXT,

    CONSTRAINT "StockTakeSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTakeCount" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "sheetId" TEXT,
    "binLocation" TEXT,
    "quantity" INTEGER NOT NULL,
    "damagedQuantity" INTEGER NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "correction" BOOLEAN NOT NULL DEFAULT false,
    "countedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,

    CONSTRAINT "StockTakeCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockTake_batchNumber_key" ON "StockTake"("batchNumber");

-- CreateIndex
CREATE INDEX "StockTake_branchId_status_idx" ON "StockTake"("branchId", "status");

-- CreateIndex
CREATE INDEX "StockTakeLine_partId_idx" ON "StockTakeLine"("partId");

-- CreateIndex
CREATE INDEX "StockTakeLine_sheetId_idx" ON "StockTakeLine"("sheetId");

-- CreateIndex
CREATE UNIQUE INDEX "StockTakeLine_stockTakeId_partId_key" ON "StockTakeLine"("stockTakeId", "partId");

-- CreateIndex
CREATE UNIQUE INDEX "StockTakeSheet_sheetNumber_key" ON "StockTakeSheet"("sheetNumber");

-- CreateIndex
CREATE INDEX "StockTakeSheet_stockTakeId_idx" ON "StockTakeSheet"("stockTakeId");

-- CreateIndex
CREATE INDEX "StockTakeCount_lineId_idx" ON "StockTakeCount"("lineId");

-- AddForeignKey
ALTER TABLE "StockTake" ADD CONSTRAINT "StockTake_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTake" ADD CONSTRAINT "StockTake_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTake" ADD CONSTRAINT "StockTake_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTake" ADD CONSTRAINT "StockTake_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTake" ADD CONSTRAINT "StockTake_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTakeLine" ADD CONSTRAINT "StockTakeLine_stockTakeId_fkey" FOREIGN KEY ("stockTakeId") REFERENCES "StockTake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTakeLine" ADD CONSTRAINT "StockTakeLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTakeLine" ADD CONSTRAINT "StockTakeLine_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "StockTakeSheet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTakeSheet" ADD CONSTRAINT "StockTakeSheet_stockTakeId_fkey" FOREIGN KEY ("stockTakeId") REFERENCES "StockTake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTakeSheet" ADD CONSTRAINT "StockTakeSheet_checkerId_fkey" FOREIGN KEY ("checkerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTakeSheet" ADD CONSTRAINT "StockTakeSheet_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTakeSheet" ADD CONSTRAINT "StockTakeSheet_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTakeCount" ADD CONSTRAINT "StockTakeCount_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "StockTakeLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTakeCount" ADD CONSTRAINT "StockTakeCount_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "StockTakeSheet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTakeCount" ADD CONSTRAINT "StockTakeCount_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Counted totals are never negative; corrections are stored as changes on StockTakeCount.
ALTER TABLE "StockTakeLine" ADD CONSTRAINT "StockTakeLine_quantities_check"
  CHECK (("countedQuantity" IS NULL OR "countedQuantity" >= 0) AND "damagedQuantity" >= 0);

-- Legacy: "Part No. X is under Stock taking process vide Batch No. Y. Transaction cannot be done till
-- completion of the process." While an annual count is ACTIVE, stock of its parts cannot move at the
-- branch, whichever module moves it. The error handler turns STOCK_TAKE_FREEZE into a 409.
CREATE OR REPLACE FUNCTION stock_take_freeze() RETURNS trigger AS $$
DECLARE
  batch TEXT;
  part TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."quantity" IS NOT DISTINCT FROM OLD."quantity" THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW."quantity" = 0 THEN
    RETURN NEW;
  END IF;
  SELECT t."batchNumber", l."partNumber" INTO batch, part
    FROM "StockTakeLine" l
    JOIN "StockTake" t ON t."id" = l."stockTakeId"
   WHERE l."partId" = NEW."partId"
     AND t."branchId" = NEW."branchId"
     AND t."type" = 'ANNUAL'
     AND t."status" = 'ACTIVE'
   LIMIT 1;
  IF batch IS NOT NULL THEN
    RAISE EXCEPTION 'STOCK_TAKE_FREEZE: Part % is under annual stock taking (batch %). Its stock cannot move at this branch until the count is completed.', part, batch;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "InventoryStock_stock_take_freeze" ON "InventoryStock";
CREATE TRIGGER "InventoryStock_stock_take_freeze"
  BEFORE INSERT OR UPDATE OF "quantity" ON "InventoryStock"
  FOR EACH ROW EXECUTE FUNCTION stock_take_freeze();

-- Stock taking permissions.
INSERT INTO "Permission"(id,name,description) VALUES
 (md5('stocktake:read')::uuid::text,'stocktake:read','View physical stock taking batches, counts and discrepancies'),
 (md5('stocktake:manage')::uuid::text,'stocktake:manage','Create stock taking batches, issue count sheets, record counts and complete a count'),
 (md5('stocktake:confirm')::uuid::text,'stocktake:confirm','Confirm shortage and excess of a count, which adjusts stock')
ON CONFLICT(name) DO NOTHING;
INSERT INTO "RolePermission"("roleId","permissionId")
SELECT r.id,p.id FROM "Role" r CROSS JOIN "Permission" p
WHERE (r.name IN ('SuperAdmin','Admin','GeneralStoreManager') AND p.name IN ('stocktake:read','stocktake:manage','stocktake:confirm'))
   OR (r.name = 'BranchStoreManager' AND p.name IN ('stocktake:read','stocktake:manage'))
   OR (r.name = 'Accountant' AND p.name = 'stocktake:read')
ON CONFLICT DO NOTHING;

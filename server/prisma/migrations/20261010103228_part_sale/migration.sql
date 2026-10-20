-- CreateEnum
CREATE TYPE "CustomerOrderStatus" AS ENUM ('OPEN', 'PARTLY_BILLED', 'BILLED', 'CANCELLED');

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "customerOrderLineId" TEXT,
ADD COLUMN     "returnedQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vatPercent" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "CustomerOrder" (
    "id" TEXT NOT NULL,
    "cpoNumber" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerRefNo" TEXT,
    "customerRefDate" TIMESTAMP(3),
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTill" TIMESTAMP(3),
    "status" "CustomerOrderStatus" NOT NULL DEFAULT 'OPEN',
    "remarks" TEXT,
    "totalQuantity" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelRemark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "CustomerOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "orderedQuantity" INTEGER NOT NULL,
    "pickedQuantity" INTEGER NOT NULL DEFAULT 0,
    "billedQuantity" INTEGER NOT NULL DEFAULT 0,
    "cancelledQuantity" INTEGER NOT NULL DEFAULT 0,
    "retailRate" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "CustomerOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CounterSale" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "salesExecutiveId" TEXT,
    "transportMode" "TransportMode",
    "transporter" TEXT,
    "grNumber" TEXT,
    "grDate" TIMESTAMP(3),
    "numberOfCases" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "CounterSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CounterSaleReturn" (
    "id" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "counterSaleId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "returnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "grossAmount" DOUBLE PRECISION NOT NULL,
    "discountAmount" DOUBLE PRECISION NOT NULL,
    "vatAmount" DOUBLE PRECISION NOT NULL,
    "roundOff" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "creditNoteId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "CounterSaleReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CounterSaleReturnLine" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "invoiceLineId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

CONSTRAINT "CounterSaleReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerOrder_cpoNumber_key" ON "CustomerOrder"("cpoNumber");

-- CreateIndex
CREATE INDEX "CustomerOrder_branchId_status_idx" ON "CustomerOrder"("branchId", "status");

-- CreateIndex
CREATE INDEX "CustomerOrder_customerId_idx" ON "CustomerOrder"("customerId");

-- CreateIndex
CREATE INDEX "CustomerOrderLine_partId_idx" ON "CustomerOrderLine"("partId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerOrderLine_orderId_partId_key" ON "CustomerOrderLine"("orderId", "partId");

-- CreateIndex
CREATE UNIQUE INDEX "CounterSale_invoiceId_key" ON "CounterSale"("invoiceId");

-- CreateIndex
CREATE INDEX "CounterSale_branchId_idx" ON "CounterSale"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "CounterSaleReturn_returnNumber_key" ON "CounterSaleReturn"("returnNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CounterSaleReturn_creditNoteId_key" ON "CounterSaleReturn"("creditNoteId");

-- CreateIndex
CREATE INDEX "CounterSaleReturn_counterSaleId_idx" ON "CounterSaleReturn"("counterSaleId");

-- CreateIndex
CREATE INDEX "CounterSaleReturn_customerId_idx" ON "CounterSaleReturn"("customerId");

-- CreateIndex
CREATE INDEX "CounterSaleReturnLine_returnId_idx" ON "CounterSaleReturnLine"("returnId");

-- CreateIndex
CREATE INDEX "CounterSaleReturnLine_invoiceLineId_idx" ON "CounterSaleReturnLine"("invoiceLineId");

-- CreateIndex
CREATE INDEX "InvoiceLine_customerOrderLineId_idx" ON "InvoiceLine"("customerOrderLineId");

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_customerOrderLineId_fkey" FOREIGN KEY ("customerOrderLineId") REFERENCES "CustomerOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrderLine" ADD CONSTRAINT "CustomerOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CustomerOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrderLine" ADD CONSTRAINT "CustomerOrderLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterSale" ADD CONSTRAINT "CounterSale_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterSale" ADD CONSTRAINT "CounterSale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterSale" ADD CONSTRAINT "CounterSale_salesExecutiveId_fkey" FOREIGN KEY ("salesExecutiveId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterSaleReturn" ADD CONSTRAINT "CounterSaleReturn_counterSaleId_fkey" FOREIGN KEY ("counterSaleId") REFERENCES "CounterSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterSaleReturn" ADD CONSTRAINT "CounterSaleReturn_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterSaleReturn" ADD CONSTRAINT "CounterSaleReturn_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterSaleReturn" ADD CONSTRAINT "CounterSaleReturn_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "PartyNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterSaleReturn" ADD CONSTRAINT "CounterSaleReturn_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterSaleReturnLine" ADD CONSTRAINT "CounterSaleReturnLine_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "CounterSaleReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterSaleReturnLine" ADD CONSTRAINT "CounterSaleReturnLine_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "InvoiceLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterSaleReturnLine" ADD CONSTRAINT "CounterSaleReturnLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A CPO line can never pick, bill or cancel more than was ordered.
ALTER TABLE "CustomerOrderLine" ADD CONSTRAINT "CustomerOrderLine_quantities_check"
  CHECK ("orderedQuantity" > 0 AND "pickedQuantity" >= 0 AND "billedQuantity" >= 0 AND "cancelledQuantity" >= 0
     AND "pickedQuantity" + "billedQuantity" + "cancelledQuantity" <= "orderedQuantity");

-- A bill line can never be returned beyond the quantity billed.
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_returnedQuantity_check"
  CHECK ("returnedQuantity" >= 0 AND "returnedQuantity" <= "quantity");

ALTER TABLE "CounterSaleReturnLine" ADD CONSTRAINT "CounterSaleReturnLine_quantity_check" CHECK ("quantity" > 0);

-- Part sale permissions (CPD customer purchase orders, counter sales and returns).
INSERT INTO "Permission"(id,name,description) VALUES
 (md5('partsale:read')::uuid::text,'partsale:read','View customer purchase orders, counter sales and sale returns'),
 (md5('partsale:order')::uuid::text,'partsale:order','Create, pick and cancel customer purchase orders'),
 (md5('partsale:bill')::uuid::text,'partsale:bill','Create and cancel counter-sale bills'),
 (md5('partsale:return')::uuid::text,'partsale:return','Record counter-sale returns')
ON CONFLICT(name) DO NOTHING;
INSERT INTO "RolePermission"("roleId","permissionId")
SELECT r.id,p.id FROM "Role" r CROSS JOIN "Permission" p
WHERE (r.name IN ('SuperAdmin','Admin','GeneralStoreManager','BranchStoreManager') AND p.name IN ('partsale:read','partsale:order','partsale:bill','partsale:return'))
   OR (r.name IN ('Accountant','BillingOfficer') AND p.name IN ('partsale:read','partsale:bill','partsale:return'))
ON CONFLICT DO NOTHING;

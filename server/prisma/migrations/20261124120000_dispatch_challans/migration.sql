-- Dispatch challans (legacy Dispatch Challan / Dispatch Challan Return): unbilled issues of fuel and
-- consumables to internal cost centres, still in daily use at Kia Plaza (stores A and QS).

-- CreateTable
CREATE TABLE "DispatchChallan" (
    "id" TEXT NOT NULL,
    "challanNumber" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "challanDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gatePassNumber" TEXT NOT NULL,
    "remarks" TEXT,
    "totalQuantity" INTEGER NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispatchChallan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchChallanLine" (
    "id" TEXT NOT NULL,
    "challanId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "returnedQuantity" INTEGER NOT NULL DEFAULT 0,
    "rate" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "DispatchChallanLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchChallanReturn" (
    "id" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "challanId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "returnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fullReturn" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "totalQuantity" INTEGER NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispatchChallanReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchChallanReturnLine" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "challanLineId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "DispatchChallanReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DispatchChallan_challanNumber_key" ON "DispatchChallan"("challanNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchChallan_gatePassNumber_key" ON "DispatchChallan"("gatePassNumber");

-- CreateIndex
CREATE INDEX "DispatchChallan_branchId_challanDate_idx" ON "DispatchChallan"("branchId", "challanDate");

-- CreateIndex
CREATE INDEX "DispatchChallan_customerId_idx" ON "DispatchChallan"("customerId");

-- CreateIndex
CREATE INDEX "DispatchChallanLine_challanId_idx" ON "DispatchChallanLine"("challanId");

-- CreateIndex
CREATE INDEX "DispatchChallanLine_partId_idx" ON "DispatchChallanLine"("partId");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchChallanReturn_returnNumber_key" ON "DispatchChallanReturn"("returnNumber");

-- CreateIndex
CREATE INDEX "DispatchChallanReturn_challanId_idx" ON "DispatchChallanReturn"("challanId");

-- CreateIndex
CREATE INDEX "DispatchChallanReturn_branchId_returnDate_idx" ON "DispatchChallanReturn"("branchId", "returnDate");

-- CreateIndex
CREATE INDEX "DispatchChallanReturnLine_returnId_idx" ON "DispatchChallanReturnLine"("returnId");

-- CreateIndex
CREATE INDEX "DispatchChallanReturnLine_challanLineId_idx" ON "DispatchChallanReturnLine"("challanLineId");

-- AddForeignKey
ALTER TABLE "DispatchChallan" ADD CONSTRAINT "DispatchChallan_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchChallan" ADD CONSTRAINT "DispatchChallan_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchChallan" ADD CONSTRAINT "DispatchChallan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchChallanLine" ADD CONSTRAINT "DispatchChallanLine_challanId_fkey" FOREIGN KEY ("challanId") REFERENCES "DispatchChallan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchChallanLine" ADD CONSTRAINT "DispatchChallanLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchChallanReturn" ADD CONSTRAINT "DispatchChallanReturn_challanId_fkey" FOREIGN KEY ("challanId") REFERENCES "DispatchChallan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchChallanReturn" ADD CONSTRAINT "DispatchChallanReturn_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchChallanReturn" ADD CONSTRAINT "DispatchChallanReturn_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchChallanReturnLine" ADD CONSTRAINT "DispatchChallanReturnLine_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "DispatchChallanReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchChallanReturnLine" ADD CONSTRAINT "DispatchChallanReturnLine_challanLineId_fkey" FOREIGN KEY ("challanLineId") REFERENCES "DispatchChallanLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchChallanReturnLine" ADD CONSTRAINT "DispatchChallanReturnLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Quantities: nothing issued or returned at zero, and a line never returns more than it issued.
ALTER TABLE "DispatchChallanLine" ADD CONSTRAINT "DispatchChallanLine_quantities_check"
  CHECK ("quantity" > 0 AND "returnedQuantity" >= 0 AND "returnedQuantity" <= "quantity");
ALTER TABLE "DispatchChallanReturnLine" ADD CONSTRAINT "DispatchChallanReturnLine_quantity_check" CHECK ("quantity" > 0);

-- Permissions, granted as ROLE_PERMISSIONS (src/shared/constants/roles.ts) gives them.
INSERT INTO "Permission" ("id", "name", "description", "createdAt")
VALUES
  (gen_random_uuid()::text, 'challan:read', 'View dispatch challans and challan returns', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'challan:issue', 'Issue dispatch challans (unbilled issues to cost centres)', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'challan:return', 'Record dispatch challan returns', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "Role" r
JOIN "Permission" p ON (
     (p.name IN ('challan:read', 'challan:issue', 'challan:return') AND r.name IN ('SuperAdmin', 'Admin', 'GeneralStoreManager', 'StoreOfficer'))
  OR (p.name = 'challan:read' AND r.name IN ('Accountant', 'Auditor'))
)
ON CONFLICT DO NOTHING;

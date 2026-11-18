-- Barcode labels printed on a handheld station's USB label printer (Zebra, ZPL).

CREATE TYPE "LabelPrintStatus" AS ENUM ('QUEUED', 'PRINTED', 'FAILED', 'CANCELLED');

ALTER TABLE "HandheldStation" ADD COLUMN "printerModel" TEXT,
ADD COLUMN "printerStatus" TEXT,
ADD COLUMN "printerDetail" TEXT;

CREATE TABLE "LabelPrintJob" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "labels" JSONB NOT NULL,
    "labelCount" INTEGER NOT NULL,
    "zpl" TEXT NOT NULL,
    "status" "LabelPrintStatus" NOT NULL DEFAULT 'QUEUED',
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimStationId" TEXT,
    "claimExpiresAt" TIMESTAMP(3),
    "printedAt" TIMESTAMP(3),
    "printedStationId" TEXT,
    "error" TEXT,

    CONSTRAINT "LabelPrintJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LabelPrintJob_branchId_status_idx" ON "LabelPrintJob"("branchId", "status");
CREATE INDEX "LabelPrintJob_branchId_createdAt_idx" ON "LabelPrintJob"("branchId", "createdAt");

ALTER TABLE "LabelPrintJob" ADD CONSTRAINT "LabelPrintJob_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LabelPrintJob" ADD CONSTRAINT "LabelPrintJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LabelPrintJob" ADD CONSTRAINT "LabelPrintJob_printedStationId_fkey" FOREIGN KEY ("printedStationId") REFERENCES "HandheldStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Store staff print labels: every role that can update stock gets it; others from the Roles page.
INSERT INTO "Permission"(id,name,description) VALUES
 (md5('labels:print')::uuid::text,'labels:print','Print barcode labels for parts on the branch label printer')
ON CONFLICT(name) DO NOTHING;
INSERT INTO "RolePermission"("roleId","permissionId")
SELECT DISTINCT rp."roleId", p.id FROM "RolePermission" rp
JOIN "Permission" s ON s.id = rp."permissionId" AND s.name = 'stock:update'
CROSS JOIN "Permission" p
WHERE p.name = 'labels:print'
ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission"("roleId","permissionId")
SELECT r.id,p.id FROM "Role" r CROSS JOIN "Permission" p
WHERE r.name IN ('SuperAdmin','Admin') AND p.name = 'labels:print'
ON CONFLICT DO NOTHING;

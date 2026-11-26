CREATE TABLE "ServiceJobWorkflow" (
    "jobCardId" TEXT PRIMARY KEY REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "stage" TEXT NOT NULL DEFAULT 'OPENED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "faultVerification" TEXT NOT NULL,
    "faultVerifiedById" TEXT NOT NULL,
    "faultVerifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inspectionRemarks" TEXT,
    "inspectionSubmittedById" TEXT,
    "inspectionSubmittedAt" TIMESTAMP(3),
    "noPartsRequired" BOOLEAN NOT NULL DEFAULT false,
    "warrantyResolvedById" TEXT,
    "warrantyResolvedAt" TIMESTAMP(3),
    "warrantySource" TEXT
);

CREATE TABLE "ServiceJobWorkflowPart" (
    "jobCardId" TEXT NOT NULL REFERENCES "ServiceJobWorkflow"("jobCardId") ON DELETE CASCADE ON UPDATE CASCADE,
    "sparePartId" TEXT NOT NULL REFERENCES "SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "partNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL CHECK ("quantity" > 0),
    "isUnderWarranty" BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY ("jobCardId", "sparePartId")
);

CREATE INDEX "ServiceJobWorkflowPart_sparePartId_idx" ON "ServiceJobWorkflowPart"("sparePartId");

ALTER TABLE "EstimateLine"
    ADD COLUMN "isUnderWarranty" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "catalogueRate" DOUBLE PRECISION;
ALTER TABLE "InvoiceLine" ADD COLUMN "isUnderWarranty" BOOLEAN NOT NULL DEFAULT false;

INSERT INTO "Role" ("id", "name", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'QCOfficer', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r CROSS JOIN "Permission" p
WHERE r."name" = 'ServiceAdviser' AND p."name" = 'assignment:create'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT qc."id", grants."permissionId"
FROM "Role" qc
CROSS JOIN (
    SELECT rp."permissionId"
    FROM "RolePermission" rp JOIN "Role" adviser ON adviser."id" = rp."roleId"
    WHERE adviser."name" = 'ServiceAdviser'
    UNION
    SELECT "id" FROM "Permission" WHERE "name" = 'qcstatus:update'
) grants
WHERE qc."name" = 'QCOfficer'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

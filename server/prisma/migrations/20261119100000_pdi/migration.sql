-- ============================================================
-- PDI (pre-delivery inspection) as a job card type: the job type and PDI registration on
-- the job card, print marks for edit-after-print rules, picking list and mileage on
-- requisitions, credit company and card on bills, company-wide PDI settings, and the
-- pdi:* permissions with their default grants.
-- Additive and idempotent: safe on databases that already have any part of it.
-- Existing job cards keep jobType SERVICE; old PDIs opened as service jobs stay out of the
-- service history through their pre-delivery service type.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE "JobCardType" AS ENUM ('SERVICE', 'PDI');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "JobCard" ADD COLUMN IF NOT EXISTS "jobType" "JobCardType" NOT NULL DEFAULT 'SERVICE';
ALTER TABLE "JobCard" ADD COLUMN IF NOT EXISTS "pdiRegistration" TEXT;
ALTER TABLE "JobCard" ADD COLUMN IF NOT EXISTS "printedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "JobCard_jobType_branchId_createdAt_idx" ON "JobCard"("jobType", "branchId", "createdAt");
CREATE INDEX IF NOT EXISTS "JobCard_vehicleId_jobType_idx" ON "JobCard"("vehicleId", "jobType");

ALTER TABLE "PartRequisition" ADD COLUMN IF NOT EXISTS "pickingListNumber" TEXT;
ALTER TABLE "PartRequisition" ADD COLUMN IF NOT EXISTS "mileage" INTEGER;
ALTER TABLE "PartRequisition" ADD COLUMN IF NOT EXISTS "printedAt" TIMESTAMP(3);
ALTER TABLE "PartReturnSlip" ADD COLUMN IF NOT EXISTS "printedAt" TIMESTAMP(3);
ALTER TABLE "LabourSlip" ADD COLUMN IF NOT EXISTS "mileage" INTEGER;
ALTER TABLE "LabourSlip" ADD COLUMN IF NOT EXISTS "printedAt" TIMESTAMP(3);

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "creditCompany" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "cardNumber" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "printedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "PdiSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "jobFreezeDate" DATE,
    "requisitionFreezeDate" DATE,
    "returnFreezeDate" DATE,
    "labourFreezeDate" DATE,
    "billFreezeDate" DATE,
    "jobEditBeforePrint" BOOLEAN NOT NULL DEFAULT true,
    "jobEditAfterPrint" BOOLEAN NOT NULL DEFAULT false,
    "requisitionEditBeforePrint" BOOLEAN NOT NULL DEFAULT true,
    "requisitionEditAfterPrint" BOOLEAN NOT NULL DEFAULT false,
    "returnEditBeforePrint" BOOLEAN NOT NULL DEFAULT true,
    "returnEditAfterPrint" BOOLEAN NOT NULL DEFAULT false,
    "labourEditBeforePrint" BOOLEAN NOT NULL DEFAULT true,
    "labourEditAfterPrint" BOOLEAN NOT NULL DEFAULT false,
    "billEditBeforePrint" BOOLEAN NOT NULL DEFAULT true,
    "billEditAfterPrint" BOOLEAN NOT NULL DEFAULT false,
    "roundBill" BOOLEAN NOT NULL DEFAULT true,
    "defaultCustomerId" TEXT,
    "includeInHistory" BOOLEAN NOT NULL DEFAULT false,
    "postBillsToTally" BOOLEAN NOT NULL DEFAULT true,
    "invoiceTitle" TEXT NOT NULL DEFAULT 'PDI INVOICE',
    "cashMemoTitle" TEXT NOT NULL DEFAULT 'PDI CASH MEMO',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PdiSettings_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PdiSettings_defaultCustomerId_idx" ON "PdiSettings"("defaultCustomerId");
DO $$ BEGIN
  ALTER TABLE "PdiSettings" ADD CONSTRAINT "PdiSettings_defaultCustomerId_fkey" FOREIGN KEY ("defaultCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO "PdiSettings" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Permissions. pdi:read already exists on some databases (vehicle history card).
INSERT INTO "Permission" ("id", "name", "description", "createdAt")
VALUES
  (gen_random_uuid()::text, 'pdi:read', 'View PDI job cards, requisitions, returns, labour slips and bills', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'pdi:create', 'Open PDI job cards', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'pdi:update', 'Update PDI job cards and record PDI requisitions, returns and labour', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'pdi:bill', 'Create and cancel PDI bills', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'pdi:settings', 'Change PDI settings', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- Same grants as ROLE_PERMISSIONS in src/shared/constants/roles.ts.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM (VALUES
  ('SuperAdmin', 'pdi:read'), ('SuperAdmin', 'pdi:create'), ('SuperAdmin', 'pdi:update'), ('SuperAdmin', 'pdi:bill'), ('SuperAdmin', 'pdi:settings'),
  ('Admin', 'pdi:read'), ('Admin', 'pdi:create'), ('Admin', 'pdi:update'), ('Admin', 'pdi:bill'), ('Admin', 'pdi:settings'),
  ('ServiceManager', 'pdi:read'), ('ServiceManager', 'pdi:create'), ('ServiceManager', 'pdi:update'),
  ('WorkshopManager', 'pdi:read'), ('WorkshopManager', 'pdi:create'), ('WorkshopManager', 'pdi:update'),
  ('ServiceAdviser', 'pdi:read'), ('ServiceAdviser', 'pdi:create'), ('ServiceAdviser', 'pdi:update'),
  ('Engineer', 'pdi:read'), ('Engineer', 'pdi:update'),
  ('Technician', 'pdi:read'),
  ('BillingOfficer', 'pdi:read'), ('BillingOfficer', 'pdi:bill'),
  ('Auditor', 'pdi:read')
) AS g(role_name, permission_name)
JOIN "Role" r ON r.name = g.role_name
JOIN "Permission" p ON p.name = g.permission_name
ON CONFLICT DO NOTHING;

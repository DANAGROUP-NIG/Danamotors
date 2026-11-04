-- ============================================================
-- FPC bulletins (#98): FPC campaign type, bulletin fields, VIN ranges, the
-- "attended" answer on job card campaigns, letters as contacts, report settings,
-- and the FPC report permissions with their default grants.
-- Additive and idempotent: safe on databases that already have any part of it.
-- Mirrors ROLE_PERMISSIONS in src/shared/constants/roles.ts.
-- ============================================================

-- 1. Enum values
ALTER TYPE "CampaignType" ADD VALUE IF NOT EXISTS 'FPC';
ALTER TYPE "ContactChannel" ADD VALUE IF NOT EXISTS 'LETTER';
ALTER TYPE "ContactOutcome" ADD VALUE IF NOT EXISTS 'SENT';

-- 2. Bulletin fields on Campaign
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "bulletinDate" TIMESTAMP(3);
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "jobCardText" VARCHAR(100);
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "printOnJobCard" BOOLEAN NOT NULL DEFAULT true;

-- 3. Attended answer on JobCardCampaign (null = not answered yet)
ALTER TABLE "JobCardCampaign" ADD COLUMN IF NOT EXISTS "attended" BOOLEAN;
ALTER TABLE "JobCardCampaign" ADD COLUMN IF NOT EXISTS "attendedAt" TIMESTAMP(3);
ALTER TABLE "JobCardCampaign" ADD COLUMN IF NOT EXISTS "attendedById" TEXT;
ALTER TABLE "JobCardCampaign" ADD COLUMN IF NOT EXISTS "notAttendedReason" TEXT;
CREATE INDEX IF NOT EXISTS "JobCardCampaign_campaignId_attended_idx" ON "JobCardCampaign"("campaignId", "attended");
DO $$ BEGIN
  ALTER TABLE "JobCardCampaign" ADD CONSTRAINT "JobCardCampaign_attendedById_fkey"
    FOREIGN KEY ("attendedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. VIN ranges
CREATE TABLE IF NOT EXISTS "CampaignVinRange" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "vinFrom" TEXT NOT NULL,
    "vinTo" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignVinRange_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignVinRange_campaignId_vinFrom_vinTo_key" ON "CampaignVinRange"("campaignId", "vinFrom", "vinTo");
CREATE INDEX IF NOT EXISTS "CampaignVinRange_vinFrom_vinTo_idx" ON "CampaignVinRange"("vinFrom", "vinTo");
DO $$ BEGIN
  ALTER TABLE "CampaignVinRange" ADD CONSTRAINT "CampaignVinRange_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "CampaignVinRange" ADD CONSTRAINT "CampaignVinRange_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Report settings (key/value). PR #81 created the same table; IF NOT EXISTS keeps both safe.
CREATE TABLE IF NOT EXISTS "ReportSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReportSetting_pkey" PRIMARY KEY ("key")
);

-- 6. Permissions
INSERT INTO "Permission" ("id", "name", "description")
SELECT gen_random_uuid(), v.name, v.description
FROM (VALUES
  ('report:fpc-vehicles', 'Run the FPC vehicles report (lists, letters, labels)'),
  ('report:fpc-analysis', 'Run the FPC analysis report'),
  ('report:settings', 'Manage report settings such as the FPC letter template')
) AS v(name, description)
WHERE NOT EXISTS (SELECT 1 FROM "Permission" p WHERE p."name" = v.name);

-- 7. Default grants
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM (VALUES
  ('SuperAdmin', 'report:fpc-vehicles'),
  ('SuperAdmin', 'report:fpc-analysis'),
  ('SuperAdmin', 'report:settings'),
  ('Admin', 'report:fpc-vehicles'),
  ('Admin', 'report:fpc-analysis'),
  ('Admin', 'report:settings'),
  ('WorkshopManager', 'report:fpc-vehicles'),
  ('WorkshopManager', 'report:fpc-analysis'),
  ('WorkshopManager', 'report:settings'),
  ('WarrantyOfficer', 'report:fpc-vehicles'),
  ('WarrantyOfficer', 'report:fpc-analysis'),
  ('WarrantyOfficer', 'report:settings'),
  ('ServiceManager', 'report:fpc-vehicles'),
  ('ServiceManager', 'report:fpc-analysis'),
  ('ServiceAdviser', 'report:fpc-vehicles'),
  ('CCUManager', 'report:fpc-vehicles'),
  ('CCUOfficer', 'report:fpc-vehicles')
) AS g(role, permission)
JOIN "Role" r ON r."name" = g.role
JOIN "Permission" p ON p."name" = g.permission
WHERE NOT EXISTS (SELECT 1 FROM "RolePermission" rp WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id");

-- Job card revamp phase 4: warranty check and the service history rule.

-- Who pays for each diagnosed item, decided by the warranty officer.
CREATE TYPE "FindingPayer" AS ENUM ('WARRANTY', 'GOODWILL', 'CAMPAIGN', 'CUSTOMER');

ALTER TABLE "JobFindingItem"
  ADD COLUMN "payer" "FindingPayer",
  ADD COLUMN "decidedById" TEXT,
  ADD COLUMN "decidedAt" TIMESTAMP(3),
  ADD COLUMN "campaignId" TEXT;
ALTER TABLE "JobFindingItem" ADD CONSTRAINT "JobFindingItem_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobFindingItem" ADD CONSTRAINT "JobFindingItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Why warranty or goodwill was approved although the service history is irregular.
ALTER TABLE "JobCard" ADD COLUMN "warrantyDecisionReason" TEXT;

-- Photos of a stamped service book, for outside service records.
ALTER TYPE "JobPhotoCategory" ADD VALUE 'SERVICE_BOOK';

-- Service types that count as periodic maintenance for the service history rule.
ALTER TABLE "WorkshopMaster" ADD COLUMN "isPeriodicMaintenance" BOOLEAN NOT NULL DEFAULT false;

-- Existing service types: free services and paid periodic services count; inspections (DI),
-- service campaigns (SC) and pre-delivery work do not. TODO(confirm) with the warranty lead.
UPDATE "WorkshopMaster"
SET "isPeriodicMaintenance" = true
WHERE "kind" = 'SERVICE_TYPE'
  AND UPPER(COALESCE("category", '')) IN ('FREE', 'PAID')
  AND UPPER("code") NOT IN ('DI', 'SC')
  AND NOT "preDelivery";

-- Per-model service history rule. Null uses the warranty settings value.
ALTER TABLE "VehicleModel"
  ADD COLUMN "serviceIntervalMonths" INTEGER,
  ADD COLUMN "serviceIntervalKm" INTEGER,
  ADD COLUMN "servicesPerYear" INTEGER,
  ADD COLUMN "serviceGraceKm" INTEGER,
  ADD COLUMN "serviceGraceDays" INTEGER;

-- The service history rule (one row).
CREATE TABLE "WarrantySettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "serviceIntervalMonths" INTEGER NOT NULL DEFAULT 3,
    "serviceIntervalKm" INTEGER NOT NULL DEFAULT 5000,
    "servicesPerYear" INTEGER NOT NULL DEFAULT 4,
    "serviceGraceKm" INTEGER NOT NULL DEFAULT 0,
    "serviceGraceDays" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarrantySettings_pkey" PRIMARY KEY ("id")
);
INSERT INTO "WarrantySettings" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;

-- Services done at another authorised dealer, from the stamped service book.
CREATE TABLE "ExternalServiceRecord" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "jobCardId" TEXT,
    "serviceDate" DATE NOT NULL,
    "mileage" INTEGER NOT NULL,
    "dealerName" TEXT NOT NULL,
    "note" TEXT,
    "photoId" TEXT,
    "addedById" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,
    "removedReason" TEXT,

    CONSTRAINT "ExternalServiceRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ExternalServiceRecord_mileage_check" CHECK ("mileage" >= 0)
);
CREATE UNIQUE INDEX "ExternalServiceRecord_photoId_key" ON "ExternalServiceRecord"("photoId");
CREATE UNIQUE INDEX "ExternalServiceRecord_requestId_key" ON "ExternalServiceRecord"("requestId");
CREATE INDEX "ExternalServiceRecord_vehicleId_serviceDate_idx" ON "ExternalServiceRecord"("vehicleId", "serviceDate");
ALTER TABLE "ExternalServiceRecord" ADD CONSTRAINT "ExternalServiceRecord_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalServiceRecord" ADD CONSTRAINT "ExternalServiceRecord_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExternalServiceRecord" ADD CONSTRAINT "ExternalServiceRecord_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "JobPhoto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExternalServiceRecord" ADD CONSTRAINT "ExternalServiceRecord_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExternalServiceRecord" ADD CONSTRAINT "ExternalServiceRecord_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Permissions: the warranty officer returns the job to the advisor through the stage action,
-- which needs jobcard:update. Mirrors ROLE_PERMISSIONS; seed resets use the same defaults.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "Role" r
JOIN "Permission" p ON p.name = 'jobcard:update'
WHERE r.name = 'WarrantyOfficer'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

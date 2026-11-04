-- ============================================================
-- Service MIS reports (#97): service categories on service types, the service group on
-- labour items (VEHICLE_GROUP master), the body repair group, anniversary as a date,
-- free service due limits, mileage bands, report indexes, and the 15 MIS report
-- permissions with their default grants.
-- Additive and idempotent: safe on databases that already have any part of it.
-- ============================================================

-- 1. Service category on SERVICE_TYPE masters: FREE, PAID, RUNNING_REPAIR, ACCIDENTAL, PDI, OTHER.
-- Fills only blank or unknown values, so a category set on the master screen is kept.
UPDATE "WorkshopMaster" m
SET "category" = CASE
    WHEN m."code" IN ('1F', '2F', '3F', 'DI', 'P2') THEN 'FREE'
    WHEN m."code" IN ('PD', 'BD') OR m."preDelivery" THEN 'PDI'
    WHEN m."code" IN ('RR', 'RU') THEN 'RUNNING_REPAIR'
    WHEN m."code" = 'AC' THEN 'ACCIDENTAL'
    -- Paid: regular, campaign, mobile and prepaid services, and the km-based services (e.g. 10K, 20K).
    WHEN m."code" IN ('RG', 'SC', 'KS', '1P', '2P', '3P', '4P') OR m."code" ~ '^[0-9]+K?$' OR m."description" ~* '[0-9][0-9,]* ?KM' THEN 'PAID'
    WHEN m."freeService" THEN 'FREE'
    ELSE 'OTHER'
  END,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE m."kind" = 'SERVICE_TYPE'
  AND (m."category" IS NULL OR UPPER(m."category") NOT IN ('FREE', 'PAID', 'RUNNING_REPAIR', 'ACCIDENTAL', 'PDI', 'OTHER'));

UPDATE "WorkshopMaster"
SET "category" = UPPER("category")
WHERE "kind" = 'SERVICE_TYPE' AND "category" <> UPPER("category");

-- 2. Service groups. The legacy vehiclegroup list is the VEHICLE_GROUP master. Databases
-- without any get the three groups the workshop uses, under one vehicle system.
INSERT INTO "WorkshopMaster" ("id", "kind", "code", "description", "chargedTo", "updatedAt")
SELECT gen_random_uuid(), 'VEHICLE_SYSTEM', 'GEN', 'GENERAL', 'CUSTOMER', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "WorkshopMaster" WHERE "kind" = 'VEHICLE_GROUP')
  AND NOT EXISTS (SELECT 1 FROM "WorkshopMaster" WHERE "kind" = 'VEHICLE_SYSTEM' AND "code" = 'GEN');

INSERT INTO "WorkshopMaster" ("id", "kind", "code", "description", "chargedTo", "parentId", "attributes", "updatedAt")
SELECT gen_random_uuid(), 'VEHICLE_GROUP', g.code, g.description, 'CUSTOMER', s."id", g.attributes::jsonb, CURRENT_TIMESTAMP
FROM (VALUES
  ('MAINT', 'MAINTENANCE', '{}'),
  ('SERV', 'SERVICES', '{}'),
  ('BODY', 'BODY REPAIR', '{"bodyRepair": true}')
) AS g(code, description, attributes)
JOIN "WorkshopMaster" s ON s."kind" = 'VEHICLE_SYSTEM' AND s."code" = 'GEN'
WHERE NOT EXISTS (SELECT 1 FROM "WorkshopMaster" WHERE "kind" = 'VEHICLE_GROUP');

-- Body figures in the MIS come from labour in the body repair group. Mark an existing
-- body group once; the flag is editable on the master screen afterwards.
UPDATE "WorkshopMaster"
SET "attributes" = COALESCE("attributes", '{}'::jsonb) || '{"bodyRepair": true}'::jsonb, "updatedAt" = CURRENT_TIMESTAMP
WHERE "kind" = 'VEHICLE_GROUP'
  AND "description" ~* 'BODY'
  AND ("attributes" IS NULL OR NOT ("attributes" ? 'bodyRepair'))
  AND NOT EXISTS (SELECT 1 FROM "WorkshopMaster" WHERE "kind" = 'VEHICLE_GROUP' AND "attributes" ? 'bodyRepair');

-- 3. Service group on labour items, backfilled from the legacy group text (code or name).
ALTER TABLE "LabourItem" ADD COLUMN IF NOT EXISTS "serviceGroupId" TEXT;
CREATE INDEX IF NOT EXISTS "LabourItem_serviceGroupId_idx" ON "LabourItem"("serviceGroupId");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LabourItem_serviceGroupId_fkey' AND conrelid = '"LabourItem"'::regclass) THEN
    ALTER TABLE "LabourItem" ADD CONSTRAINT "LabourItem_serviceGroupId_fkey"
      FOREIGN KEY ("serviceGroupId") REFERENCES "WorkshopMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

UPDATE "LabourItem" l
SET "serviceGroupId" = g."id"
FROM "WorkshopMaster" g
WHERE l."serviceGroupId" IS NULL
  AND NULLIF(TRIM(l."group"), '') IS NOT NULL
  AND g."kind" = 'VEHICLE_GROUP'
  AND (UPPER(g."code") = UPPER(TRIM(l."group")) OR UPPER(g."description") = UPPER(TRIM(l."group")));

-- 4. Anniversary as a date, backfilled from the text where it parses (YYYY-MM-DD or DD/MM/YYYY).
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "anniversaryOn" DATE;
CREATE OR REPLACE FUNCTION pg_temp.mis_try_date(value TEXT) RETURNS DATE AS $$
BEGIN
  IF value ~ '^\d{4}-\d{2}-\d{2}' THEN RETURN to_date(substr(value, 1, 10), 'YYYY-MM-DD'); END IF;
  IF value ~ '^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}$' THEN RETURN to_date(regexp_replace(value, '[.-]', '/', 'g'), 'DD/MM/YYYY'); END IF;
  RETURN NULL;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
UPDATE "Customer"
SET "anniversaryOn" = pg_temp.mis_try_date(TRIM("anniversaryDate"))
WHERE "anniversaryOn" IS NULL AND NULLIF(TRIM("anniversaryDate"), '') IS NOT NULL;

-- 5. Free service due limits: 1F within 30 days / 1,000 km and 2F within 90 days / 5,000 km of
-- the sale date. Only rows with neither limit set; no rows are added, because a setting row
-- makes the service type available for that model at job opening.
UPDATE "ServiceTypeModelSetting" s
SET "daysLimit" = CASE st."code" WHEN '1F' THEN 30 ELSE 90 END,
    "mileageLimit" = CASE st."code" WHEN '1F' THEN 1000 ELSE 5000 END
FROM "WorkshopMaster" st
WHERE st."id" = s."serviceTypeId" AND st."code" IN ('1F', '2F')
  AND s."daysLimit" IS NULL AND s."mileageLimit" IS NULL;

-- 6. Mileage bands (same table and defaults as PR #81's 20261007100000 migration).
CREATE TABLE IF NOT EXISTS "MileageBand" (
  "id" TEXT NOT NULL,
  "fromKm" INTEGER NOT NULL,
  "toKm" INTEGER,
  "label" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MileageBand_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MileageBand_range_check" CHECK ("fromKm" >= 0 AND ("toKm" IS NULL OR "toKm" >= "fromKm"))
);
CREATE INDEX IF NOT EXISTS "MileageBand_sortOrder_idx" ON "MileageBand"("sortOrder");
INSERT INTO "MileageBand" ("id", "fromKm", "toKm", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid(), v.from_km, v.to_km, v.label, v.sort_order, NOW()
FROM (VALUES
  (0, 1000, '0–1,000 km', 1),
  (1001, 5000, '1,001–5,000 km', 2),
  (5001, 10000, '5,001–10,000 km', 3),
  (10001, 20000, '10,001–20,000 km', 4),
  (20001, 40000, '20,001–40,000 km', 5),
  (40001, 60000, '40,001–60,000 km', 6),
  (60001, 100000, '60,001–100,000 km', 7),
  (100001, NULL, '100,000+ km', 8)
) AS v(from_km, to_km, label, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM "MileageBand");

-- 7. Who recorded an owner change (vehicle resale history).
ALTER TABLE "VehicleOwnership" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VehicleOwnership_createdById_fkey' AND conrelid = '"VehicleOwnership"'::regclass) THEN
    ALTER TABLE "VehicleOwnership" ADD CONSTRAINT "VehicleOwnership_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 8. Report indexes.
CREATE INDEX IF NOT EXISTS "JobCard_branchId_deliveredAt_idx" ON "JobCard"("branchId", "deliveredAt");
CREATE INDEX IF NOT EXISTS "JobCard_engineerId_idx" ON "JobCard"("engineerId");
CREATE INDEX IF NOT EXISTS "Vehicle_saleDate_idx" ON "Vehicle"("saleDate");
CREATE INDEX IF NOT EXISTS "VehicleOwnership_purchaseDate_idx" ON "VehicleOwnership"("purchaseDate");

-- 9. Permissions.
INSERT INTO "Permission" ("id", "name", "description")
SELECT gen_random_uuid(), v.name, v.description
FROM (VALUES
  ('report:mis-monthly', 'Run the monthly information report'),
  ('report:business-product-mix', 'Run the business product mix report'),
  ('report:job-analysis', 'Run the analysis of jobs report'),
  ('report:group-productivity', 'Run the group-wise productivity report'),
  ('report:engineer-performance', 'Run the engineer performance report'),
  ('report:engineer-part-consumption', 'Run the engineer-wise part consumption report'),
  ('report:requisition-return-register', 'Run the requisition return register'),
  ('report:major-problems', 'Run the list of major problems'),
  ('report:new-customers', 'Run the list of new customers'),
  ('report:regular-customers', 'Run the list of regular customers'),
  ('report:birthday-anniversary', 'Run the birthday / anniversary report'),
  ('report:vehicle-resale', 'Run the vehicle resale history'),
  ('report:skipped-free-service', 'Run the vehicles that skipped free service report'),
  ('report:vehicle-list', 'Run the vehicle list by model and variant'),
  ('report:management-information', 'Run the management information report')
) AS v(name, description)
WHERE NOT EXISTS (SELECT 1 FROM "Permission" p WHERE p."name" = v.name);

-- 10. Default grants (mirrors ROLE_PERMISSIONS in server/src/shared/constants/roles.ts).
WITH mis(permission) AS (
  SELECT unnest(ARRAY[
    'report:mis-monthly', 'report:business-product-mix', 'report:job-analysis', 'report:group-productivity',
    'report:engineer-performance', 'report:engineer-part-consumption', 'report:requisition-return-register',
    'report:major-problems', 'report:new-customers', 'report:regular-customers', 'report:birthday-anniversary',
    'report:vehicle-resale', 'report:skipped-free-service', 'report:vehicle-list'])
), grants(role, permission) AS (
  SELECT r, 'report:management-information' FROM unnest(ARRAY['SuperAdmin', 'Admin']) r
  UNION ALL SELECT r, mis.permission FROM unnest(ARRAY['SuperAdmin', 'Admin', 'WorkshopManager', 'ServiceManager']) r CROSS JOIN mis
  UNION ALL SELECT 'ServiceAdviser', p FROM unnest(ARRAY[
    'report:new-customers', 'report:regular-customers', 'report:birthday-anniversary',
    'report:skipped-free-service', 'report:vehicle-list', 'report:vehicle-resale']) p
  UNION ALL SELECT r, p FROM unnest(ARRAY['GeneralStoreManager', 'StoreOfficer']) r
    CROSS JOIN unnest(ARRAY['report:requisition-return-register', 'report:engineer-part-consumption']) p
)
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT DISTINCT r."id", p."id"
FROM grants g
JOIN "Role" r ON r."name" = g.role
JOIN "Permission" p ON p."name" = g.permission
WHERE NOT EXISTS (SELECT 1 FROM "RolePermission" rp WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id");

-- ============================================================
-- Technician productivity: standard hours on labour lines and up to three technicians per
-- line (with an optional share). Additive and idempotent; existing lines are backfilled.
-- ============================================================

ALTER TABLE "JobCardLabour" ADD COLUMN IF NOT EXISTS "standardHours" DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS "JobCardLabourTechnician" (
  "id" TEXT NOT NULL,
  "jobCardLabourId" TEXT NOT NULL,
  "technicianId" TEXT NOT NULL,
  "sharePercent" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobCardLabourTechnician_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JobCardLabourTechnician_share_check" CHECK ("sharePercent" IS NULL OR ("sharePercent" > 0 AND "sharePercent" <= 100))
);
CREATE UNIQUE INDEX IF NOT EXISTS "JobCardLabourTechnician_jobCardLabourId_technicianId_key" ON "JobCardLabourTechnician"("jobCardLabourId", "technicianId");
CREATE INDEX IF NOT EXISTS "JobCardLabourTechnician_technicianId_idx" ON "JobCardLabourTechnician"("technicianId");

DO $$ BEGIN
  ALTER TABLE "JobCardLabourTechnician" ADD CONSTRAINT "JobCardLabourTechnician_jobCardLabourId_fkey"
    FOREIGN KEY ("jobCardLabourId") REFERENCES "JobCardLabour"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "JobCardLabourTechnician" ADD CONSTRAINT "JobCardLabourTechnician_technicianId_fkey"
    FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Standard hours of existing lines: the model labour rate when there is one, else the labour item.
UPDATE "JobCardLabour" l
SET "standardHours" = COALESCE(
  (SELECT r."hours" FROM "LabourRate" r
     JOIN "JobCard" j ON j."id" = l."jobCardId"
     JOIN "Vehicle" v ON v."id" = j."vehicleId"
     JOIN "WorkshopMaster" var ON var."id" = v."catalogueId"
   WHERE r."labourItemId" = l."labourItemId" AND r."modelId" = var."parentId" AND r."active" = true
   LIMIT 1),
  (SELECT i."defaultHours" FROM "LabourItem" i WHERE i."id" = l."labourItemId"))
WHERE l."standardHours" IS NULL;

-- Existing single technicians become the line's technician.
INSERT INTO "JobCardLabourTechnician" ("id", "jobCardLabourId", "technicianId")
SELECT gen_random_uuid(), l."id", l."technicianId"
FROM "JobCardLabour" l
WHERE l."technicianId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "JobCardLabourTechnician" t WHERE t."jobCardLabourId" = l."id" AND t."technicianId" = l."technicianId");

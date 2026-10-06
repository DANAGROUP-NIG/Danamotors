-- Reconcile the warranty & campaigns feature with job billing, the labour catalogue
-- and the job opening details. Additive and idempotent.

-- 1. Charge lines ("who pays") now also cover the job card labour lines from the labour
--    catalogue: one JobCardLine per JobCardLabour, removed with it.
ALTER TABLE "JobCardLine" ADD COLUMN IF NOT EXISTS "jobCardLabourId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "JobCardLine_jobCardLabourId_key" ON "JobCardLine"("jobCardLabourId");
DO $$ BEGIN
  ALTER TABLE "JobCardLine" ADD CONSTRAINT "JobCardLine_jobCardLabourId_fkey"
    FOREIGN KEY ("jobCardLabourId") REFERENCES "JobCardLabour"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Labour is now recorded through the labour catalogue (JobCardLabour). Free-standing
--    labour charge lines created by the warranty branch before the merge cannot be billed
--    by job billing; remove them unless a warranty claim line points at them.
DELETE FROM "JobCardLine" jcl
WHERE jcl."kind" = 'LABOUR'
  AND jcl."jobCardLabourId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "WarrantyCaseLine" wcl WHERE wcl."jobCardLineId" = jcl."id");

-- 3. The warranty runs from the vehicle's sale date. Keep sale dates entered through the
--    warranty screens before the merge (Vehicle.warrantyStartDate is deprecated).
UPDATE "Vehicle"
SET "saleDate" = "warrantyStartDate"
WHERE "saleDate" IS NULL AND "warrantyStartDate" IS NOT NULL;

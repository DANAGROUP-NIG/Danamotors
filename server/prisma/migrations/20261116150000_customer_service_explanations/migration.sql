-- Customer-visible explanations are separate from historical internal remarks.
-- Keep existing rows null; never publish internal text through a backfill.
ALTER TABLE "JobCard" ADD COLUMN IF NOT EXISTS "customerRemarks" TEXT;
ALTER TABLE "Estimate" ADD COLUMN IF NOT EXISTS "customerRemarks" TEXT;

-- No index: explanations are projected by existing document primary keys.
-- Roll back application code while retaining these nullable columns and audit
-- history; dropping columns would destroy explanations entered after deployment.

-- ============================================================
-- Estimates before a job card exists (legacy job estimate register): optional job card,
-- branch / customer / vehicle, estimate number and date, discount, lifecycle status, the job
-- opened from the estimate, NGN default currency. Additive and idempotent.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE "EstimateStatus" AS ENUM ('ACTIVE', 'PENDING_APPROVAL', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EstimateCloseReason" AS ENUM ('CONVERTED', 'DECLINED', 'CANCELLED', 'SUPERSEDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Estimate" ALTER COLUMN "jobCardId" DROP NOT NULL;
ALTER TABLE "Estimate" ALTER COLUMN "currency" SET DEFAULT 'NGN';

ALTER TABLE "Estimate"
  ADD COLUMN IF NOT EXISTS "branchId" TEXT,
  ADD COLUMN IF NOT EXISTS "customerId" TEXT,
  ADD COLUMN IF NOT EXISTS "vehicleId" TEXT,
  ADD COLUMN IF NOT EXISTS "estimateNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "estimateDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "estimateStatus" "EstimateStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
  ADD COLUMN IF NOT EXISTS "closedReason" "EstimateCloseReason",
  ADD COLUMN IF NOT EXISTS "openedJobCardId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Estimate_estimateNumber_key" ON "Estimate"("estimateNumber");
CREATE INDEX IF NOT EXISTS "Estimate_branchId_estimateDate_idx" ON "Estimate"("branchId", "estimateDate");
CREATE INDEX IF NOT EXISTS "Estimate_vehicleId_idx" ON "Estimate"("vehicleId");
CREATE INDEX IF NOT EXISTS "Estimate_openedJobCardId_idx" ON "Estimate"("openedJobCardId");

DO $$ BEGIN
  ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_openedJobCardId_fkey" FOREIGN KEY ("openedJobCardId") REFERENCES "JobCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill job revisions from their job card.
UPDATE "Estimate" e
SET "branchId" = j."branchId",
    "customerId" = COALESCE(e."customerId", j."customerId"),
    "vehicleId" = COALESCE(e."vehicleId", j."vehicleId")
FROM "JobCard" j
WHERE j."id" = e."jobCardId" AND e."branchId" IS NULL;

UPDATE "Estimate" SET "estimateDate" = "createdAt" WHERE "estimateDate" IS NULL;

-- A pre-job estimate must say who and what it is for.
DO $$ BEGIN
  ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_pre_job_identity_check"
    CHECK ("jobCardId" IS NOT NULL OR ("branchId" IS NOT NULL AND "customerId" IS NOT NULL AND "vehicleId" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_discount_check" CHECK ("discountAmount" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Lifecycle of existing job revisions: older revisions were superseded; the latest one is
-- pending, or closed once the customer approved (job scope) or declined it.
WITH ranked AS (
  SELECT "id", LOWER("status") AS decision,
         ROW_NUMBER() OVER (PARTITION BY "jobCardId" ORDER BY "createdAt" DESC, "id" DESC) AS rn
  FROM "Estimate"
  WHERE "jobCardId" IS NOT NULL
)
UPDATE "Estimate" e
SET "estimateStatus" = (CASE WHEN r.rn > 1 OR r.decision IN ('approved', 'declined') THEN 'CLOSED' ELSE 'PENDING_APPROVAL' END)::"EstimateStatus",
    "closedReason" = (CASE WHEN r.rn > 1 THEN 'SUPERSEDED' WHEN r.decision = 'approved' THEN 'CONVERTED' WHEN r.decision = 'declined' THEN 'DECLINED' END)::"EstimateCloseReason"
FROM ranked r
WHERE r."id" = e."id" AND e."closedReason" IS NULL AND e."estimateStatus" = 'PENDING_APPROVAL';

-- Estimate numbers (year + 6-digit sequence), continuing any live sequence.
WITH numbered AS (
  SELECT "id",
         EXTRACT(YEAR FROM "estimateDate")::int AS yr,
         ROW_NUMBER() OVER (PARTITION BY EXTRACT(YEAR FROM "estimateDate") ORDER BY "estimateDate", "id") AS n
  FROM "Estimate"
  WHERE "estimateNumber" IS NULL
)
UPDATE "Estimate" e
SET "estimateNumber" = numbered.yr || LPAD((numbered.n + COALESCE(ds."value", 0))::text, 6, '0')
FROM numbered
LEFT JOIN "DocumentSequence" ds ON ds."key" = 'ESTIMATE_' || numbered.yr
WHERE e."id" = numbered."id";

INSERT INTO "DocumentSequence" ("key", "value", "updatedAt")
SELECT 'ESTIMATE_' || LEFT("estimateNumber", 4), MAX(SUBSTRING("estimateNumber" FROM 5)::int), NOW()
FROM "Estimate"
WHERE "estimateNumber" ~ '^[0-9]{10}$'
GROUP BY 1
ON CONFLICT ("key") DO UPDATE SET "value" = GREATEST("DocumentSequence"."value", EXCLUDED."value"), "updatedAt" = NOW();

-- ============================================================
-- Repeat jobs (legacy Service → Repeat Job): the repeat record with its review, reason codes
-- (WorkshopMaster kind REPEAT_REASON, seeded 0–6), the per-branch "print repeat block"
-- setting, new window defaults (15 days / 500 km), and the repeatjob/report permissions.
-- Existing isRepeat jobs get a MANUAL, PENDING_REVIEW record (window unknown).
-- Additive and idempotent: safe on databases that already have any part of it.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE "RepeatJobSource" AS ENUM ('AUTOMATIC', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RepeatJobStatus" AS ENUM ('PENDING_REVIEW', 'CONFIRMED', 'NOT_REPEAT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- New defaults apply to branches saved from now on; saved branch settings keep their values.
ALTER TABLE "BranchSettings" ADD COLUMN IF NOT EXISTS "printRepeatBlock" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BranchSettings" ALTER COLUMN "repeatWindowDays" SET DEFAULT 15;
ALTER TABLE "BranchSettings" ALTER COLUMN "repeatWindowKm" SET DEFAULT 500;

CREATE TABLE IF NOT EXISTS "RepeatJob" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "previousJobId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "daysDifference" INTEGER NOT NULL,
    "kmDifference" INTEGER,
    "previousEngineerId" TEXT,
    "previousServiceAdvisorId" TEXT,
    "previousTechnicianIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "windowDays" INTEGER,
    "windowKm" INTEGER,
    "source" "RepeatJobSource" NOT NULL,
    "status" "RepeatJobStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "openingNote" TEXT,
    "remarks" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RepeatJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RepeatJobReason" (
    "repeatJobId" TEXT NOT NULL,
    "reasonId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "RepeatJobReason_pkey" PRIMARY KEY ("repeatJobId","reasonId")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RepeatJob_jobCardId_key" ON "RepeatJob"("jobCardId");
CREATE INDEX IF NOT EXISTS "RepeatJob_branchId_status_createdAt_idx" ON "RepeatJob"("branchId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "RepeatJob_previousJobId_idx" ON "RepeatJob"("previousJobId");
CREATE INDEX IF NOT EXISTS "RepeatJob_previousEngineerId_idx" ON "RepeatJob"("previousEngineerId");
CREATE INDEX IF NOT EXISTS "RepeatJob_previousServiceAdvisorId_idx" ON "RepeatJob"("previousServiceAdvisorId");
CREATE INDEX IF NOT EXISTS "RepeatJobReason_reasonId_idx" ON "RepeatJobReason"("reasonId");

DO $$ BEGIN
  ALTER TABLE "RepeatJob" ADD CONSTRAINT "RepeatJob_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "RepeatJob" ADD CONSTRAINT "RepeatJob_previousJobId_fkey" FOREIGN KEY ("previousJobId") REFERENCES "JobCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "RepeatJob" ADD CONSTRAINT "RepeatJob_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "RepeatJob" ADD CONSTRAINT "RepeatJob_previousEngineerId_fkey" FOREIGN KEY ("previousEngineerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "RepeatJob" ADD CONSTRAINT "RepeatJob_previousServiceAdvisorId_fkey" FOREIGN KEY ("previousServiceAdvisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "RepeatJob" ADD CONSTRAINT "RepeatJob_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "RepeatJobReason" ADD CONSTRAINT "RepeatJobReason_repeatJobId_fkey" FOREIGN KEY ("repeatJobId") REFERENCES "RepeatJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "RepeatJobReason" ADD CONSTRAINT "RepeatJobReason_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Legacy reason codes. Code 0 means "not a repeat job" (attributes.isNotRepeat).
INSERT INTO "WorkshopMaster" ("id", "kind", "code", "description", "attributes", "displayOrder", "active", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'REPEAT_REASON', '0', 'Not a repeat job', '{"isNotRepeat": true}'::jsonb, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'REPEAT_REASON', '1', 'Component failure', '{"isNotRepeat": false}'::jsonb, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'REPEAT_REASON', '2', 'Wrong diagnosis by supervisor', '{"isNotRepeat": false}'::jsonb, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'REPEAT_REASON', '3', 'Road test not conducted', '{"isNotRepeat": false}'::jsonb, 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'REPEAT_REASON', '4', 'Workmanship problem', '{"isNotRepeat": false}'::jsonb, 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'REPEAT_REASON', '5', 'Engineer negligence', '{"isNotRepeat": false}'::jsonb, 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'REPEAT_REASON', '6', 'Spares unavailable', '{"isNotRepeat": false}'::jsonb, 6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("kind", "code") DO NOTHING;

-- Existing repeat jobs (flagged by hand at opening) keep working: manual, pending review.
INSERT INTO "RepeatJob" (
  "id", "jobCardId", "previousJobId", "branchId", "daysDifference", "kmDifference",
  "previousEngineerId", "previousServiceAdvisorId", "previousTechnicianIds",
  "source", "status", "openingNote", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text, j."id", p."id", j."branchId",
  GREATEST(0, ((j."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Lagos')::date
            - ((p."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Lagos')::date),
  CASE WHEN j."mileage" IS NOT NULL AND p."mileage" IS NOT NULL AND j."mileage" >= p."mileage"
       THEN j."mileage" - p."mileage" END,
  p."engineerId", p."serviceAdvisorId",
  ARRAY(
    SELECT DISTINCT t FROM (
      SELECT p."technicianId" AS t
      UNION ALL
      SELECT l."technicianId" FROM "JobCardLabour" l WHERE l."jobCardId" = p."id"
    ) techs WHERE t IS NOT NULL
  ),
  'MANUAL', 'PENDING_REVIEW', NULLIF(TRIM(j."repeatReason"), ''), j."createdAt", CURRENT_TIMESTAMP
FROM "JobCard" j
JOIN "JobCard" p ON p."id" = j."previousJobId"
WHERE j."isRepeat" = true
ON CONFLICT ("jobCardId") DO NOTHING;

-- Permissions.
INSERT INTO "Permission" ("id", "name", "description", "createdAt")
VALUES
  (gen_random_uuid()::text, 'repeatjob:read', 'View repeat jobs and their reviews', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'repeatjob:review', 'Review repeat jobs: record reason codes and remarks', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'report:repeat-list', 'Run the repeat job list', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'report:repeat-analysis', 'Run the repeat job analysis', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'report:repeat-summary', 'Run the date-wise summary of repeat jobs', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- Same grants as ROLE_PERMISSIONS in src/shared/constants/roles.ts.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM (VALUES
  ('SuperAdmin', 'repeatjob:read'), ('SuperAdmin', 'repeatjob:review'), ('SuperAdmin', 'report:repeat-list'), ('SuperAdmin', 'report:repeat-analysis'), ('SuperAdmin', 'report:repeat-summary'),
  ('Admin', 'repeatjob:read'), ('Admin', 'repeatjob:review'), ('Admin', 'report:repeat-list'), ('Admin', 'report:repeat-analysis'), ('Admin', 'report:repeat-summary'),
  ('WorkshopManager', 'repeatjob:read'), ('WorkshopManager', 'repeatjob:review'), ('WorkshopManager', 'report:repeat-list'), ('WorkshopManager', 'report:repeat-analysis'), ('WorkshopManager', 'report:repeat-summary'),
  ('ServiceManager', 'repeatjob:read'), ('ServiceManager', 'report:repeat-list'), ('ServiceManager', 'report:repeat-analysis'), ('ServiceManager', 'report:repeat-summary'),
  ('ServiceAdviser', 'repeatjob:read'), ('ServiceAdviser', 'report:repeat-list'), ('ServiceAdviser', 'report:repeat-analysis'), ('ServiceAdviser', 'report:repeat-summary'),
  ('Auditor', 'repeatjob:read'), ('Auditor', 'report:repeat-list'), ('Auditor', 'report:repeat-analysis'), ('Auditor', 'report:repeat-summary')
) AS g(role_name, permission_name)
JOIN "Role" r ON r.name = g.role_name
JOIN "Permission" p ON p.name = g.permission_name
ON CONFLICT DO NOTHING;

BEGIN;

ALTER TABLE "JobCard"
    ADD COLUMN IF NOT EXISTS "observations" TEXT,
    ADD COLUMN IF NOT EXISTS "estimatedParts" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "estimatedOil" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "estimatedLabour" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "estimatedCost" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "assignedTo" TEXT,
    ADD COLUMN IF NOT EXISTS "qcStatus" TEXT DEFAULT 'Pending',
    ADD COLUMN IF NOT EXISTS "qcNotes" TEXT;

-- Existing inspections need a value when the required findings column is restored.
ALTER TABLE "Inspection"
    ADD COLUMN IF NOT EXISTS "findings" TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS "passed" BOOLEAN,
    ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'Pending';

-- Prisma requires findings on new inspections.
ALTER TABLE "Inspection" ALTER COLUMN "findings" DROP DEFAULT;

COMMIT;

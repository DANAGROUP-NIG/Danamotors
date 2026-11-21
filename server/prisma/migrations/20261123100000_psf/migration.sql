-- ============================================================
-- PSF: post-service follow-up (legacy Service → Follow-up, #111).
-- The follow-up of a delivered job (current status), every call attempt and the status of each
-- followed-up line per call, plus the psf / report permissions.
-- Additive and idempotent: safe on databases that already have any part of it.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE "PsfStatus" AS ENUM ('SATISFIED', 'DISSATISFIED', 'NO_PHONE', 'NOT_AVAILABLE', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PsfLineKind" AS ENUM ('SERVICE', 'LABOUR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "PsfFollowUp" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT,
    "vehicleId" TEXT,
    "status" "PsfStatus" NOT NULL,
    "remark" TEXT,
    "lastCallId" TEXT,
    "lastCalledAt" TIMESTAMP(3) NOT NULL,
    "lastCalledById" TEXT,
    "callCount" INTEGER NOT NULL DEFAULT 0,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PsfFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PsfCall" (
    "id" TEXT NOT NULL,
    "followUpId" TEXT NOT NULL,
    "status" "PsfStatus" NOT NULL,
    "remark" TEXT,
    "calledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calledById" TEXT,
    "bookingAt" TIMESTAMP(3),
    "bookingServiceTypeId" TEXT,
    "appointmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PsfCall_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PsfCallLine" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "kind" "PsfLineKind" NOT NULL,
    "jobCardLabourId" TEXT,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "PsfStatus" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PsfCallLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PsfFollowUp_jobCardId_key" ON "PsfFollowUp"("jobCardId");

CREATE UNIQUE INDEX IF NOT EXISTS "PsfFollowUp_lastCallId_key" ON "PsfFollowUp"("lastCallId");

CREATE INDEX IF NOT EXISTS "PsfFollowUp_branchId_status_idx" ON "PsfFollowUp"("branchId", "status");

CREATE INDEX IF NOT EXISTS "PsfFollowUp_customerId_idx" ON "PsfFollowUp"("customerId");

CREATE INDEX IF NOT EXISTS "PsfFollowUp_vehicleId_idx" ON "PsfFollowUp"("vehicleId");

CREATE INDEX IF NOT EXISTS "PsfFollowUp_lastCalledById_idx" ON "PsfFollowUp"("lastCalledById");

CREATE INDEX IF NOT EXISTS "PsfFollowUp_closedById_idx" ON "PsfFollowUp"("closedById");

CREATE INDEX IF NOT EXISTS "PsfCall_followUpId_calledAt_idx" ON "PsfCall"("followUpId", "calledAt");

CREATE INDEX IF NOT EXISTS "PsfCall_calledById_idx" ON "PsfCall"("calledById");

CREATE INDEX IF NOT EXISTS "PsfCall_bookingServiceTypeId_idx" ON "PsfCall"("bookingServiceTypeId");

CREATE INDEX IF NOT EXISTS "PsfCall_appointmentId_idx" ON "PsfCall"("appointmentId");

CREATE INDEX IF NOT EXISTS "PsfCallLine_callId_idx" ON "PsfCallLine"("callId");

CREATE INDEX IF NOT EXISTS "PsfCallLine_jobCardLabourId_idx" ON "PsfCallLine"("jobCardLabourId");

DO $$ BEGIN
  ALTER TABLE "PsfFollowUp" ADD CONSTRAINT "PsfFollowUp_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PsfFollowUp" ADD CONSTRAINT "PsfFollowUp_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PsfFollowUp" ADD CONSTRAINT "PsfFollowUp_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PsfFollowUp" ADD CONSTRAINT "PsfFollowUp_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PsfFollowUp" ADD CONSTRAINT "PsfFollowUp_lastCalledById_fkey" FOREIGN KEY ("lastCalledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PsfFollowUp" ADD CONSTRAINT "PsfFollowUp_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PsfCall" ADD CONSTRAINT "PsfCall_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "PsfFollowUp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PsfCall" ADD CONSTRAINT "PsfCall_calledById_fkey" FOREIGN KEY ("calledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PsfCall" ADD CONSTRAINT "PsfCall_bookingServiceTypeId_fkey" FOREIGN KEY ("bookingServiceTypeId") REFERENCES "WorkshopMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PsfCall" ADD CONSTRAINT "PsfCall_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "ServiceAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PsfCallLine" ADD CONSTRAINT "PsfCallLine_callId_fkey" FOREIGN KEY ("callId") REFERENCES "PsfCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PsfCallLine" ADD CONSTRAINT "PsfCallLine_jobCardLabourId_fkey" FOREIGN KEY ("jobCardLabourId") REFERENCES "JobCardLabour"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Permissions.
INSERT INTO "Permission" ("id", "name", "description", "createdAt")
VALUES
  (gen_random_uuid()::text, 'psf:read', 'View post-service follow-ups and the follow-up list', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'psf:update', 'Record post-service follow-up calls (follow-up status entry)', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'psf:letter', 'Print customer follow-up letters and the mailing list', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'report:psf-analysis', 'Run the customer follow-up analysis', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'report:psf-analysis-model', 'Run the customer follow-up analysis, model-wise', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'report:psf-dissatisfied', 'Run the follow-up list for dissatisfied customers', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'report:psf-closed', 'Run the list of follow-up closed', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'report:psf-history', 'Run the vehicle follow-up history', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- Same grants as ROLE_PERMISSIONS in src/shared/constants/roles.ts. TODO(confirm) with the business (#111 open question 2).
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM (
  SELECT role_name, permission_name
  FROM (VALUES ('SuperAdmin'), ('Admin'), ('ServiceManager'), ('CCUManager')) AS roles(role_name)
  CROSS JOIN (VALUES ('psf:read'), ('psf:update'), ('psf:letter'), ('report:psf-analysis'), ('report:psf-analysis-model'),
                     ('report:psf-dissatisfied'), ('report:psf-closed'), ('report:psf-history')) AS perms(permission_name)
  UNION ALL
  SELECT 'CCUOfficer', permission_name
  FROM (VALUES ('psf:read'), ('psf:update'), ('psf:letter'), ('report:psf-dissatisfied'), ('report:psf-history')) AS perms(permission_name)
  UNION ALL
  SELECT role_name, permission_name
  FROM (VALUES ('WorkshopManager'), ('Auditor')) AS roles(role_name)
  CROSS JOIN (VALUES ('psf:read'), ('report:psf-analysis'), ('report:psf-analysis-model'), ('report:psf-dissatisfied'),
                     ('report:psf-closed'), ('report:psf-history')) AS perms(permission_name)
) AS g
JOIN "Role" r ON r.name = g.role_name
JOIN "Permission" p ON p.name = g.permission_name
ON CONFLICT DO NOTHING;

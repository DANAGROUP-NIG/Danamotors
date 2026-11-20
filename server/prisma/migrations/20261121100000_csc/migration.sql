-- ============================================================
-- CSC (legacy Service → CSC): service due rules per model and service, closure reasons,
-- the cases (vehicle due for a service), follow-up contacts and stage closures, and the
-- csc / report permissions. Seeds the legacy rule values for every active model and a
-- neutral list of closure reasons (insert-if-missing).
-- Additive and idempotent: safe on databases that already have any part of it.
-- ============================================================


DO $$ BEGIN
  CREATE TYPE "CscClosureType" AS ENUM ('FINAL', 'PARTIAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CscCaseStatus" AS ENUM ('OPEN', 'VISITED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CscStage" AS ENUM ('FIRST', 'SECOND', 'NOT_VISITED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CscRule" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "serviceTypeId" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "dueDays" INTEGER NOT NULL,
    "dueKm" INTEGER NOT NULL,
    "rotationDays" INTEGER NOT NULL,
    "rotationKm" INTEGER NOT NULL,
    "followUp1Days" INTEGER NOT NULL,
    "followUp2Days" INTEGER NOT NULL,
    "variationDays" INTEGER NOT NULL,
    "variationKm" INTEGER NOT NULL,
    "matchDaysBefore" INTEGER NOT NULL DEFAULT 10,
    "matchDaysAfter" INTEGER NOT NULL DEFAULT 10,
    "notVisitedMonths" INTEGER NOT NULL DEFAULT 48,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CscRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CscCloseReason" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "shortDescription" TEXT,
    "closureType" "CscClosureType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CscCloseReason_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CscCase" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "customerId" TEXT,
    "branchId" TEXT NOT NULL,
    "serviceTypeId" TEXT NOT NULL,
    "ruleId" TEXT,
    "dueDate" DATE NOT NULL,
    "dueMileage" INTEGER,
    "followUp1Date" DATE NOT NULL,
    "followUp2Date" DATE NOT NULL,
    "matchDaysBefore" INTEGER NOT NULL DEFAULT 10,
    "matchDaysAfter" INTEGER NOT NULL DEFAULT 10,
    "status" "CscCaseStatus" NOT NULL DEFAULT 'OPEN',
    "lastVisitJobCardId" TEXT,
    "visitJobCardId" TEXT,
    "visitedAt" TIMESTAMP(3),
    "bookingId" TEXT,
    "bookedAt" TIMESTAMP(3),
    "closeReasonId" TEXT,
    "closeRemarks" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "generatedById" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CscCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CscContact" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "stage" "CscStage" NOT NULL,
    "slot" INTEGER NOT NULL,
    "contactDate" DATE NOT NULL,
    "contactPerson" TEXT,
    "remarks" TEXT,
    "doneById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CscContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CscStageClosure" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "stage" "CscStage" NOT NULL,
    "reasonId" TEXT NOT NULL,
    "remarks" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" TEXT,

    CONSTRAINT "CscStageClosure_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CscRule_modelId_effectiveDate_idx" ON "CscRule"("modelId", "effectiveDate");

CREATE UNIQUE INDEX IF NOT EXISTS "CscRule_modelId_serviceTypeId_effectiveDate_key" ON "CscRule"("modelId", "serviceTypeId", "effectiveDate");

CREATE UNIQUE INDEX IF NOT EXISTS "CscCloseReason_code_key" ON "CscCloseReason"("code");

CREATE INDEX IF NOT EXISTS "CscCase_branchId_status_dueDate_idx" ON "CscCase"("branchId", "status", "dueDate");

CREATE INDEX IF NOT EXISTS "CscCase_branchId_followUp1Date_idx" ON "CscCase"("branchId", "followUp1Date");

CREATE INDEX IF NOT EXISTS "CscCase_branchId_followUp2Date_idx" ON "CscCase"("branchId", "followUp2Date");

CREATE INDEX IF NOT EXISTS "CscCase_vehicleId_status_idx" ON "CscCase"("vehicleId", "status");

CREATE INDEX IF NOT EXISTS "CscCase_closeReasonId_idx" ON "CscCase"("closeReasonId");

CREATE UNIQUE INDEX IF NOT EXISTS "CscCase_vehicleId_serviceTypeId_dueDate_key" ON "CscCase"("vehicleId", "serviceTypeId", "dueDate");

CREATE INDEX IF NOT EXISTS "CscContact_doneById_idx" ON "CscContact"("doneById");

CREATE UNIQUE INDEX IF NOT EXISTS "CscContact_caseId_stage_slot_key" ON "CscContact"("caseId", "stage", "slot");

CREATE INDEX IF NOT EXISTS "CscStageClosure_reasonId_idx" ON "CscStageClosure"("reasonId");

CREATE UNIQUE INDEX IF NOT EXISTS "CscStageClosure_caseId_stage_key" ON "CscStageClosure"("caseId", "stage");

DO $$ BEGIN
  ALTER TABLE "CscRule" ADD CONSTRAINT "CscRule_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CscRule" ADD CONSTRAINT "CscRule_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CscCase" ADD CONSTRAINT "CscCase_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CscCase" ADD CONSTRAINT "CscCase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CscCase" ADD CONSTRAINT "CscCase_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CscCase" ADD CONSTRAINT "CscCase_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CscCase" ADD CONSTRAINT "CscCase_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "CscRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CscCase" ADD CONSTRAINT "CscCase_lastVisitJobCardId_fkey" FOREIGN KEY ("lastVisitJobCardId") REFERENCES "JobCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CscCase" ADD CONSTRAINT "CscCase_visitJobCardId_fkey" FOREIGN KEY ("visitJobCardId") REFERENCES "JobCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CscCase" ADD CONSTRAINT "CscCase_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ServiceAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CscCase" ADD CONSTRAINT "CscCase_closeReasonId_fkey" FOREIGN KEY ("closeReasonId") REFERENCES "CscCloseReason"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CscCase" ADD CONSTRAINT "CscCase_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CscCase" ADD CONSTRAINT "CscCase_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CscContact" ADD CONSTRAINT "CscContact_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CscCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CscContact" ADD CONSTRAINT "CscContact_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CscStageClosure" ADD CONSTRAINT "CscStageClosure_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CscCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CscStageClosure" ADD CONSTRAINT "CscStageClosure_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "CscCloseReason"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CscStageClosure" ADD CONSTRAINT "CscStageClosure_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Closure reasons. TODO(confirm): Lagos and Abuja kept different lists; this is one neutral company-wide list.
INSERT INTO "CscCloseReason" ("id", "code", "description", "shortDescription", "closureType", "active", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'R0001', 'Presently customer not available', 'NOTAVAIL', 'PARTIAL', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'R0002', 'Phone switched off or not reachable', 'NOREACH', 'PARTIAL', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'R0003', 'Customer not willing to come', 'NOTWILL', 'FINAL', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'R0004', 'Vehicle sold', 'SOLD', 'FINAL', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'R0005', 'Serviced at another workshop', 'OUTSIDE', 'FINAL', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'R0006', 'Wrong or invalid phone number', 'WRONGNO', 'FINAL', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'R0007', 'Customer asked to call back later', 'CALLBACK', 'PARTIAL', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'R0008', 'Customer relocated', 'RELOCATED', 'FINAL', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Legacy CSCMaster values (identical for every model), effective from 2010-09-13, for each active model.
-- Fresh databases get the same rows from prisma/seed/csc.ts once the models exist.
INSERT INTO "CscRule" (
  "id", "modelId", "serviceTypeId", "effectiveDate", "dueDays", "dueKm", "rotationDays", "rotationKm",
  "followUp1Days", "followUp2Days", "variationDays", "variationKm", "matchDaysBefore", "matchDaysAfter",
  "notVisitedMonths", "active", "createdAt", "updatedAt"
)
SELECT gen_random_uuid()::text, m."id", st."id", DATE '2010-09-13', v.due_days, v.due_km, v.rot_days, v.rot_km,
       15, 5, v.var_days, v.var_km, 10, 10, 48, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('1F', 30, 1000, 30, 1000, 15, 500),
  ('2F', 90, 5000, 90, 5000, 45, 2500),
  ('3F', 180, 10000, 180, 10000, 90, 5000),
  ('RG', 270, 15000, 90, 5000, 45, 2500)
) AS v(code, due_days, due_km, rot_days, rot_km, var_days, var_km)
JOIN "WorkshopMaster" st ON st."kind" = 'SERVICE_TYPE' AND st."code" = v.code
CROSS JOIN "WorkshopMaster" m
WHERE m."kind" = 'MODEL' AND m."active" = true
ON CONFLICT ("modelId", "serviceTypeId", "effectiveDate") DO NOTHING;

-- Permissions.
INSERT INTO "Permission" ("id", "name", "description", "createdAt")
VALUES
  (gen_random_uuid()::text, 'csc:master:read', 'View the CSC master and closure reasons', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'csc:master:update', 'Edit the CSC master and closure reasons', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'csc:case:read', 'View CSC cases and the call sheet', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'csc:case:generate', 'Generate CSC cases', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'csc:followup:update', 'Record CSC follow-up calls, bookings and closures', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'report:csc-followup', 'Run the CSC follow-up report', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'report:csc-not-visited', 'Run the vehicles not visited after due date report', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'report:csc-no-show', 'Run the no-show analysis', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- Same grants as ROLE_PERMISSIONS in src/shared/constants/roles.ts.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM (VALUES
  ('SuperAdmin', 'csc:master:read'), ('SuperAdmin', 'csc:master:update'), ('SuperAdmin', 'csc:case:read'), ('SuperAdmin', 'csc:case:generate'),
  ('SuperAdmin', 'csc:followup:update'), ('SuperAdmin', 'report:csc-followup'), ('SuperAdmin', 'report:csc-not-visited'), ('SuperAdmin', 'report:csc-no-show'),
  ('Admin', 'csc:master:read'), ('Admin', 'csc:master:update'), ('Admin', 'csc:case:read'), ('Admin', 'csc:case:generate'),
  ('Admin', 'csc:followup:update'), ('Admin', 'report:csc-followup'), ('Admin', 'report:csc-not-visited'), ('Admin', 'report:csc-no-show'),
  ('ServiceManager', 'csc:master:read'), ('ServiceManager', 'csc:master:update'), ('ServiceManager', 'csc:case:read'), ('ServiceManager', 'csc:case:generate'),
  ('ServiceManager', 'csc:followup:update'), ('ServiceManager', 'report:csc-followup'), ('ServiceManager', 'report:csc-not-visited'), ('ServiceManager', 'report:csc-no-show'),
  ('CCUManager', 'csc:master:read'), ('CCUManager', 'csc:case:read'), ('CCUManager', 'csc:case:generate'), ('CCUManager', 'csc:followup:update'),
  ('CCUManager', 'report:csc-followup'), ('CCUManager', 'report:csc-not-visited'), ('CCUManager', 'report:csc-no-show'),
  ('CCUOfficer', 'csc:master:read'), ('CCUOfficer', 'csc:case:read'), ('CCUOfficer', 'csc:followup:update'), ('CCUOfficer', 'report:csc-followup'),
  ('Auditor', 'csc:master:read'), ('Auditor', 'csc:case:read'),
  ('Auditor', 'report:csc-followup'), ('Auditor', 'report:csc-not-visited'), ('Auditor', 'report:csc-no-show')
) AS g(role_name, permission_name)
JOIN "Role" r ON r."name" = g.role_name
JOIN "Permission" p ON p."name" = g.permission_name
ON CONFLICT DO NOTHING;

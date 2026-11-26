-- Job card revamp phase 3: Diagnosis (additive).
-- Adds the supervisor's allocation note, the technician's findings (with work and parts needed,
-- no prices) and the service engineer's review, and lets the Engineer role act on job cards.
-- JobCard.teamId stays: reports and PDI read it, and the allocation fills it from the technician's
-- employee team. The old JobCard.observations and JobCard.assignedTo columns are moved and dropped
-- by 20261126125424_jobcard_drop_observations, kept separate so a shared database can keep them
-- until other branches stop reading them.

-- CreateEnum
CREATE TYPE "DiagnosisRoute" AS ENUM ('WARRANTY', 'ESTIMATE');

-- CreateEnum
CREATE TYPE "JobFindingItemKind" AS ENUM ('LABOUR', 'PART', 'OIL');

-- AlterEnum
ALTER TYPE "JobPhotoCategory" ADD VALUE 'FINDING';

-- CreateTable
CREATE TABLE "JobDiagnosis" (
    "jobCardId" TEXT NOT NULL,
    "allocationNote" TEXT,
    "allocatedById" TEXT,
    "allocatedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "returnedAt" TIMESTAMP(3),
    "returnedById" TEXT,
    "returnedNote" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "route" "DiagnosisRoute",
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobDiagnosis_pkey" PRIMARY KEY ("jobCardId")
);

-- CreateTable
CREATE TABLE "JobFinding" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "complaintId" TEXT,
    "causeAndDefect" TEXT NOT NULL DEFAULT '',
    "possibleWarranty" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobFindingItem" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "kind" "JobFindingItemKind" NOT NULL,
    "referenceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "JobFindingItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "JobFindingItem_quantity_check" CHECK ("quantity" > 0)
);

-- AlterTable
ALTER TABLE "JobPhoto" ADD COLUMN "findingId" TEXT;

-- CreateIndex
CREATE INDEX "JobFinding_jobCardId_createdAt_idx" ON "JobFinding"("jobCardId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobFinding_jobCardId_complaintId_key" ON "JobFinding"("jobCardId", "complaintId");

-- CreateIndex
CREATE INDEX "JobFindingItem_findingId_sortOrder_idx" ON "JobFindingItem"("findingId", "sortOrder");

-- CreateIndex
CREATE INDEX "JobPhoto_findingId_idx" ON "JobPhoto"("findingId");

-- AddForeignKey
ALTER TABLE "JobDiagnosis" ADD CONSTRAINT "JobDiagnosis_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobDiagnosis" ADD CONSTRAINT "JobDiagnosis_allocatedById_fkey" FOREIGN KEY ("allocatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobDiagnosis" ADD CONSTRAINT "JobDiagnosis_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobDiagnosis" ADD CONSTRAINT "JobDiagnosis_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobDiagnosis" ADD CONSTRAINT "JobDiagnosis_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobFinding" ADD CONSTRAINT "JobFinding_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobFinding" ADD CONSTRAINT "JobFinding_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "JobComplaint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobFinding" ADD CONSTRAINT "JobFinding_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JobFindingItem" ADD CONSTRAINT "JobFindingItem_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "JobFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobPhoto" ADD CONSTRAINT "JobPhoto_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "JobFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Permissions: the service engineer confirms or returns the diagnosis through the stage action,
-- which needs jobcard:update. Mirrors ROLE_PERMISSIONS; seed resets use the same defaults.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "Role" r
JOIN "Permission" p ON p.name = 'jobcard:update'
WHERE r.name = 'Engineer'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

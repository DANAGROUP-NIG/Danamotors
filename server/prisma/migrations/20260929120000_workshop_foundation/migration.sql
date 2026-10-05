-- DropForeignKey
ALTER TABLE "Vehicle" DROP CONSTRAINT IF EXISTS "Vehicle_customerId_fkey";

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS     "code" TEXT,
ADD COLUMN IF NOT EXISTS     "companyName" TEXT,
ADD COLUMN IF NOT EXISTS     "contactPerson" TEXT,
ADD COLUMN IF NOT EXISTS     "house" TEXT,
ADD COLUMN IF NOT EXISTS     "mergedIntoId" TEXT,
ADD COLUMN IF NOT EXISTS     "mobile2" TEXT,
ADD COLUMN IF NOT EXISTS     "office1" TEXT,
ADD COLUMN IF NOT EXISTS     "office2" TEXT,
ADD COLUMN IF NOT EXISTS     "registeredName" TEXT,
ADD COLUMN IF NOT EXISTS     "salutation" TEXT,
ADD COLUMN IF NOT EXISTS     "street" TEXT,
ADD COLUMN IF NOT EXISTS     "tallyPartyCode" TEXT,
ADD COLUMN IF NOT EXISTS     "type" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
ADD COLUMN IF NOT EXISTS     "zone" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "JobCard" ADD COLUMN IF NOT EXISTS     "acFitted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS     "bayId" TEXT,
ADD COLUMN IF NOT EXISTS     "creditApprovedById" TEXT,
ADD COLUMN IF NOT EXISTS     "deliveredAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "deliveryAdvisorId" TEXT,
ADD COLUMN IF NOT EXISTS     "gatePassNumber" TEXT,
ADD COLUMN IF NOT EXISTS     "inHouse" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS     "isRepeat" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS     "lateReasonIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS     "mileage" INTEGER,
ADD COLUMN IF NOT EXISTS     "observations" TEXT,
ADD COLUMN IF NOT EXISTS     "previousJobId" TEXT,
ADD COLUMN IF NOT EXISTS     "promisedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "readyAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "remarks" TEXT,
ADD COLUMN IF NOT EXISTS     "repeatReason" TEXT,
ADD COLUMN IF NOT EXISTS     "serviceAdvisorId" TEXT,
ADD COLUMN IF NOT EXISTS     "serviceTypeId" TEXT,
ADD COLUMN IF NOT EXISTS     "teamId" TEXT,
ADD COLUMN IF NOT EXISTS     "workDone" TEXT;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS     "catalogueId" TEXT,
ADD COLUMN IF NOT EXISTS     "colourId" TEXT,
ADD COLUMN IF NOT EXISTS     "engineNumber" TEXT,
ADD COLUMN IF NOT EXISTS     "keyNumber" TEXT,
ADD COLUMN IF NOT EXISTS     "lastRecordedMileage" INTEGER,
ADD COLUMN IF NOT EXISTS     "pdiDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "pdiDone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS     "saleDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "sellingDealer" TEXT,
ALTER COLUMN "customerId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "LabourItem" ADD COLUMN IF NOT EXISTS     "group" TEXT,
ADD COLUMN IF NOT EXISTS     "vehicleSystem" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "WorkshopMaster" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "category" TEXT,
    "chargedTo" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "freeService" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    "fuel" TEXT,
    "gearbox" TEXT,
    "acFitted" BOOLEAN NOT NULL DEFAULT false,
    "warrantyDays" INTEGER,
    "warrantyKm" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "JobComplaint" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "complaintCodeId" TEXT,
    "description" TEXT NOT NULL,

    CONSTRAINT "JobComplaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "JobCardStatusHistory" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobCardStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LabourRate" (
    "id" TEXT NOT NULL,
    "labourItemId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "pricing" TEXT NOT NULL DEFAULT 'TIME',
    "hours" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "rate" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LabourRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "EstimateLine" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "referenceId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "EstimateLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WorkshopMaster_kind_active_idx" ON "WorkshopMaster"("kind", "active");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WorkshopMaster_parentId_idx" ON "WorkshopMaster"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WorkshopMaster_kind_code_key" ON "WorkshopMaster"("kind", "code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "JobComplaint_jobCardId_idx" ON "JobComplaint"("jobCardId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "JobCardStatusHistory_jobCardId_createdAt_idx" ON "JobCardStatusHistory"("jobCardId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LabourRate_labourItemId_modelId_key" ON "LabourRate"("labourItemId", "modelId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EstimateLine_estimateId_idx" ON "EstimateLine"("estimateId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_code_key" ON "Customer"("code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "JobCard_gatePassNumber_key" ON "JobCard"("gatePassNumber");

-- AddForeignKey
DO $$ BEGIN
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_bayId_fkey" FOREIGN KEY ("bayId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_serviceAdvisorId_fkey" FOREIGN KEY ("serviceAdvisorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_deliveryAdvisorId_fkey" FOREIGN KEY ("deliveryAdvisorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_previousJobId_fkey" FOREIGN KEY ("previousJobId") REFERENCES "JobCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_creditApprovedById_fkey" FOREIGN KEY ("creditApprovedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_catalogueId_fkey" FOREIGN KEY ("catalogueId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_colourId_fkey" FOREIGN KEY ("colourId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
ALTER TABLE "WorkshopMaster" ADD CONSTRAINT "WorkshopMaster_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
ALTER TABLE "JobComplaint" ADD CONSTRAINT "JobComplaint_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
ALTER TABLE "JobComplaint" ADD CONSTRAINT "JobComplaint_complaintCodeId_fkey" FOREIGN KEY ("complaintCodeId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
ALTER TABLE "JobCardStatusHistory" ADD CONSTRAINT "JobCardStatusHistory_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
ALTER TABLE "JobCardStatusHistory" ADD CONSTRAINT "JobCardStatusHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
ALTER TABLE "LabourRate" ADD CONSTRAINT "LabourRate_labourItemId_fkey" FOREIGN KEY ("labourItemId") REFERENCES "LabourItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
ALTER TABLE "LabourRate" ADD CONSTRAINT "LabourRate_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Do not invent legacy customer identities or job-opening data. NULL marks records needing review.
CREATE INDEX IF NOT EXISTS "Customer_phoneNumber_idx" ON "Customer" ("phoneNumber");
CREATE INDEX IF NOT EXISTS "Customer_mergedIntoId_idx" ON "Customer" ("mergedIntoId");
CREATE INDEX IF NOT EXISTS "JobCard_vehicleId_createdAt_idx" ON "JobCard" ("vehicleId", "createdAt");
-- Start the generator after any existing legacy job numbers in the same numeric format.
INSERT INTO "DocumentSequence" ("key", "value", "updatedAt")
SELECT 'JOB_CARD_' || left("jobNumber", 4), max(right("jobNumber", 6)::integer), NOW()
FROM "JobCard" WHERE "jobNumber" ~ '^[0-9]{10}$' GROUP BY left("jobNumber", 4)
ON CONFLICT ("key") DO UPDATE SET "value" = GREATEST("DocumentSequence"."value", EXCLUDED."value");

-- Empty contact/registration values represent absence, not an identifier.
UPDATE "Customer" SET "email" = NULL WHERE btrim("email") = '';
UPDATE "Vehicle" SET "registrationNumber" = NULL WHERE btrim("registrationNumber") = '';

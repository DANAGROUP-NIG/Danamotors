-- Warranty coverage, warranty cases, job card charge types and campaigns (recall / free fix).
-- Additive only. Written idempotently so it can run against existing databases.
-- The free-text Vehicle.warrantyProvider/Status/ExpiresAt columns are kept for now (deprecated);
-- a follow-up migration drops them once no deployed build reads them.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "WarrantyCoverageStatus" AS ENUM ('ACTIVE', 'EXPIRED_DATE', 'EXPIRED_MILEAGE', 'NOT_COVERED', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "WarrantyOverrideType" AS ENUM ('EXTENDED', 'GOODWILL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ChargeType" AS ENUM ('CUSTOMER', 'WARRANTY', 'GOODWILL', 'FREE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "JobCardLineKind" AS ENUM ('PART', 'LABOUR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "WarrantyCaseStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'RETURNED', 'SETTLED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "WarrantyLineRole" AS ENUM ('CAUSAL', 'CONSEQUENTIAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "CampaignType" AS ENUM ('RECALL', 'FREE_FIX', 'SERVICE_CAMPAIGN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "CampaignVehicleStatus" AS ENUM ('PENDING', 'CONTACTED', 'SCHEDULED', 'COMPLETED', 'NOT_REACHABLE', 'NOT_APPLICABLE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ContactChannel" AS ENUM ('PHONE', 'SMS', 'WHATSAPP', 'EMAIL', 'VISIT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ContactOutcome" AS ENUM ('REACHED', 'NO_ANSWER', 'WRONG_NUMBER', 'CALL_BACK', 'DECLINED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "JobCard" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "JobCard" ADD COLUMN IF NOT EXISTS "mileage" INTEGER;
ALTER TABLE "JobCard" ADD COLUMN IF NOT EXISTS "warrantyAcknowledgedAt" TIMESTAMP(3);
ALTER TABLE "JobCard" ADD COLUMN IF NOT EXISTS "warrantyAcknowledgedById" TEXT;
ALTER TABLE "JobCard" ADD COLUMN IF NOT EXISTS "warrantyExpiresOnAtCreation" TIMESTAMP(3);
ALTER TABLE "JobCard" ADD COLUMN IF NOT EXISTS "warrantyKmLimitAtCreation" INTEGER;
ALTER TABLE "JobCard" ADD COLUMN IF NOT EXISTS "warrantyReasonsAtCreation" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "JobCard" ADD COLUMN IF NOT EXISTS "warrantySnapshot" JSONB;
ALTER TABLE "JobCard" ADD COLUMN IF NOT EXISTS "warrantyStatusAtCreation" "WarrantyCoverageStatus";

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "lastMileageAt" TIMESTAMP(3);
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "lastRecordedMileage" INTEGER;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "vehicleModelId" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "warrantyOverrideKm" INTEGER;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "warrantyOverrideReason" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "warrantyOverrideType" "WarrantyOverrideType";
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "warrantyOverrideUntil" TIMESTAMP(3);
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "warrantyStartDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SparePart" ADD COLUMN IF NOT EXISTS "warrantyApplicable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SparePart" ADD COLUMN IF NOT EXISTS "warrantyRate" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE IF NOT EXISTS "VehicleModel" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "make" TEXT NOT NULL DEFAULT 'Kia',
    "name" TEXT NOT NULL,
    "warrantyDays" INTEGER,
    "warrantyKm" INTEGER,
    "warrantyCovered" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "JobCardLine" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "kind" "JobCardLineKind" NOT NULL,
    "sparePartId" TEXT,
    "partIssuanceId" TEXT,
    "operationCode" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "chargeType" "ChargeType" NOT NULL DEFAULT 'CUSTOMER',
    "campaignId" TEXT,
    "chargeTypeChangedById" TEXT,
    "chargeTypeChangedAt" TIMESTAMP(3),
    "chargeTypeReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobCardLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "jobCardLineId" TEXT,
    "kind" "JobCardLineKind" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "WarrantyComplaintCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarrantyComplaintCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "WarrantyDefectCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarrantyDefectCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "WarrantyPositionCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarrantyPositionCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "WarrantyRejectReason" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarrantyRejectReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "WarrantyCase" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "jobCardId" TEXT,
    "vehicleId" TEXT NOT NULL,
    "customerId" TEXT,
    "branchId" TEXT NOT NULL,
    "status" "WarrantyCaseStatus" NOT NULL DEFAULT 'OPEN',
    "openedAutomatically" BOOLEAN NOT NULL DEFAULT false,
    "complaintCodeId" TEXT,
    "complaint" TEXT,
    "mileage" INTEGER,
    "coverageStatus" "WarrantyCoverageStatus",
    "manufacturerClaimNo" TEXT,
    "manufacturerClaimDate" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "decisionAt" TIMESTAMP(3),
    "rejectReasonId" TEXT,
    "claimedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "approvedAmount" DOUBLE PRECISION,
    "settledAt" TIMESTAMP(3),
    "settlementRef" TEXT,
    "settledAmount" DOUBLE PRECISION,
    "closedAt" TIMESTAMP(3),
    "assignedOfficerId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarrantyCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "WarrantyCaseLine" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" "JobCardLineKind" NOT NULL,
    "role" "WarrantyLineRole",
    "sparePartId" TEXT,
    "partNumber" TEXT,
    "operationCode" TEXT,
    "description" TEXT NOT NULL,
    "defectCodeId" TEXT,
    "positionCodeId" TEXT,
    "batchNo" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "claimedAmount" DOUBLE PRECISION NOT NULL,
    "approvalPercent" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "approvedAmount" DOUBLE PRECISION,
    "jobCardLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarrantyCaseLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "WarrantyCaseStatusHistory" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "fromStatus" "WarrantyCaseStatus",
    "toStatus" "WarrantyCaseStatus" NOT NULL,
    "actorId" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarrantyCaseStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Campaign" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "CampaignType" NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "defectDescription" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "labourCovered" BOOLEAN NOT NULL DEFAULT true,
    "partsCovered" BOOLEAN NOT NULL DEFAULT true,
    "activatedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CampaignModel" (
    "campaignId" TEXT NOT NULL,
    "vehicleModelId" TEXT NOT NULL,
    "yearFrom" INTEGER,
    "yearTo" INTEGER,

    CONSTRAINT "CampaignModel_pkey" PRIMARY KEY ("campaignId","vehicleModelId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CampaignCoveredItem" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "kind" "JobCardLineKind" NOT NULL,
    "partNumber" TEXT,
    "operationCode" TEXT,
    "description" TEXT NOT NULL,
    "maxQuantity" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignCoveredItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CampaignVehicle" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "vin" TEXT NOT NULL,
    "vehicleId" TEXT,
    "status" "CampaignVehicleStatus" NOT NULL DEFAULT 'PENDING',
    "contactAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastContactAt" TIMESTAMP(3),
    "lastContactOutcome" "ContactOutcome",
    "nextFollowUpAt" TIMESTAMP(3),
    "contactedAt" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "appointmentId" TEXT,
    "completedJobCardId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CampaignContactLog" (
    "id" TEXT NOT NULL,
    "campaignVehicleId" TEXT NOT NULL,
    "channel" "ContactChannel" NOT NULL,
    "outcome" "ContactOutcome" NOT NULL,
    "notes" TEXT,
    "nextFollowUpAt" TIMESTAMP(3),
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignContactLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "JobCardCampaign" (
    "jobCardId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignCode" TEXT NOT NULL,
    "campaignTitle" TEXT NOT NULL,
    "campaignType" "CampaignType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobCardCampaign_pkey" PRIMARY KEY ("jobCardId","campaignId")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "VehicleModel_code_key" ON "VehicleModel"("code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "VehicleModel_make_name_key" ON "VehicleModel"("make", "name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "JobCardLine_partIssuanceId_key" ON "JobCardLine"("partIssuanceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "JobCardLine_jobCardId_idx" ON "JobCardLine"("jobCardId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "JobCardLine_campaignId_idx" ON "JobCardLine"("campaignId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "JobCardLine_sparePartId_idx" ON "JobCardLine"("sparePartId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InvoiceLine_jobCardLineId_idx" ON "InvoiceLine"("jobCardLineId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WarrantyComplaintCode_code_key" ON "WarrantyComplaintCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WarrantyDefectCode_code_key" ON "WarrantyDefectCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WarrantyPositionCode_code_key" ON "WarrantyPositionCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WarrantyRejectReason_code_key" ON "WarrantyRejectReason"("code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WarrantyCase_caseNumber_key" ON "WarrantyCase"("caseNumber");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WarrantyCase_jobCardId_key" ON "WarrantyCase"("jobCardId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WarrantyCase_branchId_status_idx" ON "WarrantyCase"("branchId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WarrantyCase_status_createdAt_idx" ON "WarrantyCase"("status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WarrantyCase_vehicleId_idx" ON "WarrantyCase"("vehicleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WarrantyCase_manufacturerClaimNo_idx" ON "WarrantyCase"("manufacturerClaimNo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WarrantyCaseLine_jobCardLineId_idx" ON "WarrantyCaseLine"("jobCardLineId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WarrantyCaseLine_caseId_seq_key" ON "WarrantyCaseLine"("caseId", "seq");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WarrantyCaseStatusHistory_caseId_createdAt_idx" ON "WarrantyCaseStatusHistory"("caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Campaign_code_key" ON "Campaign"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Campaign_status_type_idx" ON "Campaign"("status", "type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CampaignModel_vehicleModelId_idx" ON "CampaignModel"("vehicleModelId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CampaignCoveredItem_campaignId_idx" ON "CampaignCoveredItem"("campaignId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CampaignVehicle_vehicleId_idx" ON "CampaignVehicle"("vehicleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CampaignVehicle_vin_idx" ON "CampaignVehicle"("vin");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CampaignVehicle_campaignId_status_idx" ON "CampaignVehicle"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignVehicle_campaignId_vin_key" ON "CampaignVehicle"("campaignId", "vin");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CampaignContactLog_campaignVehicleId_createdAt_idx" ON "CampaignContactLog"("campaignVehicleId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "JobCardCampaign_campaignId_idx" ON "JobCardCampaign"("campaignId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Vehicle_vehicleModelId_idx" ON "Vehicle"("vehicleModelId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_warrantyAcknowledgedById_fkey" FOREIGN KEY ("warrantyAcknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_vehicleModelId_fkey" FOREIGN KEY ("vehicleModelId") REFERENCES "VehicleModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "JobCardLine" ADD CONSTRAINT "JobCardLine_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "JobCardLine" ADD CONSTRAINT "JobCardLine_sparePartId_fkey" FOREIGN KEY ("sparePartId") REFERENCES "SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "JobCardLine" ADD CONSTRAINT "JobCardLine_partIssuanceId_fkey" FOREIGN KEY ("partIssuanceId") REFERENCES "PartIssuance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "JobCardLine" ADD CONSTRAINT "JobCardLine_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "JobCardLine" ADD CONSTRAINT "JobCardLine_chargeTypeChangedById_fkey" FOREIGN KEY ("chargeTypeChangedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "JobCardLine" ADD CONSTRAINT "JobCardLine_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_jobCardLineId_fkey" FOREIGN KEY ("jobCardLineId") REFERENCES "JobCardLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "WarrantyCase" ADD CONSTRAINT "WarrantyCase_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "WarrantyCase" ADD CONSTRAINT "WarrantyCase_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "WarrantyCase" ADD CONSTRAINT "WarrantyCase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "WarrantyCase" ADD CONSTRAINT "WarrantyCase_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "WarrantyCase" ADD CONSTRAINT "WarrantyCase_complaintCodeId_fkey" FOREIGN KEY ("complaintCodeId") REFERENCES "WarrantyComplaintCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "WarrantyCase" ADD CONSTRAINT "WarrantyCase_rejectReasonId_fkey" FOREIGN KEY ("rejectReasonId") REFERENCES "WarrantyRejectReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "WarrantyCase" ADD CONSTRAINT "WarrantyCase_assignedOfficerId_fkey" FOREIGN KEY ("assignedOfficerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "WarrantyCase" ADD CONSTRAINT "WarrantyCase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "WarrantyCaseLine" ADD CONSTRAINT "WarrantyCaseLine_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "WarrantyCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "WarrantyCaseLine" ADD CONSTRAINT "WarrantyCaseLine_sparePartId_fkey" FOREIGN KEY ("sparePartId") REFERENCES "SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "WarrantyCaseLine" ADD CONSTRAINT "WarrantyCaseLine_defectCodeId_fkey" FOREIGN KEY ("defectCodeId") REFERENCES "WarrantyDefectCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "WarrantyCaseLine" ADD CONSTRAINT "WarrantyCaseLine_positionCodeId_fkey" FOREIGN KEY ("positionCodeId") REFERENCES "WarrantyPositionCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "WarrantyCaseLine" ADD CONSTRAINT "WarrantyCaseLine_jobCardLineId_fkey" FOREIGN KEY ("jobCardLineId") REFERENCES "JobCardLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "WarrantyCaseStatusHistory" ADD CONSTRAINT "WarrantyCaseStatusHistory_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "WarrantyCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "WarrantyCaseStatusHistory" ADD CONSTRAINT "WarrantyCaseStatusHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CampaignModel" ADD CONSTRAINT "CampaignModel_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CampaignModel" ADD CONSTRAINT "CampaignModel_vehicleModelId_fkey" FOREIGN KEY ("vehicleModelId") REFERENCES "VehicleModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CampaignCoveredItem" ADD CONSTRAINT "CampaignCoveredItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CampaignVehicle" ADD CONSTRAINT "CampaignVehicle_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CampaignVehicle" ADD CONSTRAINT "CampaignVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CampaignVehicle" ADD CONSTRAINT "CampaignVehicle_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "ServiceAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CampaignVehicle" ADD CONSTRAINT "CampaignVehicle_completedJobCardId_fkey" FOREIGN KEY ("completedJobCardId") REFERENCES "JobCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CampaignContactLog" ADD CONSTRAINT "CampaignContactLog_campaignVehicleId_fkey" FOREIGN KEY ("campaignVehicleId") REFERENCES "CampaignVehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CampaignContactLog" ADD CONSTRAINT "CampaignContactLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "JobCardCampaign" ADD CONSTRAINT "JobCardCampaign_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "JobCardCampaign" ADD CONSTRAINT "JobCardCampaign_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Data integrity checks (guarded so re-running is safe).
DO $$ BEGIN
  ALTER TABLE "WarrantyCaseLine" ADD CONSTRAINT "WarrantyCaseLine_approvalPercent_range" CHECK ("approvalPercent" >= 0 AND "approvalPercent" <= 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "WarrantyCaseLine" ADD CONSTRAINT "WarrantyCaseLine_amounts_nonnegative" CHECK ("quantity" > 0 AND "rate" >= 0 AND "claimedAmount" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "JobCardLine" ADD CONSTRAINT "JobCardLine_amounts_nonnegative" CHECK ("quantity" > 0 AND "rate" >= 0 AND "amount" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_mileage_nonnegative" CHECK ("mileage" IS NULL OR "mileage" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_lastRecordedMileage_nonnegative" CHECK ("lastRecordedMileage" IS NULL OR "lastRecordedMileage" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "VehicleModel" ADD CONSTRAINT "VehicleModel_limits_positive" CHECK (("warrantyDays" IS NULL OR "warrantyDays" > 0) AND ("warrantyKm" IS NULL OR "warrantyKm" > 0));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

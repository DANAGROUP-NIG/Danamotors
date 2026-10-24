-- P1: additive service transaction schema; safe to reapply.
BEGIN;

-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BookingStatus' AND typnamespace = current_schema()::regnamespace) THEN
    CREATE TYPE "BookingStatus" AS ENUM ('BOOKED', 'CONVERTED', 'CANCELLED', 'NO_SHOW');
  END IF;
END $$;

-- AlterTable
ALTER TABLE "ServiceAppointment" ADD COLUMN IF NOT EXISTS     "acFitted" BOOLEAN,
ADD COLUMN IF NOT EXISTS     "bookingNumber" TEXT,
ADD COLUMN IF NOT EXISTS     "bookingStatus" "BookingStatus" NOT NULL DEFAULT 'BOOKED',
ADD COLUMN IF NOT EXISTS     "cancelReason" TEXT,
ADD COLUMN IF NOT EXISTS     "followUpJobId" TEXT,
ADD COLUMN IF NOT EXISTS     "mileage" INTEGER;

-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN IF NOT EXISTS     "remarks" TEXT;

-- AlterTable
ALTER TABLE "PartReturn" ADD COLUMN IF NOT EXISTS     "amount" DECIMAL(18,2),
ADD COLUMN IF NOT EXISTS     "rate" DECIMAL(18,2),
ADD COLUMN IF NOT EXISTS     "requisitionLineId" TEXT,
ADD COLUMN IF NOT EXISTS     "returnSlipId" TEXT;

-- AlterTable
ALTER TABLE "JobCardLabour" ADD COLUMN IF NOT EXISTS     "groupId" TEXT,
ADD COLUMN IF NOT EXISTS     "labourSlipId" TEXT,
ADD COLUMN IF NOT EXISTS     "standardHours" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "JobCardLine" ADD COLUMN IF NOT EXISTS     "requisitionLineId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AppointmentRequest" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "complaintCodeId" TEXT,
    "defectCode" TEXT,
    "description" TEXT NOT NULL,
    "estimatedParts" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "estimatedLabour" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "estimatedOil" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PartRequisition" (
    "id" TEXT NOT NULL,
    "requisitionNumber" TEXT NOT NULL,
    "requisitionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "branchId" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "chargeType" "ChargeType" NOT NULL,
    "groupId" TEXT,
    "engineerId" TEXT,
    "goodwillReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "createdById" TEXT NOT NULL,
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartRequisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PartRequisitionLine" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "sparePartId" TEXT NOT NULL,
    "partIssuanceId" TEXT,
    "partSource" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "uom" TEXT,
    "location" TEXT,
    "binCard" TEXT,
    "quantityRequired" INTEGER NOT NULL,
    "quantityIssued" INTEGER NOT NULL DEFAULT 0,
    "rate" DECIMAL(18,2) NOT NULL,
    "warrantyRate" DECIMAL(18,2),
    "amount" DECIMAL(18,2) NOT NULL,
    "approvalPercent" DECIMAL(5,2),
    "customerPercent" DECIMAL(5,2),
    "approvedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "customerAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartRequisitionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PartReturnSlip" (
    "id" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "returnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "branchId" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "createdById" TEXT NOT NULL,
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartReturnSlip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LabourSlip" (
    "id" TEXT NOT NULL,
    "slipNumber" TEXT NOT NULL,
    "slipDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "branchId" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "groupId" TEXT,
    "engineerId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabourSlip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppointmentRequest_appointmentId_idx" ON "AppointmentRequest"("appointmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppointmentRequest_complaintCodeId_idx" ON "AppointmentRequest"("complaintCodeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PartRequisition_jobCardId_idx" ON "PartRequisition"("jobCardId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PartRequisition_groupId_idx" ON "PartRequisition"("groupId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PartRequisition_engineerId_idx" ON "PartRequisition"("engineerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PartRequisition_branchId_requisitionDate_idx" ON "PartRequisition"("branchId", "requisitionDate");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PartRequisition_branchId_requisitionNumber_key" ON "PartRequisition"("branchId", "requisitionNumber");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PartRequisitionLine_partIssuanceId_key" ON "PartRequisitionLine"("partIssuanceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PartRequisitionLine_requisitionId_idx" ON "PartRequisitionLine"("requisitionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PartRequisitionLine_sparePartId_idx" ON "PartRequisitionLine"("sparePartId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PartReturnSlip_jobCardId_idx" ON "PartReturnSlip"("jobCardId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PartReturnSlip_requisitionId_idx" ON "PartReturnSlip"("requisitionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PartReturnSlip_branchId_returnDate_idx" ON "PartReturnSlip"("branchId", "returnDate");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PartReturnSlip_branchId_returnNumber_key" ON "PartReturnSlip"("branchId", "returnNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LabourSlip_jobCardId_idx" ON "LabourSlip"("jobCardId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LabourSlip_groupId_idx" ON "LabourSlip"("groupId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LabourSlip_engineerId_idx" ON "LabourSlip"("engineerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LabourSlip_branchId_slipDate_idx" ON "LabourSlip"("branchId", "slipDate");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LabourSlip_branchId_slipNumber_key" ON "LabourSlip"("branchId", "slipNumber");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceAppointment_bookingNumber_key" ON "ServiceAppointment"("bookingNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ServiceAppointment_followUpJobId_idx" ON "ServiceAppointment"("followUpJobId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ServiceAppointment_branchId_bookingStatus_scheduledAt_idx" ON "ServiceAppointment"("branchId", "bookingStatus", "scheduledAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PartReturn_returnSlipId_idx" ON "PartReturn"("returnSlipId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PartReturn_requisitionLineId_idx" ON "PartReturn"("requisitionLineId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "JobCardLabour_labourSlipId_idx" ON "JobCardLabour"("labourSlipId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "JobCardLabour_groupId_idx" ON "JobCardLabour"("groupId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "JobCardLine_requisitionLineId_idx" ON "JobCardLine"("requisitionLineId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceAppointment_followUpJobId_fkey' AND conrelid = '"ServiceAppointment"'::regclass) THEN
    ALTER TABLE "ServiceAppointment" ADD CONSTRAINT "ServiceAppointment_followUpJobId_fkey" FOREIGN KEY ("followUpJobId") REFERENCES "JobCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartReturn_returnSlipId_fkey' AND conrelid = '"PartReturn"'::regclass) THEN
    ALTER TABLE "PartReturn" ADD CONSTRAINT "PartReturn_returnSlipId_fkey" FOREIGN KEY ("returnSlipId") REFERENCES "PartReturnSlip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartReturn_requisitionLineId_fkey' AND conrelid = '"PartReturn"'::regclass) THEN
    ALTER TABLE "PartReturn" ADD CONSTRAINT "PartReturn_requisitionLineId_fkey" FOREIGN KEY ("requisitionLineId") REFERENCES "PartRequisitionLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobCardLabour_labourSlipId_fkey' AND conrelid = '"JobCardLabour"'::regclass) THEN
    ALTER TABLE "JobCardLabour" ADD CONSTRAINT "JobCardLabour_labourSlipId_fkey" FOREIGN KEY ("labourSlipId") REFERENCES "LabourSlip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobCardLabour_groupId_fkey' AND conrelid = '"JobCardLabour"'::regclass) THEN
    ALTER TABLE "JobCardLabour" ADD CONSTRAINT "JobCardLabour_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobCardLine_requisitionLineId_fkey' AND conrelid = '"JobCardLine"'::regclass) THEN
    ALTER TABLE "JobCardLine" ADD CONSTRAINT "JobCardLine_requisitionLineId_fkey" FOREIGN KEY ("requisitionLineId") REFERENCES "PartRequisitionLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AppointmentRequest_appointmentId_fkey' AND conrelid = '"AppointmentRequest"'::regclass) THEN
    ALTER TABLE "AppointmentRequest" ADD CONSTRAINT "AppointmentRequest_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "ServiceAppointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AppointmentRequest_complaintCodeId_fkey' AND conrelid = '"AppointmentRequest"'::regclass) THEN
    ALTER TABLE "AppointmentRequest" ADD CONSTRAINT "AppointmentRequest_complaintCodeId_fkey" FOREIGN KEY ("complaintCodeId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartRequisition_branchId_fkey' AND conrelid = '"PartRequisition"'::regclass) THEN
    ALTER TABLE "PartRequisition" ADD CONSTRAINT "PartRequisition_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartRequisition_jobCardId_fkey' AND conrelid = '"PartRequisition"'::regclass) THEN
    ALTER TABLE "PartRequisition" ADD CONSTRAINT "PartRequisition_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartRequisition_groupId_fkey' AND conrelid = '"PartRequisition"'::regclass) THEN
    ALTER TABLE "PartRequisition" ADD CONSTRAINT "PartRequisition_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartRequisition_engineerId_fkey' AND conrelid = '"PartRequisition"'::regclass) THEN
    ALTER TABLE "PartRequisition" ADD CONSTRAINT "PartRequisition_engineerId_fkey" FOREIGN KEY ("engineerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartRequisition_createdById_fkey' AND conrelid = '"PartRequisition"'::regclass) THEN
    ALTER TABLE "PartRequisition" ADD CONSTRAINT "PartRequisition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartRequisition_cancelledById_fkey' AND conrelid = '"PartRequisition"'::regclass) THEN
    ALTER TABLE "PartRequisition" ADD CONSTRAINT "PartRequisition_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartRequisitionLine_requisitionId_fkey' AND conrelid = '"PartRequisitionLine"'::regclass) THEN
    ALTER TABLE "PartRequisitionLine" ADD CONSTRAINT "PartRequisitionLine_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "PartRequisition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartRequisitionLine_sparePartId_fkey' AND conrelid = '"PartRequisitionLine"'::regclass) THEN
    ALTER TABLE "PartRequisitionLine" ADD CONSTRAINT "PartRequisitionLine_sparePartId_fkey" FOREIGN KEY ("sparePartId") REFERENCES "SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartRequisitionLine_partIssuanceId_fkey' AND conrelid = '"PartRequisitionLine"'::regclass) THEN
    ALTER TABLE "PartRequisitionLine" ADD CONSTRAINT "PartRequisitionLine_partIssuanceId_fkey" FOREIGN KEY ("partIssuanceId") REFERENCES "PartIssuance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartReturnSlip_branchId_fkey' AND conrelid = '"PartReturnSlip"'::regclass) THEN
    ALTER TABLE "PartReturnSlip" ADD CONSTRAINT "PartReturnSlip_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartReturnSlip_jobCardId_fkey' AND conrelid = '"PartReturnSlip"'::regclass) THEN
    ALTER TABLE "PartReturnSlip" ADD CONSTRAINT "PartReturnSlip_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartReturnSlip_requisitionId_fkey' AND conrelid = '"PartReturnSlip"'::regclass) THEN
    ALTER TABLE "PartReturnSlip" ADD CONSTRAINT "PartReturnSlip_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "PartRequisition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartReturnSlip_createdById_fkey' AND conrelid = '"PartReturnSlip"'::regclass) THEN
    ALTER TABLE "PartReturnSlip" ADD CONSTRAINT "PartReturnSlip_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartReturnSlip_cancelledById_fkey' AND conrelid = '"PartReturnSlip"'::regclass) THEN
    ALTER TABLE "PartReturnSlip" ADD CONSTRAINT "PartReturnSlip_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LabourSlip_branchId_fkey' AND conrelid = '"LabourSlip"'::regclass) THEN
    ALTER TABLE "LabourSlip" ADD CONSTRAINT "LabourSlip_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LabourSlip_jobCardId_fkey' AND conrelid = '"LabourSlip"'::regclass) THEN
    ALTER TABLE "LabourSlip" ADD CONSTRAINT "LabourSlip_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LabourSlip_groupId_fkey' AND conrelid = '"LabourSlip"'::regclass) THEN
    ALTER TABLE "LabourSlip" ADD CONSTRAINT "LabourSlip_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LabourSlip_engineerId_fkey' AND conrelid = '"LabourSlip"'::regclass) THEN
    ALTER TABLE "LabourSlip" ADD CONSTRAINT "LabourSlip_engineerId_fkey" FOREIGN KEY ("engineerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LabourSlip_createdById_fkey' AND conrelid = '"LabourSlip"'::regclass) THEN
    ALTER TABLE "LabourSlip" ADD CONSTRAINT "LabourSlip_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Invariants for new documents; existing bare issue/return rows remain valid.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceAppointment_booking_mileage_check' AND conrelid = '"ServiceAppointment"'::regclass) THEN
    ALTER TABLE "ServiceAppointment" ADD CONSTRAINT "ServiceAppointment_booking_mileage_check" CHECK ("mileage" IS NULL OR "mileage" >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceAppointment_booking_cancel_reason_check' AND conrelid = '"ServiceAppointment"'::regclass) THEN
    ALTER TABLE "ServiceAppointment" ADD CONSTRAINT "ServiceAppointment_booking_cancel_reason_check" CHECK ("bookingStatus" <> 'CANCELLED' OR NULLIF(btrim("cancelReason"), '') IS NOT NULL);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AppointmentRequest_amounts_check' AND conrelid = '"AppointmentRequest"'::regclass) THEN
    ALTER TABLE "AppointmentRequest" ADD CONSTRAINT "AppointmentRequest_amounts_check" CHECK ("estimatedParts" >= 0 AND "estimatedLabour" >= 0 AND "estimatedOil" >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartRequisitionLine_quantities_check' AND conrelid = '"PartRequisitionLine"'::regclass) THEN
    ALTER TABLE "PartRequisitionLine" ADD CONSTRAINT "PartRequisitionLine_quantities_check" CHECK ("quantityRequired" > 0 AND "quantityIssued" >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartRequisitionLine_amounts_check' AND conrelid = '"PartRequisitionLine"'::regclass) THEN
    ALTER TABLE "PartRequisitionLine" ADD CONSTRAINT "PartRequisitionLine_amounts_check" CHECK ("rate" >= 0 AND ("warrantyRate" IS NULL OR "warrantyRate" >= 0) AND "amount" >= 0 AND "approvedAmount" >= 0 AND "customerAmount" >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartRequisitionLine_split_check' AND conrelid = '"PartRequisitionLine"'::regclass) THEN
    ALTER TABLE "PartRequisitionLine" ADD CONSTRAINT "PartRequisitionLine_split_check" CHECK (("approvalPercent" IS NULL AND "customerPercent" IS NULL) OR ("approvalPercent" IS NOT NULL AND "customerPercent" IS NOT NULL AND "approvalPercent" BETWEEN 0 AND 100 AND "customerPercent" BETWEEN 0 AND 100 AND "approvalPercent" + "customerPercent" = 100));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartRequisition_status_check' AND conrelid = '"PartRequisition"'::regclass) THEN
    ALTER TABLE "PartRequisition" ADD CONSTRAINT "PartRequisition_status_check" CHECK ("status" IN ('ISSUED', 'CANCELLED'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartReturnSlip_status_check' AND conrelid = '"PartReturnSlip"'::regclass) THEN
    ALTER TABLE "PartReturnSlip" ADD CONSTRAINT "PartReturnSlip_status_check" CHECK ("status" IN ('COMPLETED', 'CANCELLED'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartReturn_slip_snapshot_check' AND conrelid = '"PartReturn"'::regclass) THEN
    ALTER TABLE "PartReturn" ADD CONSTRAINT "PartReturn_slip_snapshot_check" CHECK (("returnSlipId" IS NULL AND "requisitionLineId" IS NULL) OR ("returnSlipId" IS NOT NULL AND "requisitionLineId" IS NOT NULL AND "rate" IS NOT NULL AND "amount" IS NOT NULL AND "rate" >= 0 AND "amount" >= 0 AND "quantity" > 0));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobCardLabour_standard_hours_check' AND conrelid = '"JobCardLabour"'::regclass) THEN
    ALTER TABLE "JobCardLabour" ADD CONSTRAINT "JobCardLabour_standard_hours_check" CHECK ("standardHours" IS NULL OR ("standardHours" >= 0 AND "standardHours" < 'Infinity'::float8));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartRequisition_cancel_reason_check' AND conrelid = '"PartRequisition"'::regclass) THEN
    ALTER TABLE "PartRequisition" ADD CONSTRAINT "PartRequisition_cancel_reason_check" CHECK ("status" <> 'CANCELLED' OR (NULLIF(btrim("cancelReason"), '') IS NOT NULL AND "cancelledAt" IS NOT NULL AND "cancelledById" IS NOT NULL));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartReturnSlip_cancel_reason_check' AND conrelid = '"PartReturnSlip"'::regclass) THEN
    ALTER TABLE "PartReturnSlip" ADD CONSTRAINT "PartReturnSlip_cancel_reason_check" CHECK ("status" <> 'CANCELLED' OR (NULLIF(btrim("cancelReason"), '') IS NOT NULL AND "cancelledAt" IS NOT NULL AND "cancelledById" IS NOT NULL));
  END IF;
END $$;

COMMIT;

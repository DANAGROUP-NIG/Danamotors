-- Job card revamp phase 5: estimate, item-by-item approval, phone approval, advance and release.
-- Money columns move from double precision to numeric (values rounded to kobo). The JobComplaint
-- request amounts are kept and converted (PDI works its defect totals out from them). The indicative
-- opening estimate totals on JobCard are dropped separately (20261127090200_jobcard_drop_opening_estimate).

-- CreateEnum
CREATE TYPE "LineDecision" AS ENUM ('APPROVED', 'DECLINED');
CREATE TYPE "AdvanceExemption" AS ENUM ('WARRANTY_ONLY', 'FREE_SERVICE', 'CAMPAIGN', 'INTERNAL', 'CREDIT_APPROVED');
CREATE TYPE "EstimationChargeStatus" AS ENUM ('ADDED', 'WAIVER_REQUESTED', 'WAIVED');
CREATE TYPE "JobPartsRequestStatus" AS ENUM ('SENT', 'FAILED');

-- Money to Decimal, converting the stored values
ALTER TABLE "Estimate"
  ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2) USING ROUND("amount"::numeric, 2),
  ADD COLUMN "presentedAt" TIMESTAMP(3),
  ADD COLUMN "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 7.5;

ALTER TABLE "EstimateLine"
  ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(12,2) USING ROUND("quantity"::numeric, 2),
  ALTER COLUMN "rate" SET DATA TYPE DECIMAL(18,2) USING ROUND("rate"::numeric, 2),
  ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2) USING ROUND("amount"::numeric, 2),
  ADD COLUMN "payer" "FindingPayer" NOT NULL DEFAULT 'CUSTOMER',
  ADD COLUMN "customerDecision" "LineDecision",
  ADD COLUMN "findingItemId" TEXT,
  ADD COLUMN "complaintId" TEXT,
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "EstimateSignature"
  ALTER COLUMN "totalSigned" SET DATA TYPE DECIMAL(18,2) USING ROUND("totalSigned"::numeric, 2),
  ADD COLUMN "hashVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "signerPhone" TEXT;

ALTER TABLE "JobCard"
  ALTER COLUMN "serviceCharge" SET DATA TYPE DECIMAL(18,2) USING ROUND("serviceCharge"::numeric, 2),
  ADD COLUMN "advanceExemption" "AdvanceExemption",
  ADD COLUMN "advanceExemptionReason" TEXT,
  ADD COLUMN "advanceExemptedById" TEXT,
  ADD COLUMN "advanceExemptedAt" TIMESTAMP(3);

ALTER TABLE "JobComplaint"
  ALTER COLUMN "spare" SET DATA TYPE DECIMAL(18,2) USING ROUND("spare"::numeric, 2),
  ALTER COLUMN "oil" SET DATA TYPE DECIMAL(18,2) USING ROUND("oil"::numeric, 2),
  ALTER COLUMN "labour" SET DATA TYPE DECIMAL(18,2) USING ROUND("labour"::numeric, 2);

-- Approvals: channel, phone approval evidence and idempotency
ALTER TABLE "CustomerApproval"
  ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'COUNTER',
  ADD COLUMN "contentHash" TEXT,
  ADD COLUMN "requestId" TEXT,
  ADD COLUMN "approverName" TEXT,
  ADD COLUMN "approverPhone" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "recordedById" TEXT,
  ADD COLUMN "signatureDueAtDelivery" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "CustomerApproval_requestId_key" ON "CustomerApproval"("requestId");

-- Estimation charge settings (terms clause 4)
ALTER TABLE "BranchSettings"
  ADD COLUMN "estimationChargeMinimum" DECIMAL(18,2) NOT NULL DEFAULT 25000,
  ADD COLUMN "estimationChargePercent" DECIMAL(5,2) NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "EstimationCharge" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" "EstimationChargeStatus" NOT NULL,
    "createdById" TEXT NOT NULL,
    "waiverReason" TEXT,
    "waiverRequestedById" TEXT,
    "waiverRequestedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EstimationCharge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobPartsRequest" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "status" "JobPartsRequestStatus" NOT NULL,
    "failure" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "sentAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JobPartsRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EstimationCharge_jobCardId_key" ON "EstimationCharge"("jobCardId");
CREATE UNIQUE INDEX "EstimationCharge_estimateId_key" ON "EstimationCharge"("estimateId");
CREATE UNIQUE INDEX "JobPartsRequest_estimateId_key" ON "JobPartsRequest"("estimateId");
CREATE INDEX "JobPartsRequest_jobCardId_idx" ON "JobPartsRequest"("jobCardId");
CREATE INDEX "EstimateLine_findingItemId_idx" ON "EstimateLine"("findingItemId");

-- AddForeignKey
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_advanceExemptedById_fkey" FOREIGN KEY ("advanceExemptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerApproval" ADD CONSTRAINT "CustomerApproval_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_findingItemId_fkey" FOREIGN KEY ("findingItemId") REFERENCES "JobFindingItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "JobComplaint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EstimationCharge" ADD CONSTRAINT "EstimationCharge_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EstimationCharge" ADD CONSTRAINT "EstimationCharge_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EstimationCharge" ADD CONSTRAINT "EstimationCharge_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EstimationCharge" ADD CONSTRAINT "EstimationCharge_waiverRequestedById_fkey" FOREIGN KEY ("waiverRequestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EstimationCharge" ADD CONSTRAINT "EstimationCharge_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobPartsRequest" ADD CONSTRAINT "JobPartsRequest_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobPartsRequest" ADD CONSTRAINT "JobPartsRequest_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobPartsRequest" ADD CONSTRAINT "JobPartsRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

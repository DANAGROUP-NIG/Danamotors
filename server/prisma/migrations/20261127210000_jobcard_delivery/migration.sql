-- Job card revamp phase 9: delivery. Additive only.
-- The customer's delivery signature (one per job, never updated), managers' approvals to release a
-- vehicle to someone other than the owner or the job card signer (terms clause 7), the post-service
-- follow-up due date set at delivery, and the branch setting for how many days after delivery it is due.

-- CreateEnum
CREATE TYPE "CollectorType" AS ENUM ('OWNER', 'CHECK_IN_SIGNER', 'OTHER');

-- AlterTable
ALTER TABLE "BranchSettings" ADD COLUMN "psfFollowUpDays" INTEGER NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE "JobCard" ADD COLUMN "psfFollowUpDueAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "JobDeliverySignature" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "collectorType" "CollectorType" NOT NULL,
    "belongingsReturned" JSONB NOT NULL,
    "releaseApprovalId" TEXT,
    "signerName" TEXT NOT NULL,
    "signerPhone" TEXT,
    "snapshot" JSONB NOT NULL,
    "documentHash" CHAR(64) NOT NULL,
    "evidenceHash" CHAR(64) NOT NULL,
    "capturedById" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signatureImage" TEXT NOT NULL,

    CONSTRAINT "JobDeliverySignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobReleaseApproval" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "collectorName" TEXT NOT NULL,
    "collectorPhone" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "approvedById" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT NOT NULL,

    CONSTRAINT "JobReleaseApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobDeliverySignature_jobCardId_key" ON "JobDeliverySignature"("jobCardId");

-- CreateIndex
CREATE UNIQUE INDEX "JobDeliverySignature_requestId_key" ON "JobDeliverySignature"("requestId");

-- CreateIndex
CREATE INDEX "JobReleaseApproval_jobCardId_approvedAt_idx" ON "JobReleaseApproval"("jobCardId", "approvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobReleaseApproval_jobCardId_requestId_key" ON "JobReleaseApproval"("jobCardId", "requestId");

-- AddForeignKey
ALTER TABLE "JobDeliverySignature" ADD CONSTRAINT "JobDeliverySignature_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobDeliverySignature" ADD CONSTRAINT "JobDeliverySignature_releaseApprovalId_fkey" FOREIGN KEY ("releaseApprovalId") REFERENCES "JobReleaseApproval"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobReleaseApproval" ADD CONSTRAINT "JobReleaseApproval_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobReleaseApproval" ADD CONSTRAINT "JobReleaseApproval_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

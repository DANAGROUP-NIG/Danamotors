-- Job card revamp phase 8: Billing. Additive.

-- How the advisor told the customer the vehicle is ready (no SMS gateway: SMS records that one was sent).
CREATE TYPE "ReadyNoticeChannel" AS ENUM ('PHONE_CALL', 'SMS');

CREATE TABLE "CustomerContact" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "channel" "ReadyNoticeChannel" NOT NULL,
    "phone" TEXT,
    "note" TEXT,
    "contactedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contactedById" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,

    CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomerContact_jobCardId_contactedAt_idx" ON "CustomerContact"("jobCardId", "contactedAt");
CREATE UNIQUE INDEX "CustomerContact_jobCardId_requestId_key" ON "CustomerContact"("jobCardId", "requestId");
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_contactedById_fkey" FOREIGN KEY ("contactedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Terms clause 3: storage after the free period, per branch.
ALTER TABLE "BranchSettings" ADD COLUMN "storageDailyRate" DECIMAL(18,2) NOT NULL DEFAULT 2000,
ADD COLUMN "storageFreeHours" INTEGER NOT NULL DEFAULT 48;

-- A repeated "Create invoice" request returns the bill it already made.
ALTER TABLE "Invoice" ADD COLUMN "requestId" TEXT;
CREATE UNIQUE INDEX "Invoice_requestId_key" ON "Invoice"("requestId");

-- When credit was approved; the vehicle washed tick.
ALTER TABLE "JobCard" ADD COLUMN "creditApprovedAt" TIMESTAMP(3),
ADD COLUMN "vehicleWashedAt" TIMESTAMP(3),
ADD COLUMN "vehicleWashedById" TEXT;
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_vehicleWashedById_fkey" FOREIGN KEY ("vehicleWashedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing credit approvals: the time of their JOB_CREDIT_APPROVED audit entry, else the job's last update.
UPDATE "JobCard" j
SET "creditApprovedAt" = COALESCE(
  (SELECT a."createdAt" FROM "AuditLog" a
   WHERE a."action" = 'JOB_CREDIT_APPROVED'
     AND a."details" LIKE '%' || j."id" || '%'
   ORDER BY a."createdAt" DESC LIMIT 1),
  j."updatedAt")
WHERE j."creditApprovedById" IS NOT NULL AND j."creditApprovedAt" IS NULL;

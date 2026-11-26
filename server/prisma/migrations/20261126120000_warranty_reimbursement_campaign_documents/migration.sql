-- Warranty dry-run corrections (additive only).
-- 1. A settled warranty case records the manufacturer's reimbursement separately, so the
--    case can be closed while the credit note or payment is still pending.
DO $$ BEGIN
  CREATE TYPE "WarrantyReimbursementStatus" AS ENUM ('PENDING', 'RECEIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "WarrantyCase" ADD COLUMN IF NOT EXISTS "reimbursementStatus" "WarrantyReimbursementStatus";
ALTER TABLE "WarrantyCase" ADD COLUMN IF NOT EXISTS "reimbursedAmount" DOUBLE PRECISION;
ALTER TABLE "WarrantyCase" ADD COLUMN IF NOT EXISTS "reimbursedAt" TIMESTAMP(3);

-- Cases settled before this change always carried a credit note or payment reference,
-- so their reimbursement was already received.
UPDATE "WarrantyCase"
SET "reimbursementStatus" = 'RECEIVED',
    "reimbursedAmount" = "settledAmount",
    "reimbursedAt" = "settledAt"
WHERE "reimbursementStatus" IS NULL
  AND "settledAt" IS NOT NULL
  AND "settlementRef" IS NOT NULL;

-- 2. Campaign manuals and bulletins.
CREATE TABLE IF NOT EXISTS "CampaignDocument" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "fileName" VARCHAR(200) NOT NULL,
    "contentType" VARCHAR(100) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignDocument_campaignId_sha256_key" ON "CampaignDocument"("campaignId", "sha256");
CREATE INDEX IF NOT EXISTS "CampaignDocument_campaignId_createdAt_idx" ON "CampaignDocument"("campaignId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "CampaignDocument" ADD CONSTRAINT "CampaignDocument_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "CampaignDocument" ADD CONSTRAINT "CampaignDocument_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

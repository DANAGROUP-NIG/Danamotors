-- Finance → Mobis pricing (doc/mobis-pricing.md).
-- The Mobis conversion rate (₦ per US$) and dealer factor become Finance settings, set by Finance only
-- (mobispricing:manage). Before this the store typed the rate on each MIT (legacy did the same; CPD MITs
-- went 153 in 2011 → 2700 since Aug 2024). PartPriceAdjustment records each price run: a Mobis price
-- bulletin, or a revaluation when the rate goes up. Idempotent where data is seeded.

-- CreateEnum
CREATE TYPE "PartPriceAdjustmentKind" AS ENUM ('BULLETIN', 'RATE_CHANGE');

-- AlterTable
ALTER TABLE "PartRateHistory" ADD COLUMN     "adjustmentId" TEXT;

-- CreateTable
CREATE TABLE "PartPriceAdjustment" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "kind" "PartPriceAdjustmentKind" NOT NULL,
    "reference" TEXT NOT NULL,
    "sourceFileName" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "conversionRate" DOUBLE PRECISION NOT NULL,
    "dealerFactor" DOUBLE PRECISION,
    "previousRate" DOUBLE PRECISION,
    "linesInFile" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL,
    "notHigherCount" INTEGER NOT NULL DEFAULT 0,
    "notFoundCount" INTEGER NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "appliedById" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartPriceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartPriceAdjustment_number_key" ON "PartPriceAdjustment"("number");

-- CreateIndex
CREATE INDEX "PartPriceAdjustment_appliedAt_idx" ON "PartPriceAdjustment"("appliedAt");

-- CreateIndex
CREATE INDEX "PartRateHistory_adjustmentId_idx" ON "PartRateHistory"("adjustmentId");

-- AddForeignKey
ALTER TABLE "PartRateHistory" ADD CONSTRAINT "PartRateHistory_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "PartPriceAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartPriceAdjustment" ADD CONSTRAINT "PartPriceAdjustment_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Current values: 2700 on every CPD MIT since Aug 2024; 0.616 = the factor in the DateManager price tool
-- (dealer rate = list x 2700 x 0.616 = list x ₦1,663.20). Finance can change both.
INSERT INTO "FinanceSetting" ("key", "value", "updatedAt")
VALUES ('mobisPricing', '{"conversionRate": 2700, "dealerFactor": 0.616}'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Finance owns the rate and part price runs: Accountant (SuperAdmin has every permission).
INSERT INTO "Permission" ("id", "name", "description", "createdAt")
VALUES (gen_random_uuid()::text, 'mobispricing:manage', 'Set the Mobis conversion rate and dealer factor, and apply Mobis price bulletins to part rates', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id FROM "Role" r JOIN "Permission" p ON p.name = 'mobispricing:manage'
WHERE r.name IN ('SuperAdmin', 'Accountant')
ON CONFLICT DO NOTHING;

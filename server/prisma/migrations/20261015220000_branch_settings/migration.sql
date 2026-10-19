-- Legacy Control screen values that each legacy database set for its own location: labour VAT,
-- bill round-off, repeat-job window, booking horizon and the workshop information tab.
CREATE TABLE IF NOT EXISTS "BranchSettings" (
  "branchId" TEXT NOT NULL,
  "labourVatPercent" DOUBLE PRECISION NOT NULL DEFAULT 7.5,
  "roundOffValue" INTEGER NOT NULL DEFAULT 10,
  "repeatWindowDays" INTEGER NOT NULL DEFAULT 30,
  "repeatWindowKm" INTEGER DEFAULT 1500,
  "bookingMaxDays" INTEGER NOT NULL DEFAULT 30,
  "shifts" INTEGER NOT NULL DEFAULT 1,
  "workStartTime" TEXT NOT NULL DEFAULT '07:30',
  "workingHours" DOUBLE PRECISION NOT NULL DEFAULT 10,
  "weeklyHoliday" TEXT,
  "vorOrderDays" INTEGER NOT NULL DEFAULT 7,
  "reorderMonths" INTEGER NOT NULL DEFAULT 3,
  "courtLocation" TEXT,
  "reminderLetterDesignation" TEXT,
  "signatories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BranchSettings_pkey" PRIMARY KEY ("branchId"),
  CONSTRAINT "BranchSettings_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BranchSettings_values_check" CHECK (
    "labourVatPercent" BETWEEN 0 AND 100 AND "roundOffValue" BETWEEN 1 AND 1000
    AND "repeatWindowDays" BETWEEN 1 AND 3650 AND ("repeatWindowKm" IS NULL OR "repeatWindowKm" BETWEEN 1 AND 1000000)
    AND "bookingMaxDays" BETWEEN 1 AND 3650 AND "shifts" BETWEEN 1 AND 5
    AND "workingHours" > 0 AND "workingHours" <= 24 AND "vorOrderDays" BETWEEN 0 AND 365 AND "reorderMonths" BETWEEN 1 AND 60)
);

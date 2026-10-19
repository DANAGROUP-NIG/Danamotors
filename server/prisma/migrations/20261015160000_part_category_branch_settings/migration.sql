-- Legacy Part Category Master percentages, kept per branch because each legacy database had its own.
CREATE TABLE IF NOT EXISTS "PartCategoryBranchSetting" (
  "categoryCode" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "handlingPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "directCostPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "operationalCostPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartCategoryBranchSetting_pkey" PRIMARY KEY ("categoryCode", "branchId"),
  CONSTRAINT "PartCategoryBranchSetting_categoryCode_fkey" FOREIGN KEY ("categoryCode") REFERENCES "PartCategory"("code") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PartCategoryBranchSetting_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PartCategoryBranchSetting_percent_check" CHECK (
    "discountPercent" BETWEEN 0 AND 100 AND "handlingPercent" BETWEEN 0 AND 100
    AND "directCostPercent" BETWEEN 0 AND 100 AND "operationalCostPercent" BETWEEN 0 AND 100)
);
CREATE INDEX IF NOT EXISTS "PartCategoryBranchSetting_branchId_idx" ON "PartCategoryBranchSetting"("branchId");

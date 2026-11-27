-- Workshop board (job card revamp phase 10): per-branch step time targets in minutes. Additive, no data conversion.
ALTER TABLE "BranchSettings" ADD COLUMN     "stageTargetCheckInMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "stageTargetDiagnosisMinutes" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "stageTargetEstimateMinutes" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "stageTargetQualityCheckMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "stageTargetWarrantyMinutes" INTEGER NOT NULL DEFAULT 120;

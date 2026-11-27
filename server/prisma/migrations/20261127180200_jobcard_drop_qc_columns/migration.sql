-- Job card revamp phase 7: drop the QC columns that inspection rows replaced
-- (20261127180000_jobcard_quality_check converted their data). Kept separate so a shared database
-- can hold the drop while other branches still read the old columns.
ALTER TABLE "Inspection" DROP COLUMN "findings", DROP COLUMN "passed", DROP COLUMN "status";
ALTER TABLE "JobCard" DROP COLUMN "qcStatus", DROP COLUMN "qcNotes";

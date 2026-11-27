-- Job card revamp phase 7: a shared database where another branch restored the old free-form
-- Inspection columns (20261127130000_repair_job_card_inspection_columns) has "findings" required
-- with no default, while the quality check no longer writes it. An empty default keeps both working.
-- Does nothing where the column was dropped (20261127180200).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'Inspection' AND column_name = 'findings'
  ) THEN
    ALTER TABLE "Inspection" ALTER COLUMN "findings" SET DEFAULT '';
  END IF;
END $$;

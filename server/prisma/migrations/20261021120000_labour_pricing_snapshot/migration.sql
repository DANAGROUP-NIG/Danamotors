-- Additive: historical labour keeps its existing stored hours/rate/amount.
BEGIN;
ALTER TABLE "JobCardLabour" ADD COLUMN IF NOT EXISTS "pricing" TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobCardLabour_pricing_check' AND conrelid = '"JobCardLabour"'::regclass) THEN
    ALTER TABLE "JobCardLabour" ADD CONSTRAINT "JobCardLabour_pricing_check"
      CHECK ("pricing" IS NULL OR "pricing" IN ('TIME', 'FIXED'));
  END IF;
END $$;
COMMIT;

-- Legacy servicedetail: hours required, due mileage / days and their tolerance, checklist to be followed.
ALTER TABLE "ServiceTypeModelSetting" ADD COLUMN IF NOT EXISTS "hoursRequired" DOUBLE PRECISION;
ALTER TABLE "ServiceTypeModelSetting" ADD COLUMN IF NOT EXISTS "mileageLimit" INTEGER;
ALTER TABLE "ServiceTypeModelSetting" ADD COLUMN IF NOT EXISTS "daysLimit" INTEGER;
ALTER TABLE "ServiceTypeModelSetting" ADD COLUMN IF NOT EXISTS "mileageVariation" INTEGER;
ALTER TABLE "ServiceTypeModelSetting" ADD COLUMN IF NOT EXISTS "daysVariation" INTEGER;
ALTER TABLE "ServiceTypeModelSetting" ADD COLUMN IF NOT EXISTS "checklistFollowed" BOOLEAN NOT NULL DEFAULT false;

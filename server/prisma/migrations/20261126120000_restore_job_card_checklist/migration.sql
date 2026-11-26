-- Repair databases that recorded job_opening_details without retaining this column.
ALTER TABLE "JobCard" ADD COLUMN IF NOT EXISTS "checklist" TEXT;

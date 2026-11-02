-- Some installations have AppointmentRequest from an earlier schema while the
-- creating migration is already recorded as applied. Repair forward without
-- rewriting migration history or changing existing request data.
ALTER TABLE "AppointmentRequest"
  ADD COLUMN IF NOT EXISTS "defectCode" TEXT;

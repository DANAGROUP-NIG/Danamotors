-- Separate appointment-to-job opening consent from estimate signatures.
-- Existing jobs have no invented historical consent.
ALTER TABLE "JobCard" ADD COLUMN "openingConsent" JSONB;

ALTER TABLE "JobCard" ADD COLUMN IF NOT EXISTS "serviceId" TEXT;

CREATE INDEX IF NOT EXISTS "JobCard_serviceId_idx" ON "JobCard"("serviceId");

DO $$ BEGIN
  ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
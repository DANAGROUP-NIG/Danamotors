-- Legacy joblabordetail.mechanic: the employee who did a labour line. The existing technician
-- (a login user) stays; lines whose technician login belongs to an employee get that employee.
ALTER TABLE "JobCardLabour" ADD COLUMN IF NOT EXISTS "mechanicId" TEXT;
DO $$ BEGIN
  ALTER TABLE "JobCardLabour" ADD CONSTRAINT "JobCardLabour_mechanicId_fkey" FOREIGN KEY ("mechanicId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "JobCardLabour_mechanicId_idx" ON "JobCardLabour"("mechanicId");
UPDATE "JobCardLabour" l SET "mechanicId" = e.id
FROM "Employee" e
WHERE e."userId" = l."technicianId" AND l."mechanicId" IS NULL;

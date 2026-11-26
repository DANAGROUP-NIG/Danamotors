-- Job card revamp phase 3: retire JobCard.observations and JobCard.assignedTo.
-- Findings (JobFinding, added by 20261126125423_jobcard_diagnosis) replace the free-text observations;
-- the assignment text was never shown on the staged job card. Safe to run on a database where the
-- columns are already gone. Kept apart from the additive migration so a shared database can keep the
-- columns while other branches still read them (decision 26 Nov 2026).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'JobCard' AND column_name = 'observations') THEN
    -- Each job's observations become one finding the customer did not mention. The author is the
    -- person most likely to have written it: technician, engineer, advisor, creator.
    EXECUTE $sql$
      INSERT INTO "JobFinding" ("id", "jobCardId", "complaintId", "causeAndDefect", "possibleWarranty", "version", "createdById", "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, j."id", NULL, btrim(j."observations"), false, 1,
             COALESCE(j."technicianId", j."engineerId", j."serviceAdvisorId", j."createdById",
                      (SELECT u."id" FROM "User" u ORDER BY u."createdAt" ASC, u."id" ASC LIMIT 1)),
             j."updatedAt", j."updatedAt"
      FROM "JobCard" j
      WHERE btrim(COALESCE(j."observations", '')) <> ''
        AND COALESCE(j."technicianId", j."engineerId", j."serviceAdvisorId", j."createdById",
                     (SELECT u."id" FROM "User" u ORDER BY u."createdAt" ASC, u."id" ASC LIMIT 1)) IS NOT NULL
    $sql$;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'JobCard' AND column_name = 'assignedTo') THEN
    -- The old assignment text is kept in the internal remarks.
    EXECUTE $sql$
      UPDATE "JobCard"
      SET "remarks" = CASE
          WHEN btrim(COALESCE("remarks", '')) = '' THEN 'Assigned to (old record): ' || btrim("assignedTo")
          ELSE "remarks" || E'\n' || 'Assigned to (old record): ' || btrim("assignedTo")
        END
      WHERE btrim(COALESCE("assignedTo", '')) <> ''
    $sql$;
  END IF;
END $$;

-- JobCard has deferred constraint triggers; run them now so the columns can be dropped in this transaction.
SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE "JobCard" DROP COLUMN IF EXISTS "assignedTo",
DROP COLUMN IF EXISTS "observations";

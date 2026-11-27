-- Job card revamp phase 5: the staged estimate replaces the indicative opening estimate totals on
-- JobCard for service jobs, and PDI works its totals out from the JobComplaint amounts. Nothing reads
-- these columns any more. Kept separate from 20261127090000 so a shared database can take the
-- conversions first and drop the columns once no other branch reads them. Safe to run again.
ALTER TABLE "JobCard"
  DROP COLUMN IF EXISTS "estimatedParts",
  DROP COLUMN IF EXISTS "estimatedOil",
  DROP COLUMN IF EXISTS "estimatedLabour",
  DROP COLUMN IF EXISTS "estimatedCost";

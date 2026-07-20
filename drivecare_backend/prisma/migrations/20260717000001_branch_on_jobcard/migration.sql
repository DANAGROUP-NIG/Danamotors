-- Drop CustomerBranch table
DROP TABLE IF EXISTS "public"."CustomerBranch";

-- Remove branchId from Customer (if it exists)
ALTER TABLE "public"."Customer" DROP COLUMN IF EXISTS "branchId";

-- Add branchId to ServiceAppointment
ALTER TABLE "public"."ServiceAppointment" ADD COLUMN "branchId" TEXT NOT NULL;

-- Add branchId to JobCard
ALTER TABLE "public"."JobCard" ADD COLUMN "branchId" TEXT NOT NULL;

-- AddForeignKey for ServiceAppointment → Branch
ALTER TABLE "public"."ServiceAppointment" ADD CONSTRAINT "ServiceAppointment_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey for JobCard → Branch
ALTER TABLE "public"."JobCard" ADD CONSTRAINT "JobCard_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

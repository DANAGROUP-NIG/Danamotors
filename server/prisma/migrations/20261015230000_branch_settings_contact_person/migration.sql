-- Legacy Workshop Information "Contact Person" (control1.contactperson), set at Abuja.
ALTER TABLE "BranchSettings" ADD COLUMN IF NOT EXISTS "contactPerson" TEXT;

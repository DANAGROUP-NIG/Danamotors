-- Legacy Customer/Vendor profile fields: segment, district, company type, vendor purchase source and
-- MRN rate type, government / own company vehicle, credit limit and the parent organization.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "segment" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "district" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "companyType" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "vendorType" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "mrnRateType" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "governmentVehicle" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "ownCompanyVehicle" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "creditLimit" DOUBLE PRECISION;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
DO $$ BEGIN
  ALTER TABLE "Customer" ADD CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "Customer_organizationId_idx" ON "Customer"("organizationId");
DO $$ BEGIN
  ALTER TABLE "Customer" ADD CONSTRAINT "Customer_mrnRateType_check" CHECK ("mrnRateType" IS NULL OR "mrnRateType" IN ('D', 'R'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

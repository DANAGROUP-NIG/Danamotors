-- Legacy vehiclemaster: colour type, where the vehicle is parked, sale / purchase / WCO / principal
-- invoice details, theft, manufacture month / year and the current tyres and battery.
DO $$ BEGIN
  CREATE TYPE "VehicleParkedAt" AS ENUM ('SHOWROOM', 'STOCKYARD', 'SOLD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "colourType" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "parkedAt" "VehicleParkedAt";
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "purchaseAmount" DOUBLE PRECISION;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "saleInvoiceNumber" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "saleInvoiceDate" TIMESTAMP(3);
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "saleAmount" DOUBLE PRECISION;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "wcoNumber" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "wcoDate" TIMESTAMP(3);
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "principalInvoiceNumber" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "principalInvoiceDate" TIMESTAMP(3);
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "theft" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "manufactureMonth" INTEGER;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "manufactureYear" INTEGER;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "tyres" JSONB;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "batteryMake" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "batteryNumber" TEXT;

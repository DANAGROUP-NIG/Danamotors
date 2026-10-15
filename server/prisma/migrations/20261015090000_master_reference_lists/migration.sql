-- Legacy simple masters (vehicle system/group, designation, geography, salutation,
-- segment, UOM, tax category/form, colour type) share WorkshopMaster. Short
-- descriptions and per-kind extra fields come from the legacy screens.
ALTER TABLE "WorkshopMaster" ADD COLUMN IF NOT EXISTS "shortDescription" TEXT;
ALTER TABLE "WorkshopMaster" ADD COLUMN IF NOT EXISTS "attributes" JSONB;

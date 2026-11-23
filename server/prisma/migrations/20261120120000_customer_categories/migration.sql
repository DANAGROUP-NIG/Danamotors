BEGIN;
LOCK TABLE "Customer" IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE "_CustomerCategoryBackup142" AS
SELECT id, type, "partyStatus", "ownCompanyVehicle"
FROM "Customer"
WHERE UPPER(type) IN ('VENDOR', 'C', 'I', 'G', 'F', 'FLEET')
   OR "ownCompanyVehicle" IS DISTINCT FROM (type = 'IN_HOUSE' AND "partyStatus" <> 'VENDOR');

UPDATE "Customer"
SET "partyStatus" = CASE WHEN UPPER(type) = 'VENDOR' THEN 'VENDOR' ELSE "partyStatus" END,
    type = CASE
      WHEN UPPER(type) = 'VENDOR' THEN 'OTHERS'
      WHEN "ownCompanyVehicle" AND "partyStatus" <> 'VENDOR' THEN 'IN_HOUSE'
      WHEN UPPER(type) IN ('C', 'F', 'FLEET') THEN 'CORPORATE'
      WHEN UPPER(type) = 'I' THEN 'INDIVIDUAL'
      WHEN UPPER(type) = 'G' THEN 'GOVERNMENT'
      ELSE type
    END
WHERE id IN (SELECT id FROM "_CustomerCategoryBackup142");

CREATE FUNCTION sync_customer_company_vehicle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."ownCompanyVehicle" := NEW.type = 'IN_HOUSE' AND NEW."partyStatus" <> 'VENDOR';
  RETURN NEW;
END;
$$;

CREATE TRIGGER customer_company_vehicle_from_category
BEFORE INSERT OR UPDATE OF type, "partyStatus", "ownCompanyVehicle" ON "Customer"
FOR EACH ROW EXECUTE FUNCTION sync_customer_company_vehicle();

UPDATE "Customer" SET "ownCompanyVehicle" = (type = 'IN_HOUSE' AND "partyStatus" <> 'VENDOR')
WHERE "ownCompanyVehicle" IS DISTINCT FROM (type = 'IN_HOUSE' AND "partyStatus" <> 'VENDOR');

COMMIT;

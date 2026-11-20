-- Run only during a cutover rollback before writes have resumed.
BEGIN;

DROP TRIGGER customer_company_vehicle_from_category ON "Customer";
DROP FUNCTION sync_customer_company_vehicle();

UPDATE "Customer" AS customer
SET type = backup.type,
    "partyStatus" = backup."partyStatus",
    "ownCompanyVehicle" = backup."ownCompanyVehicle"
FROM "_CustomerCategoryBackup142" AS backup
WHERE customer.id = backup.id;

DROP TABLE "_CustomerCategoryBackup142";
COMMIT;

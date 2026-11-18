-- Legacy partmast has one text field, partdesc ("name" here), and no location: legacy keeps the bin per
-- store (PARTBAL.location / bincard), which is InventoryStock.rackLocation / binCard. Nothing reads these.
ALTER TABLE "SparePart" DROP COLUMN "description",
DROP COLUMN "binLocation",
DROP COLUMN "storeLocation";

-- Bin history without a branch recorded changes to the Part Master bin dropped above. Legacy
-- PartBinHistory always has a store, so a bin change now always belongs to a branch.
DELETE FROM "PartBinHistory" WHERE "branchId" IS NULL;
ALTER TABLE "PartBinHistory" ALTER COLUMN "branchId" SET NOT NULL;

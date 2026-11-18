-- The free-text part category (Engine, Brakes…) has no legacy counterpart and nothing reads it.
-- The legacy Part Category is "priceCategoryCode" (partmast.partcategory), which stays.
ALTER TABLE "SparePart" DROP COLUMN "category";

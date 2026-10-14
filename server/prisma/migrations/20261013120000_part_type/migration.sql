-- Legacy partmast.parttype: S spare part, O oil, A accessory.
ALTER TABLE "SparePart" ADD COLUMN "partType" TEXT NOT NULL DEFAULT 'S';

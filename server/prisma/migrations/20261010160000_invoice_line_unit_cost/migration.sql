-- Dealer rate on counter-sale bill lines at the time of billing (counter sale revenue report).
ALTER TABLE "InvoiceLine" ADD COLUMN "unitCost" DOUBLE PRECISION;
-- Earlier counter-sale lines take the part's current dealer rate as the best available cost.
UPDATE "InvoiceLine" l SET "unitCost" = p."unitPrice"
FROM "SparePart" p
WHERE p.id = l."partId" AND l."customerOrderLineId" IS NOT NULL AND l."unitCost" IS NULL;

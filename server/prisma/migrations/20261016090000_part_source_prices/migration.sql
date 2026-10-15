-- Part sources: each source (part flag O, A, F, L and new U used, R repaired) has its own price.
CREATE TABLE "SparePartSourcePrice" (
    "id" TEXT NOT NULL,
    "sparePartId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "retailRate" DOUBLE PRECISION NOT NULL,
    "dealerRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SparePartSourcePrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SparePartSourcePrice_sparePartId_source_key" ON "SparePartSourcePrice"("sparePartId", "source");

ALTER TABLE "SparePartSourcePrice" ADD CONSTRAINT "SparePartSourcePrice_sparePartId_fkey" FOREIGN KEY ("sparePartId") REFERENCES "SparePart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EstimateLine" ADD COLUMN "partSource" TEXT;
ALTER TABLE "PartIssuance" ADD COLUMN "partSource" TEXT;
ALTER TABLE "JobCardLine" ADD COLUMN "partSource" TEXT;

-- Existing part lines were priced from the part's own source.
UPDATE "EstimateLine" l SET "partSource" = p."partFlag"
FROM "SparePart" p WHERE l."referenceId" = p."id" AND l."type" IN ('PART', 'INCLUDED_PART');
UPDATE "PartIssuance" i SET "partSource" = p."partFlag" FROM "SparePart" p WHERE i."sparePartId" = p."id";
UPDATE "JobCardLine" l SET "partSource" = p."partFlag"
FROM "SparePart" p WHERE l."sparePartId" = p."id" AND l."kind" = 'PART';

ALTER TABLE "InvoiceLine" ADD COLUMN "partSource" TEXT;

-- Legacy FullpartList: the Mobis catalogue behind Part Query's "not in Part Master" lookup.
CREATE TABLE "PartCatalogueItem" (
    "partNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "partFlag" TEXT NOT NULL DEFAULT 'O',
    "partType" TEXT NOT NULL DEFAULT 'S',
    "uom" TEXT NOT NULL DEFAULT 'UNIT',
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "priceCategoryCode" TEXT,
    "dealerRate" DOUBLE PRECISION NOT NULL,
    "retailRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartCatalogueItem_pkey" PRIMARY KEY ("partNumber")
);

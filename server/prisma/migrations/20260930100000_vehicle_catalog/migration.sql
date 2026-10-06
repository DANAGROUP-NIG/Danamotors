BEGIN;
-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "customMake" TEXT,
ADD COLUMN     "customModel" TEXT,
ADD COLUMN     "engineId" TEXT,
ADD COLUMN     "generationId" TEXT,
ADD COLUMN     "modelId" TEXT;

-- CreateTable
CREATE TABLE "VehicleCatalogMake" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VehicleCatalogMake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleCatalogModel" (
    "id" TEXT NOT NULL,
    "makeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "searchName" TEXT NOT NULL,
    "aliases" TEXT[],
    "yearStart" INTEGER NOT NULL,
    "yearEnd" INTEGER,

    CONSTRAINT "VehicleCatalogModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleCatalogGeneration" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "yearStart" INTEGER NOT NULL,
    "yearEnd" INTEGER,
    "bodyType" TEXT,
    "sourceOrdinal" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VehicleCatalogGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleCatalogEngine" (
    "id" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sourceOrdinal" INTEGER NOT NULL DEFAULT 0,
    "fuelType" TEXT,
    "cylinders" INTEGER,
    "displacementCc" INTEGER,
    "powerHp" DOUBLE PRECISION,
    "torqueNm" DOUBLE PRECISION,
    "transmission" TEXT,
    "drivetrain" TEXT,
    "zeroToHundredKmhS" DOUBLE PRECISION,
    "topSpeedKmh" DOUBLE PRECISION,
    "fuelEconomyCombinedL100" DOUBLE PRECISION,
    "lengthMm" INTEGER,
    "widthMm" INTEGER,
    "heightMm" INTEGER,
    "wheelbaseMm" INTEGER,
    "curbWeightKg" INTEGER,
    "specs" JSONB NOT NULL,

    CONSTRAINT "VehicleCatalogEngine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VehicleCatalogMake_name_key" ON "VehicleCatalogMake"("name");

-- CreateIndex
CREATE INDEX "VehicleCatalogModel_makeId_searchName_idx" ON "VehicleCatalogModel"("makeId", "searchName");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleCatalogModel_makeId_name_key" ON "VehicleCatalogModel"("makeId", "name");

-- CreateIndex
CREATE INDEX "VehicleCatalogGeneration_modelId_idx" ON "VehicleCatalogGeneration"("modelId");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleCatalogGeneration_modelId_name_yearStart_sourceOrdin_key" ON "VehicleCatalogGeneration"("modelId", "name", "yearStart", "sourceOrdinal");

-- CreateIndex
CREATE INDEX "VehicleCatalogEngine_generationId_idx" ON "VehicleCatalogEngine"("generationId");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleCatalogEngine_generationId_label_sourceOrdinal_key" ON "VehicleCatalogEngine"("generationId", "label", "sourceOrdinal");

-- CreateIndex
CREATE INDEX "Vehicle_modelId_idx" ON "Vehicle"("modelId");

-- CreateIndex
CREATE INDEX "Vehicle_generationId_idx" ON "Vehicle"("generationId");

-- CreateIndex
CREATE INDEX "Vehicle_engineId_idx" ON "Vehicle"("engineId");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "VehicleCatalogModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "VehicleCatalogGeneration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_engineId_fkey" FOREIGN KEY ("engineId") REFERENCES "VehicleCatalogEngine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleCatalogModel" ADD CONSTRAINT "VehicleCatalogModel_makeId_fkey" FOREIGN KEY ("makeId") REFERENCES "VehicleCatalogMake"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleCatalogGeneration" ADD CONSTRAINT "VehicleCatalogGeneration_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "VehicleCatalogModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleCatalogEngine" ADD CONSTRAINT "VehicleCatalogEngine_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "VehicleCatalogGeneration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Keep every existing vehicle valid without overwriting its original display fields.
UPDATE "Vehicle" SET "customMake" = NULLIF(btrim("make"), ''),
  "customModel" = COALESCE(NULLIF(btrim("model"), ''), 'Unspecified (legacy)')
WHERE "modelId" IS NULL AND NULLIF(btrim("customModel"), '') IS NULL;
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_model_identity_check"
  CHECK ("modelId" IS NOT NULL OR NULLIF(btrim("customModel"), '') IS NOT NULL);
COMMIT;

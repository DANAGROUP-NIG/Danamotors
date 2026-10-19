-- Legacy trouble: per-model part / oil / labour estimate for a defect (COMPLAINT master).
CREATE TABLE IF NOT EXISTS "DefectModelEstimate" (
  "id" TEXT NOT NULL,
  "defectId" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "partAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "oilAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "labourAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DefectModelEstimate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DefectModelEstimate_defectId_fkey" FOREIGN KEY ("defectId") REFERENCES "WorkshopMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DefectModelEstimate_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DefectModelEstimate_amount_check" CHECK (
    "partAmount" >= 0 AND "partAmount" <= 1e12 AND "oilAmount" >= 0 AND "oilAmount" <= 1e12
    AND "labourAmount" >= 0 AND "labourAmount" <= 1e12)
);
CREATE UNIQUE INDEX IF NOT EXISTS "DefectModelEstimate_defectId_modelId_key" ON "DefectModelEstimate"("defectId", "modelId");
CREATE INDEX IF NOT EXISTS "DefectModelEstimate_modelId_idx" ON "DefectModelEstimate"("modelId");

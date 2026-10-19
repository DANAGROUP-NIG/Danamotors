-- Legacy service checklists. The checklist (ChecklistMaster) is a CHECKLIST WorkshopMaster;
-- its part / labour lines per model and variant (ChecklistDefinitionMaster) and the
-- mileage-wise checklist to follow (MileageChecklistDefinition) get their own tables.
DO $$ BEGIN
  CREATE TYPE "ChecklistLineKind" AS ENUM ('PART', 'LABOUR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ServiceChecklistLine" (
  "id" TEXT NOT NULL,
  "checklistId" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "variantId" TEXT,
  "kind" "ChecklistLineKind" NOT NULL,
  "sparePartId" TEXT,
  "labourItemId" TEXT,
  "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceChecklistLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceChecklistLine_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "WorkshopMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ServiceChecklistLine_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ServiceChecklistLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ServiceChecklistLine_sparePartId_fkey" FOREIGN KEY ("sparePartId") REFERENCES "SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ServiceChecklistLine_labourItemId_fkey" FOREIGN KEY ("labourItemId") REFERENCES "LabourItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ServiceChecklistLine_item_check" CHECK (
    ("kind" = 'PART' AND "sparePartId" IS NOT NULL AND "labourItemId" IS NULL)
    OR ("kind" = 'LABOUR' AND "labourItemId" IS NOT NULL AND "sparePartId" IS NULL)),
  CONSTRAINT "ServiceChecklistLine_amount_check" CHECK (
    "quantity" > 0 AND "quantity" <= 1e6 AND "amount" >= 0 AND "amount" <= 1e12)
);
CREATE INDEX IF NOT EXISTS "ServiceChecklistLine_checklistId_modelId_variantId_idx" ON "ServiceChecklistLine"("checklistId", "modelId", "variantId");
CREATE INDEX IF NOT EXISTS "ServiceChecklistLine_sparePartId_idx" ON "ServiceChecklistLine"("sparePartId");
CREATE INDEX IF NOT EXISTS "ServiceChecklistLine_labourItemId_idx" ON "ServiceChecklistLine"("labourItemId");
-- One line per item for a checklist, model and variant (null variant = all variants).
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceChecklistLine_item_key" ON "ServiceChecklistLine"
  ("checklistId", "modelId", COALESCE("variantId", ''), COALESCE("sparePartId", ''), COALESCE("labourItemId", ''));

CREATE TABLE IF NOT EXISTS "ServiceChecklistMileage" (
  "id" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "variantId" TEXT,
  "mileage" INTEGER NOT NULL,
  "checklistId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceChecklistMileage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceChecklistMileage_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ServiceChecklistMileage_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ServiceChecklistMileage_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ServiceChecklistMileage_mileage_check" CHECK ("mileage" > 0 AND "mileage" <= 10000000)
);
CREATE INDEX IF NOT EXISTS "ServiceChecklistMileage_modelId_variantId_mileage_idx" ON "ServiceChecklistMileage"("modelId", "variantId", "mileage");
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceChecklistMileage_key" ON "ServiceChecklistMileage"
  ("modelId", COALESCE("variantId", ''), "mileage");

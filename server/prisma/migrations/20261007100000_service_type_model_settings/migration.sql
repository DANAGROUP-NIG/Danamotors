BEGIN;
ALTER TABLE "WorkshopMaster" ADD COLUMN "displayOrder" INTEGER,
  ADD COLUMN "preDelivery" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ServiceTypeModelSetting" (
  "id" TEXT NOT NULL,
  "serviceTypeId" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "serviceCharge" DOUBLE PRECISION NOT NULL,
  "previousCharge" DOUBLE PRECISION,
  "effectiveFrom" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "ServiceTypeModelSetting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceTypeModelSetting_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ServiceTypeModelSetting_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ServiceTypeModelSetting_charge_check" CHECK (
    "serviceCharge" >= 0 AND "serviceCharge" <= 1e12
    AND ("previousCharge" IS NULL OR ("previousCharge" >= 0 AND "previousCharge" <= 1e12))
  )
);
CREATE UNIQUE INDEX "ServiceTypeModelSetting_serviceTypeId_modelId_key" ON "ServiceTypeModelSetting"("serviceTypeId", "modelId");
CREATE INDEX "ServiceTypeModelSetting_modelId_active_serviceTypeId_idx" ON "ServiceTypeModelSetting"("modelId", "active", "serviceTypeId");
COMMIT;

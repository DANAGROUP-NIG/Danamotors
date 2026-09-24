-- CreateIndex
CREATE INDEX "SparePart_mainPartId_idx" ON "SparePart"("mainPartId");

ALTER TABLE "SparePart"
ADD CONSTRAINT alternate_requires_main
CHECK (
  (role = 'MAIN' AND "mainPartId" IS NULL) OR
  (role = 'ALTERNATE' AND "mainPartId" IS NOT NULL)
);
-- Picked CPO units already confirmed by a posted handheld pick: they are not sent to a handheld again.
ALTER TABLE "CustomerOrderLine" ADD COLUMN "handheldCheckedQuantity" INTEGER NOT NULL DEFAULT 0;

-- Lines whose latest handheld pick is posted: everything still picked was checked then.
UPDATE "CustomerOrderLine" l
SET "handheldCheckedQuantity" = l."pickedQuantity"
WHERE l."pickedQuantity" > 0
  AND EXISTS (
    SELECT 1 FROM "HandheldDocumentLine" dl
    JOIN "HandheldDocument" d ON d.id = dl."documentId"
    WHERE dl."customerOrderLineId" = l.id AND d.status = 'UPLOADED'
  );

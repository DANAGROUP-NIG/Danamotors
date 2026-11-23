ALTER TABLE "Invoice"
  ADD COLUMN "kiaSpareTotal" DECIMAL(18, 2),
  ADD COLUMN "nonKiaSpareTotal" DECIMAL(18, 2),
  ADD CONSTRAINT "Invoice_spare_heads_reconcile" CHECK (
    ("kiaSpareTotal" IS NULL AND "nonKiaSpareTotal" IS NULL)
    OR (
      "kiaSpareTotal" IS NOT NULL AND "nonKiaSpareTotal" IS NOT NULL
      AND "kiaSpareTotal" >= 0 AND "nonKiaSpareTotal" >= 0
      AND "kiaSpareTotal" + "nonKiaSpareTotal" = ROUND("partsTotal"::numeric, 2)
    )
  ) NOT VALID;

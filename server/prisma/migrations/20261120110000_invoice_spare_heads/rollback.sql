ALTER TABLE "Invoice"
  DROP CONSTRAINT "Invoice_spare_heads_reconcile",
  DROP COLUMN "kiaSpareTotal",
  DROP COLUMN "nonKiaSpareTotal";

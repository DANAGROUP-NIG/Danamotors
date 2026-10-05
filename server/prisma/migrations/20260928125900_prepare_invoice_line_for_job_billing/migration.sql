-- Merge of the warranty branch with job billing.
-- On databases where the warranty migration (20260930090000) ran before job billing
-- (20260928130000), "InvoiceLine" already exists in the warranty shape
-- (kind, jobCardLineId, taxable). Job billing then skips CREATE TABLE and adds foreign
-- keys on columns that would not exist. Bring the table up to the job billing shape first.
-- No-op on a fresh database (the table does not exist yet) and on already-converted tables.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'InvoiceLine' AND column_name = 'kind'
  ) THEN
    ALTER TABLE "InvoiceLine" ADD COLUMN IF NOT EXISTS "type" TEXT;
    UPDATE "InvoiceLine" SET "type" = "kind"::text WHERE "type" IS NULL;
    ALTER TABLE "InvoiceLine" ALTER COLUMN "type" SET NOT NULL;

    ALTER TABLE "InvoiceLine" ADD COLUMN IF NOT EXISTS "partId" TEXT;
    ALTER TABLE "InvoiceLine" ADD COLUMN IF NOT EXISTS "jobCardLabourId" TEXT;
    ALTER TABLE "InvoiceLine" ADD COLUMN IF NOT EXISTS "customerPaid" BOOLEAN NOT NULL DEFAULT TRUE;

    -- Job billing inserts do not set the warranty-shape column.
    ALTER TABLE "InvoiceLine" ALTER COLUMN "kind" DROP NOT NULL;

    -- Lines billed by the warranty branch were customer-paid part/labour lines.
    UPDATE "InvoiceLine" il SET "partId" = jcl."sparePartId"
    FROM "JobCardLine" jcl
    WHERE il."jobCardLineId" = jcl."id" AND il."partId" IS NULL AND jcl."sparePartId" IS NOT NULL;
  END IF;
END $$;

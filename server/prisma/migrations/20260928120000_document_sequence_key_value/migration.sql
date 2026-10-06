-- Stock transfers created "DocumentSequence" as ("docType", "year", "lastValue") while job billing
-- expects (key, value). Convert the old shape in place, keeping counters as key = '<docType>_<year>'.
-- No-op when the table is missing or already uses (key, value).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'DocumentSequence' AND column_name = 'docType'
  ) THEN
    ALTER TABLE "DocumentSequence" RENAME TO "DocumentSequence_old";
    ALTER TABLE "DocumentSequence_old" RENAME CONSTRAINT "DocumentSequence_pkey" TO "DocumentSequence_old_pkey";

    CREATE TABLE "DocumentSequence" (
      key TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO "DocumentSequence" (key, value, "updatedAt")
    SELECT "docType" || '_' || "year", "lastValue", "updatedAt"
    FROM "DocumentSequence_old";

    DROP TABLE "DocumentSequence_old";
  END IF;
END $$;

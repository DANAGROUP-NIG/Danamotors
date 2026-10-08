-- Run with application writers stopped. Preserve historical rows before the
-- pending reconciliation/transfer migrations remove tables, rows or columns.
-- Keep existing migration files unchanged, including their recorded checksums.
BEGIN;

CREATE SCHEMA IF NOT EXISTS legacy_archive;
REVOKE ALL ON SCHEMA legacy_archive FROM PUBLIC;

CREATE TABLE IF NOT EXISTS legacy_archive."RecordSnapshot" (
  "migrationKey" TEXT NOT NULL,
  "sourceTable" TEXT NOT NULL,
  "rowHash" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "archivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("migrationKey", "sourceTable", "rowHash")
);

CREATE TABLE IF NOT EXISTS legacy_archive."TableSnapshot" (
  "migrationKey" TEXT NOT NULL,
  "sourceTable" TEXT NOT NULL,
  "columns" JSONB NOT NULL,
  "sourceRowCount" BIGINT NOT NULL,
  "archivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("migrationKey", "sourceTable")
);

CREATE OR REPLACE FUNCTION legacy_archive.capture_table_snapshot(
  migration_key TEXT, source_table TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  source_count BIGINT;
  missing_count BIGINT;
  column_metadata JSONB;
BEGIN
  IF to_regclass(format('public.%I', source_table)) IS NULL THEN
    RETURN; -- A fresh database may not have this legacy table.
  END IF;

  EXECUTE format('LOCK TABLE public.%I IN SHARE MODE', source_table);
  EXECUTE format('SELECT count(*) FROM public.%I', source_table) INTO source_count;

  EXECUTE format(
    'INSERT INTO legacy_archive."RecordSnapshot" ("migrationKey", "sourceTable", "rowHash", "payload")
     SELECT $1, $2, md5(to_jsonb(t)::text), to_jsonb(t) FROM public.%I t
     ON CONFLICT ("migrationKey", "sourceTable", "rowHash") DO NOTHING',
    source_table
  ) USING migration_key, source_table;

  -- Verify complete row contents, rather than only matching IDs or counts.
  EXECUTE format(
    'SELECT count(*) FROM public.%I t WHERE NOT EXISTS (
       SELECT 1 FROM legacy_archive."RecordSnapshot" a
       WHERE a."migrationKey" = $1 AND a."sourceTable" = $2
         AND a."rowHash" = md5(to_jsonb(t)::text) AND a."payload" = to_jsonb(t)
     )', source_table
  ) INTO missing_count USING migration_key, source_table;
  IF missing_count <> 0 THEN
    RAISE EXCEPTION 'Archive verification failed for public.%: % missing rows', source_table, missing_count;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.ordinal_position), '[]'::jsonb)
  INTO column_metadata
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = source_table;

  INSERT INTO legacy_archive."TableSnapshot" ("migrationKey", "sourceTable", "columns", "sourceRowCount")
  VALUES (migration_key, source_table, column_metadata, source_count)
  ON CONFLICT ("migrationKey", "sourceTable") DO UPDATE
    SET "columns" = EXCLUDED."columns", "sourceRowCount" = EXCLUDED."sourceRowCount";
END;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA legacy_archive FROM PUBLIC;
REVOKE ALL ON FUNCTION legacy_archive.capture_table_snapshot(TEXT, TEXT) FROM PUBLIC;

SELECT legacy_archive.capture_table_snapshot('20260928115900', source_table)
FROM unnest(ARRAY[
  'DocumentSequence', 'InvoiceLine', 'StockReceiptNote', 'StockReceiptLine',
  'MaterialInTransit', 'MaterialInTransitLine'
]) AS source_tables(source_table);

COMMIT;

-- Warranty tables exist at this point, even on a freshly migrated database.
-- Preserve all charge lines and vehicle fields before the billing reconciliation.
BEGIN;
SELECT legacy_archive.capture_table_snapshot('20261005090000', 'JobCardLine');
SELECT legacy_archive.capture_table_snapshot('20261005090000', 'Vehicle');
COMMIT;

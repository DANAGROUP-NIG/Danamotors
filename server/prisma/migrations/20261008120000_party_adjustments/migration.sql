BEGIN;
-- Fail safely on source data that cannot be represented as currency; do not silently round away a wallet.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Customer" WHERE "creditBalance"::text IN ('NaN','Infinity','-Infinity') OR ABS("creditBalance"::numeric - ROUND("creditBalance"::numeric,2)) > 0.000001) THEN
    RAISE EXCEPTION 'Legacy wallet contains invalid currency. Review party-adjustment-preflight.sql before migration.';
  END IF;
  IF EXISTS (SELECT 1 FROM "CustomerCreditApplication" WHERE status='Approved' AND (amount::text IN ('NaN','Infinity','-Infinity') OR amount < 0.01 OR ABS(amount::numeric - ROUND(amount::numeric,2)) > 0.000001)) THEN
    RAISE EXCEPTION 'An approved credit application contains invalid currency. Review before migration.';
  END IF;
  IF EXISTS (SELECT 1 FROM "Receipt" WHERE status='ACTIVE' AND ("advanceAmount"::text IN ('NaN','Infinity','-Infinity') OR "advanceAmount"<0 OR "advanceAmount">amount OR ABS("advanceAmount"::numeric-ROUND("advanceAmount"::numeric,2))>0.000001)) THEN
    RAISE EXCEPTION 'An active receipt contains an invalid advance. Review party-adjustment-preflight.sql before migration.';
  END IF;
END $$;
-- One adjustment store: retain ReceiptAllocation IDs and existing receipt/invoice links.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "partyStatus" TEXT NOT NULL DEFAULT 'CUSTOMER';
CREATE TABLE IF NOT EXISTS "PartyNote" (
  "id" TEXT PRIMARY KEY, "number" TEXT NOT NULL, "customerId" TEXT NOT NULL REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "branchId" TEXT NOT NULL REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "direction" TEXT NOT NULL CHECK ("direction" IN ('DEBIT','CREDIT')), "type" TEXT NOT NULL DEFAULT 'OPENING',
  "date" TIMESTAMP(3) NOT NULL, "narration" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL CHECK ("amount" > 0),
  "remainingAmount" DECIMAL(18,2) NOT NULL CHECK ("remainingAmount" >= 0 AND "remainingAmount" <= "amount"),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE', "tallyVoucherNo" TEXT, "tallyPostedAt" TIMESTAMP(3), "tallyExcluded" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE, "idempotencyKey" TEXT, "requestHash" TEXT, "legacyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PartyNote_direction_number_key" ON "PartyNote"("direction","number");
CREATE UNIQUE INDEX IF NOT EXISTS "PartyNote_idempotencyKey_key" ON "PartyNote"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "PartyNote_legacyKey_key" ON "PartyNote"("legacyKey");
-- Party/date and branch/status filters drive account grids and subsequent reports.
CREATE INDEX IF NOT EXISTS "PartyNote_customerId_direction_date_idx" ON "PartyNote"("customerId","direction","date");
CREATE INDEX IF NOT EXISTS "PartyNote_branchId_status_date_idx" ON "PartyNote"("branchId","status","date");
CREATE TABLE IF NOT EXISTS "PartyAdjustmentBatch" (
  "id" TEXT PRIMARY KEY, "customerId" TEXT NOT NULL REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "branchId" TEXT NOT NULL REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE, "date" TIMESTAMP(3) NOT NULL, "source" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL CHECK ("amount" > 0), "actorId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "idempotencyKey" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "tallyPostedAt" TIMESTAMP(3),
  "reversedAt" TIMESTAMP(3), "reversedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE, "reverseRemark" TEXT,
  "legacyPaymentId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PartyAdjustmentBatch_idempotencyKey_key" ON "PartyAdjustmentBatch"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "PartyAdjustmentBatch_legacyPaymentId_key" ON "PartyAdjustmentBatch"("legacyPaymentId");
-- Bounded batch history by party/branch and effective date.
CREATE INDEX IF NOT EXISTS "PartyAdjustmentBatch_customerId_date_idx" ON "PartyAdjustmentBatch"("customerId","date");
CREATE INDEX IF NOT EXISTS "PartyAdjustmentBatch_branchId_date_idx" ON "PartyAdjustmentBatch"("branchId","date");
ALTER TABLE "ReceiptAllocation" DROP CONSTRAINT IF EXISTS "ReceiptAllocation_receiptId_fkey";
ALTER TABLE "ReceiptAllocation" ADD CONSTRAINT "ReceiptAllocation_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReceiptAllocation" ALTER COLUMN "receiptId" DROP NOT NULL;
ALTER TABLE "ReceiptAllocation" ALTER COLUMN "invoiceId" DROP NOT NULL;
ALTER TABLE "ReceiptAllocation" ADD COLUMN IF NOT EXISTS "debitNoteId" TEXT REFERENCES "PartyNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReceiptAllocation" ADD COLUMN IF NOT EXISTS "creditNoteId" TEXT REFERENCES "PartyNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReceiptAllocation" ADD COLUMN IF NOT EXISTS "batchId" TEXT REFERENCES "PartyAdjustmentBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReceiptAllocation" ADD COLUMN IF NOT EXISTS "adjustedAt" TIMESTAMP(3);
ALTER TABLE "ReceiptAllocation" ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3);
UPDATE "ReceiptAllocation" a SET "adjustedAt" = r."issuedAt" FROM "Receipt" r WHERE a."receiptId"=r."id" AND a."adjustedAt" IS NULL;
UPDATE "ReceiptAllocation" SET "adjustedAt" = "createdAt" WHERE "adjustedAt" IS NULL;
ALTER TABLE "ReceiptAllocation" ALTER COLUMN "adjustedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ReceiptAllocation" ALTER COLUMN "adjustedAt" SET NOT NULL;
ALTER TABLE "ReceiptAllocation" DROP CONSTRAINT IF EXISTS "ReceiptAllocation_receiptId_invoiceId_key";
DROP INDEX IF EXISTS "ReceiptAllocation_receiptId_invoiceId_key";
-- Multiple dated adjustments may use the same pair. Keep the legacy entry uniqueness only for live receipt-entry lines.
CREATE UNIQUE INDEX IF NOT EXISTS "ReceiptAllocation_live_entry_key" ON "ReceiptAllocation"("receiptId","invoiceId") WHERE "batchId" IS NULL AND "reversedAt" IS NULL;
DO $$ BEGIN
  ALTER TABLE "ReceiptAllocation" ADD CONSTRAINT "ReceiptAllocation_document_sides_check" CHECK (
    ("invoiceId" IS NOT NULL)::int + ("debitNoteId" IS NOT NULL)::int = 1 AND
    ("receiptId" IS NOT NULL)::int + ("creditNoteId" IS NOT NULL)::int = 1 AND "amount" > 0 AND "amount"::text NOT IN ('NaN','Infinity','-Infinity')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Indexed debit/credit/date paths support historical balance aggregation without scanning all allocations.
CREATE INDEX IF NOT EXISTS "ReceiptAllocation_invoiceId_adjustedAt_idx" ON "ReceiptAllocation"("invoiceId","adjustedAt");
CREATE INDEX IF NOT EXISTS "ReceiptAllocation_receiptId_adjustedAt_idx" ON "ReceiptAllocation"("receiptId","adjustedAt");
CREATE INDEX IF NOT EXISTS "ReceiptAllocation_debitNoteId_adjustedAt_idx" ON "ReceiptAllocation"("debitNoteId","adjustedAt");
CREATE INDEX IF NOT EXISTS "ReceiptAllocation_creditNoteId_adjustedAt_idx" ON "ReceiptAllocation"("creditNoteId","adjustedAt");
CREATE INDEX IF NOT EXISTS "ReceiptAllocation_batchId_idx" ON "ReceiptAllocation"("batchId");
ALTER TABLE "CustomerCreditApplication" ADD COLUMN IF NOT EXISTS "batchId" TEXT REFERENCES "PartyAdjustmentBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerCreditApplication_batchId_key" ON "CustomerCreditApplication"("batchId");

-- Snapshot the wallet once. Preserve receipt advances as their original, independent credits.
-- Already-used legacy credit gets a fully consumed note and dated allocation, so historical approvals are readable in the same store.
WITH legacy AS (
  SELECT 'WALLET:'||c."id" AS key, c."id" AS customer, c."branchId" AS branch,
    CASE WHEN c."creditBalance">0 THEN 'CREDIT' ELSE 'DEBIT' END AS direction,
    ABS(ROUND(c."creditBalance"::numeric,2)) AS amount, ABS(ROUND(c."creditBalance"::numeric,2)) AS remaining,
    CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AS date, 'Legacy wallet balance at migration' AS narration
  FROM "Customer" c WHERE ROUND(c."creditBalance"::numeric,2) <> 0
    AND NOT EXISTS (SELECT 1 FROM "DocumentSequence" WHERE "key"='PARTY_WALLET_BACKFILL_V1')
    AND NOT EXISTS (SELECT 1 FROM "PartyNote" n WHERE n."legacyKey"='WALLET:'||c."id")
  UNION ALL
  SELECT 'APPLICATION:'||a."id", a."customerId", COALESCE(j."branchId",c."branchId"), 'CREDIT', ROUND(a."amount"::numeric,2), 0,
    COALESCE(a."decisionDate",a."createdAt"), 'Legacy credit applied to invoice '||i."invoiceNumber"
  FROM "CustomerCreditApplication" a JOIN "Invoice" i ON i."id"=a."invoiceId"
  JOIN "Customer" c ON c."id"=a."customerId" LEFT JOIN "JobCard" j ON j."id"=i."jobCardId"
  WHERE a."status"='Approved' AND a."amount">0 AND a."batchId" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "PartyNote" n WHERE n."legacyKey"='APPLICATION:'||a."id")
), numbered AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY direction ORDER BY key) + COALESCE((SELECT MAX(RIGHT(n."number",6)::int) FROM "PartyNote" n WHERE n."direction"=legacy.direction AND n."number" ~ ('^'||EXTRACT(YEAR FROM CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::text||'[0-9]{6}$')),0) AS seq FROM legacy
)
INSERT INTO "PartyNote" ("id","number","customerId","branchId","direction","date","narration","amount","remainingAmount","legacyKey")
SELECT md5(key)::uuid::text, EXTRACT(YEAR FROM CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::text||LPAD(seq::text,6,'0'),customer,branch,direction,date,narration,amount,remaining,key FROM numbered
ON CONFLICT ("legacyKey") DO NOTHING;
INSERT INTO "PartyAdjustmentBatch" ("id","customerId","branchId","date","source","amount","idempotencyKey","requestHash","legacyPaymentId")
SELECT md5('BATCH:'||a."id")::uuid::text,a."customerId",n."branchId",COALESCE(a."decisionDate",a."createdAt"),'CREDIT_APPLICATION',ROUND(a."amount"::numeric,2),'LEGACY:'||a."id",'LEGACY',
  (SELECT p."id" FROM "Payment" p WHERE p."invoiceId"=a."invoiceId" AND p."method"='Credit' AND p."reference"='CREDIT-'||UPPER(LEFT(a."id",8)) ORDER BY p."createdAt" LIMIT 1)
FROM "CustomerCreditApplication" a JOIN "PartyNote" n ON n."legacyKey"='APPLICATION:'||a."id"
WHERE a."status"='Approved' ON CONFLICT ("idempotencyKey") DO NOTHING;
INSERT INTO "ReceiptAllocation" ("id","invoiceId","creditNoteId","batchId","amount","adjustedAt")
SELECT md5('ALLOCATION:'||a."id")::uuid::text,a."invoiceId",n."id",b."id",ROUND(a."amount"::numeric,2),b."date"
FROM "CustomerCreditApplication" a JOIN "PartyNote" n ON n."legacyKey"='APPLICATION:'||a."id"
JOIN "PartyAdjustmentBatch" b ON b."idempotencyKey"='LEGACY:'||a."id"
ON CONFLICT ("id") DO NOTHING;
UPDATE "CustomerCreditApplication" a SET "batchId"=b."id" FROM "PartyAdjustmentBatch" b WHERE b."idempotencyKey"='LEGACY:'||a."id" AND a."batchId" IS NULL;
INSERT INTO "DocumentSequence" ("key","value","updatedAt")
SELECT CASE WHEN "direction"='DEBIT' THEN 'DEBIT_NOTE_' ELSE 'CREDIT_NOTE_' END||EXTRACT(YEAR FROM CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::text,MAX(RIGHT("number",6)::int),CURRENT_TIMESTAMP
FROM "PartyNote" WHERE "number" ~ ('^'||EXTRACT(YEAR FROM CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::text||'[0-9]{6}$') GROUP BY "direction"
ON CONFLICT ("key") DO UPDATE SET "value"=GREATEST("DocumentSequence"."value",EXCLUDED."value");

-- Derived cache prevents old consumers from keeping a second wallet. Document mutations lock the party before changing balances.
CREATE OR REPLACE FUNCTION party_available_credit(party TEXT) RETURNS DOUBLE PRECISION LANGUAGE SQL VOLATILE AS $$
 SELECT (COALESCE((SELECT SUM(ROUND("advanceAmount"::numeric,2)) FROM "Receipt" WHERE "customerId"=party AND "status"='ACTIVE'),0)+
 COALESCE((SELECT SUM("remainingAmount") FROM "PartyNote" WHERE "customerId"=party AND "direction"='CREDIT' AND "status"='ACTIVE'),0))::double precision
$$;
CREATE OR REPLACE FUNCTION refresh_party_credit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE "Customer" SET "creditBalance"=party_available_credit(OLD."customerId") WHERE "id"=OLD."customerId";
  ELSIF TG_OP = 'UPDATE' AND OLD."customerId" IS DISTINCT FROM NEW."customerId" THEN
    UPDATE "Customer" SET "creditBalance"=party_available_credit(OLD."customerId") WHERE "id"=OLD."customerId";
  END IF;
  IF TG_OP <> 'DELETE' THEN UPDATE "Customer" SET "creditBalance"=party_available_credit(NEW."customerId") WHERE "id"=NEW."customerId"; END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS "Receipt_refresh_credit" ON "Receipt";
CREATE TRIGGER "Receipt_refresh_credit" AFTER INSERT OR UPDATE OF "advanceAmount","status","customerId" OR DELETE ON "Receipt" FOR EACH ROW EXECUTE FUNCTION refresh_party_credit();
DROP TRIGGER IF EXISTS "PartyNote_refresh_credit" ON "PartyNote";
CREATE TRIGGER "PartyNote_refresh_credit" AFTER INSERT OR UPDATE OF "remainingAmount","status","customerId","direction" OR DELETE ON "PartyNote" FOR EACH ROW EXECUTE FUNCTION refresh_party_credit();
CREATE OR REPLACE FUNCTION readonly_party_credit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW."creditBalance" := party_available_credit(NEW."id"); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS "Customer_derived_credit" ON "Customer";
CREATE TRIGGER "Customer_derived_credit" BEFORE INSERT OR UPDATE OF "creditBalance" ON "Customer" FOR EACH ROW EXECUTE FUNCTION readonly_party_credit();
UPDATE "Customer" SET "creditBalance"=party_available_credit("id");

INSERT INTO "Permission" ("id","name","description")
SELECT gen_random_uuid()::text,name,description FROM (VALUES
 ('receipt:adjust','Apply receipt advances and credits to party debits'),
 ('receipt:adjust:reverse','Reverse unposted party adjustment batches'),
 ('party:opening:create','Record party opening debit or credit balances')
) v(name,description) WHERE NOT EXISTS (SELECT 1 FROM "Permission" p WHERE p."name"=v.name);
INSERT INTO "RolePermission" ("roleId","permissionId")
SELECT r."id",p."id" FROM "Role" r CROSS JOIN "Permission" p
WHERE ((r."name" IN ('SuperAdmin','Admin') AND p."name" IN ('receipt:adjust','receipt:adjust:reverse','party:opening:create'))
 OR (r."name" IN ('Accountant','BillingOfficer') AND p."name"='receipt:adjust')
 OR (r."name"='Accountant' AND p."name"='customer:read'))
AND NOT EXISTS (SELECT 1 FROM "RolePermission" rp WHERE rp."roleId"=r."id" AND rp."permissionId"=p."id");

INSERT INTO "AuditLog" ("id","action","details","createdAt")
SELECT md5('PARTY_WALLET_BACKFILL_V1')::uuid::text,'PARTY_CREDIT_MIGRATED',json_build_object(
 'walletNotes',(SELECT COUNT(*) FROM "PartyNote" WHERE "legacyKey" LIKE 'WALLET:%'),
 'approvedApplications',(SELECT COUNT(*) FROM "PartyAdjustmentBatch" WHERE "idempotencyKey" LIKE 'LEGACY:%'),
 'walletCredits',(SELECT COALESCE(SUM(amount),0) FROM "PartyNote" WHERE "legacyKey" LIKE 'WALLET:%' AND direction='CREDIT'),
 'walletDebits',(SELECT COALESCE(SUM(amount),0) FROM "PartyNote" WHERE "legacyKey" LIKE 'WALLET:%' AND direction='DEBIT')
)::text,CURRENT_TIMESTAMP WHERE NOT EXISTS (SELECT 1 FROM "DocumentSequence" WHERE key='PARTY_WALLET_BACKFILL_V1')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "DocumentSequence" ("key","value","updatedAt") VALUES ('PARTY_WALLET_BACKFILL_V1',1,CURRENT_TIMESTAMP) ON CONFLICT ("key") DO NOTHING;
COMMIT;

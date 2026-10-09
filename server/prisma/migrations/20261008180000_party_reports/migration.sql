BEGIN;
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "PartyNote" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
-- Cancellation history: prefer retained audit evidence; unknown legacy dates use cutover.
UPDATE "Receipt" r SET "cancelledAt"=COALESCE((SELECT MIN(a."createdAt") FROM "AuditLog" a
 WHERE a.action='RECEIPT_CANCELLED' AND a.details LIKE '%' || r.id || '%'),CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
WHERE UPPER(r.status) IN ('CANCELLED','CANCELED','VOID') AND r."cancelledAt" IS NULL;
UPDATE "PartyNote" SET "cancelledAt"=CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
WHERE status='CANCELLED' AND "cancelledAt" IS NULL;
CREATE TABLE IF NOT EXISTS "FinanceSetting" (key TEXT PRIMARY KEY,value JSONB NOT NULL,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
INSERT INTO "FinanceSetting" VALUES ('partyAgeLimits','[30,60,90,120,180]',CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "reportBranchId" TEXT;
-- Snapshot document branch before later customer merges.
UPDATE "Invoice" i SET "reportBranchId"=COALESCE((SELECT j."branchId" FROM "JobCard" j WHERE j.id=i."jobCardId"),(SELECT c."branchId" FROM "Customer" c WHERE c.id=i."customerId")) WHERE i."reportBranchId" IS NULL;
CREATE OR REPLACE FUNCTION party_invoice_report_branch() RETURNS trigger AS $$
BEGIN
 IF NEW."reportBranchId" IS NULL THEN
  NEW."reportBranchId" := COALESCE((SELECT "branchId" FROM "JobCard" WHERE id=NEW."jobCardId"),(SELECT "branchId" FROM "Customer" WHERE id=NEW."customerId"));
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS party_invoice_report_branch ON "Invoice";
CREATE TRIGGER party_invoice_report_branch BEFORE INSERT ON "Invoice" FOR EACH ROW EXECUTE FUNCTION party_invoice_report_branch();
UPDATE "Invoice" SET "cancelledAt"=CURRENT_TIMESTAMP AT TIME ZONE 'UTC' WHERE UPPER(status) IN ('CANCELLED','CANCELED','VOID') AND "cancelledAt" IS NULL;
-- Stable branch provenance for old receipts with no explicit branch.
UPDATE "Receipt" r SET "branchId"=c."branchId" FROM "Customer" c WHERE c.id=r."customerId" AND r."branchId" IS NULL;
-- Party/date paths for ledger and as-on report source scans.
-- Branch/date scans use the immutable invoice branch snapshot.
CREATE INDEX IF NOT EXISTS "Invoice_reportBranchId_issuedDate_idx" ON "Invoice"("reportBranchId","issuedDate");
CREATE INDEX IF NOT EXISTS "Invoice_customerId_issuedDate_idx" ON "Invoice"("customerId","issuedDate");
-- Party status and branch/range filters in bounded party lookup.
CREATE INDEX IF NOT EXISTS "Customer_branchId_partyStatus_code_idx" ON "Customer"("branchId","partyStatus",code);
-- Reporting reads the same generalized allocations. These indexed date predicates retain reversals.
CREATE INDEX IF NOT EXISTS "ReceiptAllocation_adjustedAt_reversedAt_idx" ON "ReceiptAllocation"("adjustedAt","reversedAt");
CREATE OR REPLACE VIEW "PartyReportDocument" AS
 SELECT 'INVOICE'::text kind,i.id,i."customerId",i."reportBranchId" "branchId",i."issuedDate" date,
 i."invoiceNumber" number,ROUND(i.total::numeric,2) amount,COALESCE(i.notes,'Job bill') narration,i."cancelledAt"
 FROM "Invoice" i JOIN "Customer" c ON c.id=i."customerId" LEFT JOIN "JobCard" j ON j.id=i."jobCardId"
 UNION ALL
 SELECT 'RECEIPT',r.id,r."customerId",r."branchId",r."issuedAt",r."receiptNumber",
 ROUND(COALESCE((SELECT e."oldAmount" FROM "ReceiptEditLog" e WHERE e."receiptId"=r.id ORDER BY e."createdAt",e.id LIMIT 1),r.amount)::numeric,2),
 COALESCE((SELECT COALESCE(e."oldNarration",'Receipt') FROM "ReceiptEditLog" e WHERE e."receiptId"=r.id ORDER BY e."createdAt",e.id LIMIT 1),r.notes,'Receipt'),r."cancelledAt"
 FROM "Receipt" r
 UNION ALL
 SELECT CASE WHEN n.direction='DEBIT' THEN 'DEBIT_NOTE' ELSE 'CREDIT_NOTE' END,n.id,n."customerId",n."branchId",n.date,n.number,n.amount,n.narration,n."cancelledAt" FROM "PartyNote" n;
CREATE OR REPLACE VIEW "PartyReportEvent" AS
 SELECT d."customerId",d."branchId",d.date,d.kind || ':' || d.id id,d.number,d.kind,d.narration,
 CASE WHEN d.kind IN ('INVOICE','DEBIT_NOTE') THEN d.amount ELSE 0::numeric END debit,
 CASE WHEN d.kind IN ('RECEIPT','CREDIT_NOTE') THEN d.amount ELSE 0::numeric END credit
 FROM "PartyReportDocument" d
 UNION ALL
 SELECT r."customerId",r."branchId",e."createdAt",'EDIT:' || e.id,r."receiptNumber",'RECEIPT_EDIT',
 COALESCE(e."newNarration",'Receipt amount amended'),GREATEST(ROUND(e."oldAmount"::numeric,2)-ROUND(e."newAmount"::numeric,2),0),
 GREATEST(ROUND(e."newAmount"::numeric,2)-ROUND(e."oldAmount"::numeric,2),0)
 FROM "ReceiptEditLog" e JOIN "Receipt" r ON r.id=e."receiptId"
 WHERE ROUND(e."oldAmount"::numeric,2)<>ROUND(e."newAmount"::numeric,2)
 UNION ALL
 SELECT d."customerId",d."branchId",d."cancelledAt",'CANCEL:' || d.kind || ':' || d.id,d.number,'CANCELLATION',
 'Cancellation reversal: ' || d.narration,
 CASE WHEN d.kind='RECEIPT' THEN ROUND(r.amount::numeric,2) WHEN d.kind='CREDIT_NOTE' THEN d.amount ELSE 0 END,
 CASE WHEN d.kind IN ('INVOICE','DEBIT_NOTE') THEN d.amount ELSE 0 END
 FROM "PartyReportDocument" d LEFT JOIN "Receipt" r ON d.kind='RECEIPT' AND r.id=d.id WHERE d."cancelledAt" IS NOT NULL
 UNION ALL
 SELECT COALESCE(i."customerId",n."customerId"),COALESCE(b."branchId",r."branchId",n."branchId",i."reportBranchId",j."branchId",c."branchId"),a."adjustedAt",'ADJUST:' || a.id,
 COALESCE(i."invoiceNumber",n.number),'ADJUSTMENT','Matched ' || ROUND(a.amount::numeric,2)::text || ' against ' || COALESCE(r."receiptNumber",cn.number),0::numeric,0::numeric
 FROM "ReceiptAllocation" a LEFT JOIN "Invoice" i ON i.id=a."invoiceId" LEFT JOIN "JobCard" j ON j.id=i."jobCardId" LEFT JOIN "Customer" c ON c.id=i."customerId"
 LEFT JOIN "PartyNote" n ON n.id=a."debitNoteId" LEFT JOIN "PartyNote" cn ON cn.id=a."creditNoteId" LEFT JOIN "Receipt" r ON r.id=a."receiptId" LEFT JOIN "PartyAdjustmentBatch" b ON b.id=a."batchId"
 UNION ALL
 SELECT COALESCE(i."customerId",n."customerId"),COALESCE(b."branchId",r."branchId",n."branchId",j."branchId",c."branchId"),a."reversedAt",'REVERSE:' || a.id,
 COALESCE(i."invoiceNumber",n.number),'ADJUSTMENT_REVERSAL','Reversed match of ' || ROUND(a.amount::numeric,2)::text,0::numeric,0::numeric
 FROM "ReceiptAllocation" a LEFT JOIN "Invoice" i ON i.id=a."invoiceId" LEFT JOIN "JobCard" j ON j.id=i."jobCardId" LEFT JOIN "Customer" c ON c.id=i."customerId"
 LEFT JOIN "PartyNote" n ON n.id=a."debitNoteId" LEFT JOIN "Receipt" r ON r.id=a."receiptId" LEFT JOIN "PartyAdjustmentBatch" b ON b.id=a."batchId" WHERE a."reversedAt" IS NOT NULL;
-- Explicit report permissions, rerunnable without changing existing grants.
INSERT INTO "Permission" (id,name,description,"createdAt")
 SELECT md5('issue77:' || p)::uuid::text,p,'Party finance report',CURRENT_TIMESTAMP
 FROM unnest(ARRAY['report:party-ledger','report:party-outstanding','report:party-outstanding-age','report:party-outstanding-bill']) p ON CONFLICT (name) DO NOTHING;
INSERT INTO "RolePermission" ("roleId","permissionId")
 SELECT r.id,p.id FROM "Role" r CROSS JOIN "Permission" p WHERE r.name IN ('Admin','SuperAdmin','Accountant','BillingOfficer')
 AND p.name IN ('report:party-ledger','report:party-outstanding','report:party-outstanding-age','report:party-outstanding-bill') ON CONFLICT DO NOTHING;
COMMIT;

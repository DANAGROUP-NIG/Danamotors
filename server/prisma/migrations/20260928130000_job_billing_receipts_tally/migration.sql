ALTER TABLE "Customer"
  ADD COLUMN IF NOT EXISTS "tallyLedgerId" TEXT;

ALTER TABLE "JobCard"
  ADD COLUMN IF NOT EXISTS "billedAt" TIMESTAMP(3);

ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "partsTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "labourTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "partsDiscountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "labourDiscountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "partsDiscountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "labourDiscountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 7.5,
  ADD COLUMN IF NOT EXISTS "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "roundOff" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "outstandingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "serviceAdvisorId" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledById" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelRemark" TEXT,
  ADD COLUMN IF NOT EXISTS "tallyVoucherNo" TEXT,
  ADD COLUMN IF NOT EXISTS "tallyPostedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "tallyPostedById" TEXT;

ALTER TABLE "Receipt"
  ADD COLUMN IF NOT EXISTS "receiptNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "customerId" TEXT,
  ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
  ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'SERVICE_PARTS',
  ADD COLUMN IF NOT EXISTS "bankId" TEXT,
  ADD COLUMN IF NOT EXISTS "chequeNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "chequeDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "advanceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "cancelRemark" TEXT,
  ADD COLUMN IF NOT EXISTS "tallyVoucherNo" TEXT,
  ADD COLUMN IF NOT EXISTS "tallyPostedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "tallyPostedById" TEXT;

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "receiptId" TEXT;

UPDATE "Receipt" AS receipt
SET "customerId" = invoice."customerId"
FROM "Invoice" AS invoice
WHERE receipt."customerId" IS NULL
  AND receipt."invoiceId" = invoice.id;

WITH numbered_receipts AS (
  SELECT id,
         to_char("issuedAt", 'YYYY') || lpad(row_number() OVER (
           PARTITION BY to_char("issuedAt", 'YYYY') ORDER BY "issuedAt", id
         )::text, 6, '0') AS receipt_number
  FROM "Receipt"
  WHERE "receiptNumber" IS NULL
)
UPDATE "Receipt" AS receipt
SET "receiptNumber" = numbered_receipts.receipt_number
FROM numbered_receipts
WHERE receipt.id = numbered_receipts.id;

ALTER TABLE "Receipt" ALTER COLUMN "invoiceId" DROP NOT NULL;
ALTER TABLE "Receipt" ALTER COLUMN "customerId" SET NOT NULL;
ALTER TABLE "Receipt" ALTER COLUMN "receiptNumber" SET NOT NULL;
ALTER TABLE "Receipt" ALTER COLUMN "issuedById" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "LabourItem" (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  "defaultHours" DOUBLE PRECISION NOT NULL DEFAULT 1,
  rate DOUBLE PRECISION NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "JobCardLabour" (
  id TEXT PRIMARY KEY,
  "jobCardId" TEXT NOT NULL,
  "labourItemId" TEXT NOT NULL,
  description TEXT NOT NULL,
  hours DOUBLE PRECISION NOT NULL,
  rate DOUBLE PRECISION NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  "technicianId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "InvoiceLine" (
  id TEXT PRIMARY KEY,
  "invoiceId" TEXT NOT NULL,
  type TEXT NOT NULL,
  "partId" TEXT,
  "jobCardLabourId" TEXT,
  description TEXT NOT NULL,
  quantity DOUBLE PRECISION NOT NULL,
  rate DOUBLE PRECISION NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  "customerPaid" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "DocumentSequence" (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Bank" (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  "accountNumber" TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ReceiptAllocation" (
  id TEXT PRIMARY KEY,
  "receiptId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReceiptAllocation_receiptId_invoiceId_key" UNIQUE ("receiptId", "invoiceId")
);

CREATE TABLE IF NOT EXISTS "ReceiptEditLog" (
  id TEXT PRIMARY KEY,
  "receiptId" TEXT NOT NULL,
  "editedById" TEXT NOT NULL,
  "oldAmount" DOUBLE PRECISION NOT NULL,
  "newAmount" DOUBLE PRECISION NOT NULL,
  "oldNarration" TEXT,
  "newNarration" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "TallyLedger" (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "TallyAccountMapping" (
  id TEXT PRIMARY KEY,
  "documentType" TEXT NOT NULL,
  "accountType" TEXT NOT NULL,
  "tallyLedgerCode" TEXT NOT NULL,
  "tallyLedgerName" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TallyAccountMapping_documentType_accountType_key" UNIQUE ("documentType", "accountType")
);

CREATE TABLE IF NOT EXISTS "TallyPostingLog" (
  id TEXT PRIMARY KEY,
  "documentType" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'EXPORTED',
  "voucherNumber" TEXT,
  "batchId" TEXT NOT NULL,
  payload TEXT,
  "postedAt" TIMESTAMP(3),
  "postedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TallyPostingLog_documentType_documentId_key" UNIQUE ("documentType", "documentId")
);

CREATE INDEX IF NOT EXISTS "JobCardLabour_jobCardId_idx" ON "JobCardLabour"("jobCardId");
CREATE INDEX IF NOT EXISTS "JobCardLabour_labourItemId_idx" ON "JobCardLabour"("labourItemId");
CREATE INDEX IF NOT EXISTS "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");
CREATE INDEX IF NOT EXISTS "Receipt_customerId_issuedAt_idx" ON "Receipt"("customerId", "issuedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Receipt_receiptNumber_key" ON "Receipt"("receiptNumber");
CREATE INDEX IF NOT EXISTS "ReceiptAllocation_invoiceId_idx" ON "ReceiptAllocation"("invoiceId");
CREATE INDEX IF NOT EXISTS "ReceiptEditLog_receiptId_createdAt_idx" ON "ReceiptEditLog"("receiptId", "createdAt");
CREATE INDEX IF NOT EXISTS "TallyPostingLog_batchId_idx" ON "TallyPostingLog"("batchId");
CREATE INDEX IF NOT EXISTS "TallyPostingLog_status_createdAt_idx" ON "TallyPostingLog"(status, "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_active_jobCardId_key"
  ON "Invoice"("jobCardId")
  WHERE "jobCardId" IS NOT NULL AND upper(status) NOT IN ('CANCELLED', 'CANCELED', 'VOID');

DO $$ BEGIN
  ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tallyLedgerId_fkey"
    FOREIGN KEY ("tallyLedgerId") REFERENCES "TallyLedger"(id) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_serviceAdvisorId_fkey"
    FOREIGN KEY ("serviceAdvisorId") REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_cancelledById_fkey"
    FOREIGN KEY ("cancelledById") REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tallyPostedById_fkey"
    FOREIGN KEY ("tallyPostedById") REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "JobCardLabour" ADD CONSTRAINT "JobCardLabour_jobCardId_fkey"
    FOREIGN KEY ("jobCardId") REFERENCES "JobCard"(id) ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "JobCardLabour" ADD CONSTRAINT "JobCardLabour_labourItemId_fkey"
    FOREIGN KEY ("labourItemId") REFERENCES "LabourItem"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "JobCardLabour" ADD CONSTRAINT "JobCardLabour_technicianId_fkey"
    FOREIGN KEY ("technicianId") REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"(id) ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_partId_fkey"
    FOREIGN KEY ("partId") REFERENCES "SparePart"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_jobCardLabourId_fkey"
    FOREIGN KEY ("jobCardLabourId") REFERENCES "JobCardLabour"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Receipt" DROP CONSTRAINT IF EXISTS "Receipt_invoiceId_fkey";
  ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"(id) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_bankId_fkey"
    FOREIGN KEY ("bankId") REFERENCES "Bank"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_tallyPostedById_fkey"
    FOREIGN KEY ("tallyPostedById") REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ReceiptAllocation" ADD CONSTRAINT "ReceiptAllocation_receiptId_fkey"
    FOREIGN KEY ("receiptId") REFERENCES "Receipt"(id) ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ReceiptAllocation" ADD CONSTRAINT "ReceiptAllocation_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ReceiptEditLog" ADD CONSTRAINT "ReceiptEditLog_receiptId_fkey"
    FOREIGN KEY ("receiptId") REFERENCES "Receipt"(id) ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ReceiptEditLog" ADD CONSTRAINT "ReceiptEditLog_editedById_fkey"
    FOREIGN KEY ("editedById") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Payment" ADD CONSTRAINT "Payment_receiptId_fkey"
    FOREIGN KEY ("receiptId") REFERENCES "Receipt"(id) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TallyPostingLog" ADD CONSTRAINT "TallyPostingLog_postedById_fkey"
    FOREIGN KEY ("postedById") REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO "Bank" (id, code, name, active, "createdAt", "updatedAt")
VALUES ('00000000-0000-4000-8000-00000000a004', 'A0004', 'Access Bank', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (code) DO NOTHING;

INSERT INTO "Permission" (id, name, description)
VALUES
  (gen_random_uuid(), 'invoice:job-bill:create', 'Create job bills from completed job cards'),
  (gen_random_uuid(), 'invoice:cancel', 'Cancel an unpaid job bill with a remark'),
  (gen_random_uuid(), 'receipt:update', 'Edit receipt amount and narration before Tally posting'),
  (gen_random_uuid(), 'receipt:cancel', 'Cancel a receipt before Tally posting'),
  (gen_random_uuid(), 'report:receipt-register', 'Read the receipt register report'),
  (gen_random_uuid(), 'tally:post', 'Export and confirm Tally posting batches'),
  (gen_random_uuid(), 'tally:import', 'Import Tally ledgers and manage account mappings'),
  (gen_random_uuid(), 'customer:tally-mapping', 'Link customers to Tally ledgers'),
  (gen_random_uuid(), 'jobcard:labour:update', 'Manage labour lines on open job cards'),
  (gen_random_uuid(), 'labour-item:read', 'Read the labour catalogue'),
  (gen_random_uuid(), 'labour-item:create', 'Create labour catalogue items'),
  (gen_random_uuid(), 'labour-item:update', 'Update labour catalogue items')
ON CONFLICT (name) DO NOTHING;

INSERT INTO "Role" (id, name, description, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'BillingOfficer', 'Creates job bills, records receipts, and manages Tally exports', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (name) DO NOTHING;

DELETE FROM "RolePermission" rp
USING "Permission" p, "Role" r
WHERE rp."permissionId" = p.id
  AND rp."roleId" = r.id
  AND p.name = 'receipt:create'
  AND r.name NOT IN ('SuperAdmin', 'BillingOfficer');

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r.name = 'BillingOfficer'
  AND p.name IN (
    'dashboard:read', 'notification:read', 'notification:update', 'search:read',
    'customer:read', 'invoice:read', 'payment:read', 'invoice:job-bill:create', 'invoice:cancel',
    'receipt:read', 'receipt:create', 'receipt:update', 'receipt:cancel',
    'report:receipt-register', 'tally:post', 'tally:import', 'customer:tally-mapping'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r.name = 'SuperAdmin'
  AND p.name IN (
    'invoice:job-bill:create', 'invoice:cancel', 'receipt:update', 'receipt:cancel',
    'report:receipt-register', 'tally:post', 'tally:import', 'customer:tally-mapping',
    'jobcard:labour:update', 'labour-item:read', 'labour-item:create', 'labour-item:update'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r.name = 'WorkshopManager'
  AND p.name IN ('jobcard:labour:update', 'labour-item:read', 'labour-item:create', 'labour-item:update')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r.name = 'ServiceAdviser'
  AND p.name IN ('jobcard:labour:update', 'labour-item:read')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "DocumentSequence" (key, value, "updatedAt")
SELECT 'JOB_BILL_' || substring("invoiceNumber" from 1 for 4),
       max(substring("invoiceNumber" from 5 for 6)::integer), CURRENT_TIMESTAMP
FROM "Invoice"
WHERE "invoiceNumber" ~ '^20[0-9]{8}$'
GROUP BY substring("invoiceNumber" from 1 for 4)
ON CONFLICT (key) DO UPDATE
SET value = GREATEST("DocumentSequence".value, EXCLUDED.value), "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "ReceiptAllocation" (id, "receiptId", "invoiceId", amount, "createdAt")
SELECT gen_random_uuid()::text, receipt.id, receipt."invoiceId", receipt.amount, CURRENT_TIMESTAMP
FROM "Receipt" AS receipt
WHERE receipt."invoiceId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ReceiptAllocation" AS allocation
    WHERE allocation."receiptId" = receipt.id AND allocation."invoiceId" = receipt."invoiceId"
  )
ON CONFLICT ("receiptId", "invoiceId") DO NOTHING;

WITH ranked_payments AS (
  SELECT id, "invoiceId", amount, "paymentDate",
         row_number() OVER (
           PARTITION BY "invoiceId", amount, "paymentDate" ORDER BY id
         ) AS match_number
  FROM "Payment"
  WHERE "receiptId" IS NULL
), ranked_receipts AS (
  SELECT id, "invoiceId", amount, "issuedAt",
         row_number() OVER (
           PARTITION BY "invoiceId", amount, "issuedAt" ORDER BY id
         ) AS match_number
  FROM "Receipt"
  WHERE "invoiceId" IS NOT NULL
)
UPDATE "Payment" AS payment
SET "receiptId" = receipt.id
FROM ranked_payments AS payment_match
JOIN ranked_receipts AS receipt_match
  ON receipt_match."invoiceId" = payment_match."invoiceId"
 AND receipt_match.amount = payment_match.amount
 AND receipt_match."issuedAt" = payment_match."paymentDate"
 AND receipt_match.match_number = payment_match.match_number
JOIN "Receipt" AS receipt ON receipt.id = receipt_match.id
WHERE payment.id = payment_match.id;

INSERT INTO "DocumentSequence" (key, value, "updatedAt")
SELECT 'RECEIPT_' || substring("receiptNumber" from 1 for 4),
       max(substring("receiptNumber" from 5 for 6)::integer), CURRENT_TIMESTAMP
FROM "Receipt"
WHERE "receiptNumber" ~ '^20[0-9]{8}$'
GROUP BY substring("receiptNumber" from 1 for 4)
ON CONFLICT (key) DO UPDATE
SET value = GREATEST("DocumentSequence".value, EXCLUDED.value), "updatedAt" = CURRENT_TIMESTAMP;

WITH candidates AS (
  SELECT payment.id AS payment_id,
         payment."invoiceId" AS invoice_id,
         payment."recordedById" AS issued_by_id,
         payment.amount,
         payment."paymentDate" AS issued_at,
         payment.reference,
         payment.notes,
         invoice."customerId" AS customer_id,
         to_char(payment."paymentDate", 'YYYY') AS document_year,
         COALESCE(sequence.value, 0) AS sequence_base,
         row_number() OVER (
           PARTITION BY to_char(payment."paymentDate", 'YYYY')
           ORDER BY payment."paymentDate", payment.id
         ) AS sequence_offset,
         CASE
           WHEN upper(payment.method) IN ('CASH') THEN 'CASH'
           WHEN upper(payment.method) IN ('POS', 'CARD') THEN 'POS'
           ELSE 'BANK_TRANSFER'
         END AS receipt_mode
  FROM "Payment" AS payment
  JOIN "Invoice" AS invoice ON invoice.id = payment."invoiceId"
  LEFT JOIN "DocumentSequence" AS sequence
    ON sequence.key = 'RECEIPT_' || to_char(payment."paymentDate", 'YYYY')
  WHERE payment."receiptId" IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM "Receipt" AS receipt
      WHERE receipt."invoiceId" = payment."invoiceId"
        AND receipt.amount = payment.amount
        AND receipt."issuedAt" = payment."paymentDate"
    )
), inserted_receipts AS (
  INSERT INTO "Receipt" (
    id, "receiptNumber", "customerId", "invoiceId", "issuedById", amount, "issuedAt",
    reference, notes, mode, category, "advanceAmount", status, "createdAt", "updatedAt"
  )
  SELECT payment_id,
         document_year || lpad((sequence_base + sequence_offset)::text, 6, '0'),
         customer_id, invoice_id, issued_by_id, amount, issued_at,
         reference, notes, receipt_mode, 'SERVICE_PARTS', 0, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM candidates
  ON CONFLICT (id) DO NOTHING
  RETURNING id, "invoiceId", amount
), linked_payments AS (
  UPDATE "Payment" AS payment
  SET "receiptId" = receipt.id
  FROM inserted_receipts AS receipt
  WHERE payment.id = receipt.id
  RETURNING payment.id
)
INSERT INTO "ReceiptAllocation" (id, "receiptId", "invoiceId", amount, "createdAt")
SELECT gen_random_uuid()::text, receipt.id, receipt."invoiceId", receipt.amount, CURRENT_TIMESTAMP
FROM inserted_receipts AS receipt
ON CONFLICT ("receiptId", "invoiceId") DO NOTHING;

INSERT INTO "DocumentSequence" (key, value, "updatedAt")
SELECT 'RECEIPT_' || substring("receiptNumber" from 1 for 4),
       max(substring("receiptNumber" from 5 for 6)::integer), CURRENT_TIMESTAMP
FROM "Receipt"
WHERE "receiptNumber" ~ '^20[0-9]{8}$'
GROUP BY substring("receiptNumber" from 1 for 4)
ON CONFLICT (key) DO UPDATE
SET value = GREATEST("DocumentSequence".value, EXCLUDED.value), "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "Invoice" AS invoice
SET "outstandingAmount" = GREATEST(
  CASE WHEN upper(invoice.status) = 'PAID' THEN 0 ELSE
    invoice.total
    - COALESCE((SELECT sum(payment.amount) FROM "Payment" AS payment WHERE payment."invoiceId" = invoice.id AND payment."receiptId" IS NULL), 0)
    - COALESCE((SELECT sum(allocation.amount) FROM "ReceiptAllocation" AS allocation WHERE allocation."invoiceId" = invoice.id), 0)
  END,
  0
)
WHERE invoice."outstandingAmount" = 0
  AND upper(invoice.status) NOT IN ('CANCELLED', 'CANCELED', 'VOID');
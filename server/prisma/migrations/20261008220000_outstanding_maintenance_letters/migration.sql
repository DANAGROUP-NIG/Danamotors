BEGIN;
-- Additive and safe to rerun. Existing financial amounts and historical due dates remain unchanged.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "creditDays" INTEGER;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='Customer_creditDays_check') THEN
 ALTER TABLE "Customer" ADD CONSTRAINT "Customer_creditDays_check" CHECK ("creditDays" IS NULL OR "creditDays" BETWEEN 0 AND 3650);
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS "OutstandingLetter" (
 "id" TEXT PRIMARY KEY, "reference" TEXT NOT NULL, "customerId" TEXT NOT NULL REFERENCES "Customer"(id) ON DELETE RESTRICT,
 "branchId" TEXT NOT NULL REFERENCES "Branch"(id) ON DELETE RESTRICT, "asOn" TIMESTAMP(3) NOT NULL,
 "totalOutstanding" DECIMAL(18,2) NOT NULL, "snapshot" JSONB NOT NULL, "content" TEXT NOT NULL,
 "requestKey" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "createdById" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "printedAt" TIMESTAMP(3), "printedById" TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS "OutstandingLetter_reference_key" ON "OutstandingLetter"("reference");
CREATE UNIQUE INDEX IF NOT EXISTS "OutstandingLetter_requestKey_key" ON "OutstandingLetter"("requestKey");
CREATE INDEX IF NOT EXISTS "OutstandingLetter_branchId_reference_idx" ON "OutstandingLetter"("branchId","reference");
CREATE INDEX IF NOT EXISTS "OutstandingLetter_customerId_printedAt_idx" ON "OutstandingLetter"("customerId","printedAt");
CREATE INDEX IF NOT EXISTS "Invoice_dueDate_status_idx" ON "Invoice"("dueDate","status");
INSERT INTO "FinanceSetting"(key,value,"updatedAt") VALUES ('defaultCreditDays','30'::jsonb,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING;

CREATE OR REPLACE FUNCTION invoice_credit_due_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."cancelledAt" IS NULL AND UPPER(NEW.status) IN ('UNPAID','PARTIALLY PAID','PAID','OVERDUE') THEN
  IF ROUND(NEW."outstandingAmount"::numeric,2)<=0 THEN NEW.status:='Paid';
  ELSIF (NEW."dueDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Lagos')::date < (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Lagos')::date THEN NEW.status:='Overdue';
  ELSIF ROUND(NEW."outstandingAmount"::numeric,2)<ROUND(NEW.total::numeric,2) THEN NEW.status:='Partially Paid';
  ELSE NEW.status:='Unpaid';
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "Invoice_credit_due_status" ON "Invoice";
CREATE TRIGGER "Invoice_credit_due_status" BEFORE INSERT OR UPDATE OF "outstandingAmount","dueDate",status ON "Invoice" FOR EACH ROW EXECUTE FUNCTION invoice_credit_due_status();

-- Seed explicit permissions without changing existing custom role grants.
INSERT INTO "Permission"(id,name,description) VALUES
 (md5('outstanding:recalculate')::uuid::text,'outstanding:recalculate','Preview and repair party outstanding balances'),
 (md5('letter:outstanding')::uuid::text,'letter:outstanding','Generate and print saved outstanding letters')
ON CONFLICT(name) DO NOTHING;
INSERT INTO "RolePermission"("roleId","permissionId")
SELECT r.id,p.id FROM "Role" r CROSS JOIN "Permission" p
WHERE (p.name='outstanding:recalculate' AND r.name IN ('Admin','SuperAdmin'))
 OR (p.name='letter:outstanding' AND r.name IN ('Admin','SuperAdmin','Accountant','BillingOfficer'))
ON CONFLICT DO NOTHING;

COMMIT;

-- Legacy Quotation Terms and Conditions Master plus the Control screen's terms (job card, job bill,
-- parts quotation, counter sale, estimate) and footer messages, per document and optionally per branch.
DO $$ BEGIN
  CREATE TYPE "DocumentTermType" AS ENUM ('JOB_ESTIMATE', 'JOB_CARD', 'JOB_BILL', 'PARTS_QUOTATION', 'COUNTER_SALE', 'RECEIPT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS "DocumentTerms" (
  "id" TEXT NOT NULL,
  "documentType" "DocumentTermType" NOT NULL,
  "branchId" TEXT,
  "terms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "footer" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentTerms_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DocumentTerms_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "DocumentTerms_documentType_branchId_idx" ON "DocumentTerms"("documentType", "branchId");
-- One company-wide row and one row per branch for each document.
CREATE UNIQUE INDEX IF NOT EXISTS "DocumentTerms_scope_key" ON "DocumentTerms"("documentType", COALESCE("branchId", ''));

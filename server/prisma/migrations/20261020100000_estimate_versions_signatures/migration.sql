-- Additive, retry-safe migration. Failed deploys may have completed earlier statements.
-- Keep each retry atomic; never reset signed scope or reclassify new approvals as legacy.
BEGIN;

-- Reuse compatible existing terms, but never reinterpret or replace customer-facing data.
DO $$
DECLARE incompatible TEXT;
BEGIN
 IF to_regclass('"DocumentTerms"') IS NOT NULL THEN
  SELECT string_agg(expected.name, ', ' ORDER BY expected.name) INTO incompatible
  FROM (VALUES ('id', 'text', false), ('type', 'text', false), ('branchId', 'text', true),
               ('terms', '_text', false), ('footer', 'text', true), ('updatedAt', 'timestamp', false),
               ('companyName', 'text', true), ('companyAddress', 'text', true), ('companyPhone', 'text', true))
       AS expected(name, udt, nullable)
  LEFT JOIN information_schema.columns c ON c.table_schema = current_schema()
       AND c.table_name = 'DocumentTerms' AND c.column_name = expected.name
  WHERE (c.column_name IS NULL AND expected.name NOT IN ('companyName', 'companyAddress', 'companyPhone'))
       OR (c.column_name IS NOT NULL AND c.udt_name <> expected.udt)
       OR (NOT expected.nullable AND c.is_nullable <> 'NO');
  IF incompatible IS NOT NULL THEN
   RAISE EXCEPTION 'Existing DocumentTerms has incompatible/missing columns: %. Preserve it and inspect information_schema.columns before adapting this migration.', incompatible;
  END IF;
 END IF;
END $$;

-- Only the first application backfills versions. Retrying must preserve later revisions.
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
                AND table_name = 'Estimate' AND column_name = 'version') THEN
  ALTER TABLE "Estimate" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE "Estimate" ADD COLUMN IF NOT EXISTS "supersedesId" TEXT;
  WITH ordered AS (
   SELECT id, ROW_NUMBER() OVER (PARTITION BY "jobCardId" ORDER BY "createdAt", id)::integer AS version,
          LAG(id) OVER (PARTITION BY "jobCardId" ORDER BY "createdAt", id) AS previous
   FROM "Estimate" WHERE "jobCardId" IS NOT NULL
  ) UPDATE "Estimate" e SET "version" = o.version, "supersedesId" = o.previous
    FROM ordered o WHERE e.id = o.id;
  UPDATE "Estimate" SET "status" = 'SUPERSEDED'
   WHERE id IN (SELECT "supersedesId" FROM "Estimate" WHERE "supersedesId" IS NOT NULL);
 END IF;
END $$;
ALTER TABLE "Estimate" ADD COLUMN IF NOT EXISTS "supersedesId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Estimate_supersedesId_key" ON "Estimate"("supersedesId");
CREATE INDEX IF NOT EXISTS "Estimate_jobCardId_version_idx" ON "Estimate"("jobCardId", "version");
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"Estimate"'::regclass AND conname = 'Estimate_supersedesId_fkey') THEN
  ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "Estimate"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
 END IF;
END $$;
ALTER TABLE "CustomerApproval" ADD COLUMN IF NOT EXISTS "signatureRequired" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS "overrideReason" TEXT;
ALTER TABLE "CustomerApproval" ALTER COLUMN "signatureRequired" SET DEFAULT true;
CREATE TABLE IF NOT EXISTS "EstimateSignature" (
 "id" TEXT NOT NULL PRIMARY KEY, "estimateId" TEXT NOT NULL, "approvalId" TEXT NOT NULL,
 "imageReference" TEXT NOT NULL, "signerName" TEXT NOT NULL, "relationship" TEXT, "capturedByUserId" TEXT,
 "deviceOrIp" TEXT NOT NULL, "estimateVersion" INTEGER NOT NULL, "totalSigned" DOUBLE PRECISION NOT NULL,
 "contentHash" TEXT NOT NULL, "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "channel" TEXT NOT NULL DEFAULT 'COUNTER', "consentStatement" TEXT,
 CONSTRAINT "EstimateSignature_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "EstimateSignature_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "CustomerApproval"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "EstimateSignature_capturedByUserId_fkey" FOREIGN KEY ("capturedByUserId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "EstimateSignature_approvalId_key" ON "EstimateSignature"("approvalId");
CREATE INDEX IF NOT EXISTS "EstimateSignature_estimateId_idx" ON "EstimateSignature"("estimateId");

-- Keep pre-existing compatible terms and add only missing optional header fields.
CREATE TABLE IF NOT EXISTS "DocumentTerms" (
 "id" TEXT NOT NULL PRIMARY KEY, "type" TEXT NOT NULL, "branchId" TEXT,
 "terms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "footer" TEXT, "companyName" TEXT,
 "companyAddress" TEXT, "companyPhone" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "DocumentTerms_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
ALTER TABLE "DocumentTerms"
 ADD COLUMN IF NOT EXISTS "companyName" TEXT,
 ADD COLUMN IF NOT EXISTS "companyAddress" TEXT,
 ADD COLUMN IF NOT EXISTS "companyPhone" TEXT;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"DocumentTerms"'::regclass AND conname = 'DocumentTerms_branchId_fkey') THEN
  ALTER TABLE "DocumentTerms" ADD CONSTRAINT "DocumentTerms_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "DocumentTerms_type_branchId_key" ON "DocumentTerms"("type", "branchId");
CREATE INDEX IF NOT EXISTS "DocumentTerms_type_idx" ON "DocumentTerms"("type");
CREATE UNIQUE INDEX IF NOT EXISTS "DocumentTerms_company_type_key" ON "DocumentTerms"("type") WHERE "branchId" IS NULL;

COMMIT;

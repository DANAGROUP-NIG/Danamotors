-- Additive migration; reuse estimate number/date/standalone columns from issue 79.
ALTER TABLE "Estimate" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "supersedesId" TEXT;
-- Preserve existing order and approvals across historical revisions.
WITH ordered AS (SELECT id, ROW_NUMBER() OVER (PARTITION BY "jobCardId" ORDER BY "createdAt", id)::integer AS version, LAG(id) OVER (PARTITION BY "jobCardId" ORDER BY "createdAt", id) AS previous FROM "Estimate" WHERE "jobCardId" IS NOT NULL)
UPDATE "Estimate" e SET "version" = o.version, "supersedesId" = o.previous FROM ordered o WHERE e.id = o.id;
UPDATE "Estimate" SET "status" = 'SUPERSEDED' WHERE id IN (SELECT "supersedesId" FROM "Estimate" WHERE "supersedesId" IS NOT NULL);
CREATE UNIQUE INDEX "Estimate_supersedesId_key" ON "Estimate"("supersedesId");
CREATE INDEX "Estimate_jobCardId_version_idx" ON "Estimate"("jobCardId", "version");
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "Estimate"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerApproval" ADD COLUMN "signatureRequired" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "overrideReason" TEXT;
ALTER TABLE "CustomerApproval" ALTER COLUMN "signatureRequired" SET DEFAULT true;
CREATE TABLE "EstimateSignature" (
 "id" TEXT NOT NULL PRIMARY KEY, "estimateId" TEXT NOT NULL, "approvalId" TEXT NOT NULL,
 "imageReference" TEXT NOT NULL, "signerName" TEXT NOT NULL, "relationship" TEXT, "capturedByUserId" TEXT,
 "deviceOrIp" TEXT NOT NULL, "estimateVersion" INTEGER NOT NULL, "totalSigned" DOUBLE PRECISION NOT NULL,
 "contentHash" TEXT NOT NULL, "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "channel" TEXT NOT NULL DEFAULT 'COUNTER', "consentStatement" TEXT,
 CONSTRAINT "EstimateSignature_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "EstimateSignature_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "CustomerApproval"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "EstimateSignature_capturedByUserId_fkey" FOREIGN KEY ("capturedByUserId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EstimateSignature_approvalId_key" ON "EstimateSignature"("approvalId");
CREATE INDEX "EstimateSignature_estimateId_idx" ON "EstimateSignature"("estimateId");

-- This checkout has no DocumentTerms model despite the issue's reference to it.
CREATE TABLE "DocumentTerms" (
 "id" TEXT NOT NULL PRIMARY KEY, "type" TEXT NOT NULL, "branchId" TEXT,
 "terms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "footer" TEXT, "companyName" TEXT,
 "companyAddress" TEXT, "companyPhone" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "DocumentTerms_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DocumentTerms_type_branchId_key" ON "DocumentTerms"("type", "branchId");
CREATE INDEX "DocumentTerms_type_idx" ON "DocumentTerms"("type");
CREATE UNIQUE INDEX "DocumentTerms_company_type_key" ON "DocumentTerms"("type") WHERE "branchId" IS NULL;

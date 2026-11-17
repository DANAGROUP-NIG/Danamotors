-- Existing jobs retain their historical workflow. Only new jobs require signed opening approval.
ALTER TABLE "JobCard" ADD COLUMN "openingSignatureRequired" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "JobCard" ALTER COLUMN "openingSignatureRequired" SET DEFAULT TRUE;

CREATE TABLE "JobOpeningSignature" (
  "id" TEXT PRIMARY KEY,
  "jobCardId" TEXT NOT NULL REFERENCES "JobCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "revision" INTEGER NOT NULL CHECK ("revision" > 0),
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "documentHash" CHAR(64) NOT NULL,
  "scopeHash" CHAR(64) NOT NULL,
  "evidenceHash" CHAR(64) NOT NULL,
  "snapshot" JSONB NOT NULL,
  "signerName" TEXT NOT NULL,
  "relationship" TEXT,
  "capturedById" TEXT NOT NULL,
  "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "signatureImage" TEXT NOT NULL CHECK (octet_length("signatureImage") <= 88000),
  UNIQUE ("jobCardId", "revision")
);

CREATE TYPE "CsiSurveyStatus" AS ENUM ('ISSUED', 'RESPONDED');
CREATE UNIQUE INDEX "JobCard_branchId_id_key" ON "JobCard"("branchId", "id");
CREATE TABLE "CsiSurvey" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "jobCardId" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "generatedById" TEXT NOT NULL,
  "status" "CsiSurveyStatus" NOT NULL DEFAULT 'ISSUED',
  "jobSnapshot" JSONB NOT NULL,
  CONSTRAINT "CsiSurvey_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CsiSurvey_jobCard_fkey" FOREIGN KEY ("branchId", "jobCardId") REFERENCES "JobCard"("branchId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CsiSurvey_revision_fkey" FOREIGN KEY ("branchId", "revisionId") REFERENCES "CsiCardRevision"("branchId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CsiSurvey_jobCardId_key" ON "CsiSurvey"("jobCardId");
CREATE UNIQUE INDEX "CsiSurvey_branchId_jobCardId_key" ON "CsiSurvey"("branchId", "jobCardId");
CREATE UNIQUE INDEX "CsiSurvey_branchId_id_key" ON "CsiSurvey"("branchId", "id");
CREATE INDEX "CsiSurvey_branchId_generatedAt_id_idx" ON "CsiSurvey"("branchId", "generatedAt", "id");

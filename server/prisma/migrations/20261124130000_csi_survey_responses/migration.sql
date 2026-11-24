ALTER TABLE "CsiSurvey"
  ADD COLUMN "responseDate" DATE,
  ADD COLUMN "comments" TEXT,
  ADD COLUMN "enteredById" TEXT,
  ADD COLUMN "score" DECIMAL(12,6),
  ADD COLUMN "scorePercent" DECIMAL(9,6),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "CsiSurvey_branchId_responseDate_id_idx" ON "CsiSurvey"("branchId", "responseDate", "id");
CREATE TABLE "CsiSurveyAnswer" (
  "surveyId" TEXT NOT NULL,
  "attributeId" TEXT NOT NULL,
  "responseId" TEXT NOT NULL,
  "attributeDescription" TEXT NOT NULL,
  "weightage" DECIMAL(7,6) NOT NULL,
  "responseDescription" TEXT NOT NULL,
  "marks" DECIMAL(12,6) NOT NULL,
  CONSTRAINT "CsiSurveyAnswer_pkey" PRIMARY KEY ("surveyId", "attributeId"),
  CONSTRAINT "CsiSurveyAnswer_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "CsiSurvey"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CsiSurveyAnswer_weight_check" CHECK ("weightage" >= 0 AND "weightage" <= 1),
  CONSTRAINT "CsiSurveyAnswer_marks_check" CHECK ("marks" > 0)
);
CREATE INDEX "CsiSurveyAnswer_attributeId_responseId_idx" ON "CsiSurveyAnswer"("attributeId", "responseId");

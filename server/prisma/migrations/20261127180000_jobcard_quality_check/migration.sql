-- Job card revamp phase 7: quality check.
-- The QC result moves from JobCard.qcStatus / qcNotes onto Inspection rows (additive; the old columns
-- are dropped separately in 20261127180200_jobcard_drop_qc_columns). A job's QC result is its
-- current inspection (supersededAt IS NULL); none means pending, and a job billed for the
-- estimation charge only needs none.

CREATE TYPE "InspectionResult" AS ENUM ('PASSED', 'FAILED');

ALTER TABLE "Inspection"
  ADD COLUMN "result" "InspectionResult",
  ADD COLUMN "checks" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "roadTestStartKm" INTEGER,
  ADD COLUMN "roadTestEndKm" INTEGER,
  ADD COLUMN "roadTestNotes" TEXT,
  ADD COLUMN "acOutletTempC" DECIMAL(4,1),
  ADD COLUMN "certifiedById" TEXT,
  ADD COLUMN "certifiedAt" TIMESTAMP(3),
  ADD COLUMN "supersededAt" TIMESTAMP(3),
  ADD COLUMN "requestId" TEXT;

-- Older free-form inspection rows never decided the job's QC result (JobCard.qcStatus did).
-- Keep the decided ones as history only (superseded), with their findings in the notes.
-- Rows that never recorded an outcome carry no result and are removed.
UPDATE "Inspection"
SET "result" = CASE
      WHEN "passed" IS TRUE OR upper("status") IN ('PASSED', 'PASS') THEN 'PASSED'::"InspectionResult"
      WHEN "passed" IS FALSE OR upper("status") IN ('FAILED', 'FAIL') THEN 'FAILED'::"InspectionResult"
    END,
    "notes" = NULLIF(concat_ws(E'\n', NULLIF(btrim("findings"), ''), NULLIF(btrim("notes"), '')), ''),
    "supersededAt" = CURRENT_TIMESTAMP;
DELETE FROM "Inspection" WHERE "result" IS NULL;
UPDATE "Inspection" i SET "inspectorId" = NULL
WHERE "inspectorId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = i."inspectorId");
-- The old free-form columns are no longer written; they are dropped in 20261127180200.
ALTER TABLE "Inspection" ALTER COLUMN "findings" DROP NOT NULL;

-- The job's recorded QC result becomes its current inspection, so billing readiness is unchanged.
-- PENDING (any spelling) needs no row; NOT_REQUIRED is derived from the added estimation charge.
INSERT INTO "Inspection" ("id", "jobCardId", "inspectorId", "result", "checks", "notes", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, j.id,
       CASE WHEN EXISTS (SELECT 1 FROM "User" u WHERE u.id = j."qualityInspectorId") THEN j."qualityInspectorId" END,
       CASE upper(j."qcStatus") WHEN 'PASSED' THEN 'PASSED'::"InspectionResult" ELSE 'FAILED'::"InspectionResult" END,
       '{}'::jsonb, NULLIF(btrim(j."qcNotes"), ''),
       COALESCE(j."readyAt", j."updatedAt"), CURRENT_TIMESTAMP
FROM "JobCard" j
WHERE upper(j."qcStatus") IN ('PASSED', 'FAILED');

ALTER TABLE "Inspection" ALTER COLUMN "result" SET NOT NULL;

DROP INDEX "Inspection_jobCardId_idx";
CREATE INDEX "Inspection_jobCardId_supersededAt_idx" ON "Inspection"("jobCardId", "supersededAt");
CREATE UNIQUE INDEX "Inspection_jobCardId_requestId_key" ON "Inspection"("jobCardId", "requestId");
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_certifiedById_fkey" FOREIGN KEY ("certifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The certification signature, apart from the inspection so normal responses never carry the image.
CREATE TABLE "InspectionSignature" (
    "inspectionId" TEXT NOT NULL,
    "signerId" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contentHash" CHAR(64) NOT NULL,
    "signatureImage" TEXT NOT NULL,

    CONSTRAINT "InspectionSignature_pkey" PRIMARY KEY ("inspectionId")
);
ALTER TABLE "InspectionSignature" ADD CONSTRAINT "InspectionSignature_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Work lines reopened by a failed quality check.
ALTER TABLE "JobWorkLine" ADD COLUMN "reopenedAt" TIMESTAMP(3);

-- Job notifications: the capture trigger no longer watches the dropped QC columns. QC review notices
-- (passed, failed) are queued by the quality check service with the inspection.
CREATE OR REPLACE FUNCTION capture_jobcard_notification() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  previous JSONB := NULL;
  actor TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(OLD.status, OLD."technicianId", OLD."qualityInspectorId") IS NOT DISTINCT FROM
       ROW(NEW.status, NEW."technicianId", NEW."qualityInspectorId") THEN RETURN NULL; END IF;
    previous := to_jsonb(OLD);
  END IF;
  actor := NULLIF(current_setting('app.notification_actor', true), '');
  IF actor IS NULL THEN
    SELECT h."actorId" INTO actor FROM "JobCardStatusHistory" h
    WHERE h."jobCardId" = NEW.id AND h."toStatus" = NEW.status
      AND h.xmin::text::bigint = (txid_current() % 4294967296)
    ORDER BY h."createdAt" DESC, h.id DESC LIMIT 1;
  END IF;
  IF TG_OP = 'INSERT' THEN actor := COALESCE(actor, NEW."createdById"); END IF;
  INSERT INTO jobcard_notification_events(id, "jobCardId", "actorId", before, after, "createdAt")
    VALUES (gen_random_uuid()::text, NEW.id, actor, previous, to_jsonb(NEW), clock_timestamp() AT TIME ZONE 'UTC');
  RETURN NULL;
END $$;

-- JobCard.qcStatus and qcNotes are no longer read or written; they are dropped in 20261127180200.

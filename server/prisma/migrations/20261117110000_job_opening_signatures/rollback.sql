-- Roll back application code first. Export/retain signed evidence before dropping storage.
DROP TABLE "JobOpeningSignature";
ALTER TABLE "JobCard" DROP COLUMN "openingSignatureRequired";

-- Job card revamp, phase 12: drop the columns the revamp made obsolete.
-- No data conversion is needed:
--   "depositReceiptId": never written since advances moved to Receipt."advanceJobCardId" (0 rows set on the server and locally).
--   "progress": the old percentage, replaced by the job's step ("stage"); the customer portal now shows the step.
--   "estimatedHours": only ever filled by the portal sample data; no screen records it.

-- DropForeignKey
ALTER TABLE "JobCard" DROP CONSTRAINT "JobCard_depositReceiptId_fkey";

-- DropIndex
DROP INDEX "JobCard_depositReceiptId_key";

-- AlterTable
ALTER TABLE "JobCard" DROP COLUMN "depositReceiptId",
DROP COLUMN "estimatedHours",
DROP COLUMN "progress";

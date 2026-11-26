-- Job card revamp phase 2: check-in (details, walk-around, customer consent).
-- Adds the check-in record, damage marks and database photo storage, records a representative's
-- phone on the opening signature, and moves the old free-text JobCard.checklist into the check-in.

-- CreateEnum
CREATE TYPE "FuelLevel" AS ENUM ('EMPTY', 'QUARTER', 'HALF', 'THREE_QUARTER', 'FULL');

-- CreateEnum
CREATE TYPE "DamageType" AS ENUM ('CRACK', 'DENT', 'SCRATCH');

-- CreateEnum
CREATE TYPE "JobPhotoCategory" AS ENUM ('CHECK_IN', 'DAMAGE');

-- AlterTable
ALTER TABLE "JobOpeningSignature" ADD COLUMN     "signerPhone" TEXT;

-- CreateTable
CREATE TABLE "JobCheckIn" (
    "jobCardId" TEXT NOT NULL,
    "fuelLevel" "FuelLevel",
    "checklist" JSONB NOT NULL DEFAULT '{}',
    "checklistNote" TEXT,
    "serviceBookSeen" BOOLEAN NOT NULL DEFAULT false,
    "serviceBookStamps" INTEGER,
    "noValuables" BOOLEAN NOT NULL DEFAULT false,
    "belongingsNote" TEXT,
    "instructionsToTechnician" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,

    CONSTRAINT "JobCheckIn_pkey" PRIMARY KEY ("jobCardId")
);

-- CreateTable
CREATE TABLE "JobDamageMark" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "type" "DamageType" NOT NULL,
    "x" DECIMAL(5,2) NOT NULL,
    "y" DECIMAL(5,2) NOT NULL,
    "note" TEXT,
    "photoId" TEXT,
    "requestId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobDamageMark_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "JobDamageMark_x_check" CHECK ("x" >= 0 AND "x" <= 100),
    CONSTRAINT "JobDamageMark_y_check" CHECK ("y" >= 0 AND "y" <= 100)
);

-- CreateTable
CREATE TABLE "JobPhoto" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "category" "JobPhotoCategory" NOT NULL,
    "slot" TEXT,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "data" BYTEA NOT NULL,
    "requestId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobDamageMark_photoId_key" ON "JobDamageMark"("photoId");

-- CreateIndex
CREATE INDEX "JobDamageMark_jobCardId_createdAt_idx" ON "JobDamageMark"("jobCardId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobDamageMark_jobCardId_requestId_key" ON "JobDamageMark"("jobCardId", "requestId");

-- CreateIndex
CREATE INDEX "JobPhoto_jobCardId_category_idx" ON "JobPhoto"("jobCardId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "JobPhoto_jobCardId_requestId_key" ON "JobPhoto"("jobCardId", "requestId");

-- AddForeignKey
ALTER TABLE "JobCheckIn" ADD CONSTRAINT "JobCheckIn_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobDamageMark" ADD CONSTRAINT "JobDamageMark_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobDamageMark" ADD CONSTRAINT "JobDamageMark_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "JobPhoto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPhoto" ADD CONSTRAINT "JobPhoto_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data: the old free-text checklist becomes the check-in's checklist note. The 25-item states are
-- new, so existing jobs start with none recorded (shown as "Not provided").
INSERT INTO "JobCheckIn" ("jobCardId", "checklistNote", "updatedAt", "createdAt")
SELECT "id", btrim("checklist"), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "JobCard"
WHERE "checklist" IS NOT NULL AND btrim("checklist") <> '';

-- AlterTable
ALTER TABLE "JobCard" DROP COLUMN "checklist";

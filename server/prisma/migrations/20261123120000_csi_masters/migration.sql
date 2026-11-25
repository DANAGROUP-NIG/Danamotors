-- CreateEnum
CREATE TYPE "CsiApplicability" AS ENUM ('NON_ACCIDENTAL', 'ACCIDENTAL', 'BOTH');

-- CreateTable
CREATE TABLE "CsiAttribute" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "weightage" DECIMAL(7,6) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CsiAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsiResponse" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "marks" DECIMAL(12,6) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CsiResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsiCard" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CsiCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsiCardRevision" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cardDate" DATE NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "appliesTo" "CsiApplicability" NOT NULL,

    CONSTRAINT "CsiCardRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsiCardAttribute" (
    "branchId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "weightage" DECIMAL(7,6) NOT NULL,

    CONSTRAINT "CsiCardAttribute_pkey" PRIMARY KEY ("revisionId","attributeId")
);

-- CreateTable
CREATE TABLE "CsiCardResponse" (
    "branchId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "marks" DECIMAL(12,6) NOT NULL,

    CONSTRAINT "CsiCardResponse_pkey" PRIMARY KEY ("revisionId","responseId")
);

-- Validate stored values
ALTER TABLE "CsiAttribute" ADD CONSTRAINT "CsiAttribute_weightage_range" CHECK ("weightage" BETWEEN 0 AND 1);
ALTER TABLE "CsiResponse" ADD CONSTRAINT "CsiResponse_positive_marks" CHECK ("marks" > 0);
ALTER TABLE "CsiCardAttribute" ADD CONSTRAINT "CsiCardAttribute_valid_values" CHECK ("weightage" BETWEEN 0 AND 1 AND "sequence" > 0);
ALTER TABLE "CsiCardResponse" ADD CONSTRAINT "CsiCardResponse_valid_values" CHECK ("marks" > 0 AND "sequence" > 0);

-- CreateIndex
CREATE UNIQUE INDEX "CsiAttribute_branchId_code_key" ON "CsiAttribute"("branchId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CsiAttribute_branchId_id_key" ON "CsiAttribute"("branchId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CsiResponse_branchId_code_key" ON "CsiResponse"("branchId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CsiResponse_branchId_id_key" ON "CsiResponse"("branchId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CsiCard_branchId_code_key" ON "CsiCard"("branchId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CsiCard_branchId_id_key" ON "CsiCard"("branchId", "id");

-- CreateIndex
CREATE INDEX "CsiCardRevision_branchId_appliesTo_effectiveDate_idx" ON "CsiCardRevision"("branchId", "appliesTo", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "CsiCardRevision_cardId_version_key" ON "CsiCardRevision"("cardId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CsiCardRevision_branchId_id_key" ON "CsiCardRevision"("branchId", "id");

-- CreateIndex
CREATE INDEX "CsiCardAttribute_branchId_attributeId_idx" ON "CsiCardAttribute"("branchId", "attributeId");

-- CreateIndex
CREATE UNIQUE INDEX "CsiCardAttribute_revisionId_sequence_key" ON "CsiCardAttribute"("revisionId", "sequence");

-- CreateIndex
CREATE INDEX "CsiCardResponse_branchId_responseId_idx" ON "CsiCardResponse"("branchId", "responseId");

-- CreateIndex
CREATE UNIQUE INDEX "CsiCardResponse_revisionId_sequence_key" ON "CsiCardResponse"("revisionId", "sequence");

-- AddForeignKey
ALTER TABLE "CsiAttribute" ADD CONSTRAINT "CsiAttribute_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsiResponse" ADD CONSTRAINT "CsiResponse_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsiCard" ADD CONSTRAINT "CsiCard_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsiCardRevision" ADD CONSTRAINT "CsiCardRevision_branchId_cardId_fkey" FOREIGN KEY ("branchId", "cardId") REFERENCES "CsiCard"("branchId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsiCardAttribute" ADD CONSTRAINT "CsiCardAttribute_branchId_revisionId_fkey" FOREIGN KEY ("branchId", "revisionId") REFERENCES "CsiCardRevision"("branchId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsiCardAttribute" ADD CONSTRAINT "CsiCardAttribute_branchId_attributeId_fkey" FOREIGN KEY ("branchId", "attributeId") REFERENCES "CsiAttribute"("branchId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsiCardResponse" ADD CONSTRAINT "CsiCardResponse_branchId_revisionId_fkey" FOREIGN KEY ("branchId", "revisionId") REFERENCES "CsiCardRevision"("branchId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsiCardResponse" ADD CONSTRAINT "CsiCardResponse_branchId_responseId_fkey" FOREIGN KEY ("branchId", "responseId") REFERENCES "CsiResponse"("branchId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


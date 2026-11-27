ALTER TABLE "PartIssuance"
    ADD COLUMN "workflowRequestId" TEXT,
    ADD COLUMN "workflowRequestHash" TEXT;
CREATE UNIQUE INDEX "PartIssuance_jobCardId_workflowRequestId_key"
    ON "PartIssuance"("jobCardId", "workflowRequestId");

ALTER TABLE "PartRequisition"
    ADD COLUMN "workflowRequestId" TEXT,
    ADD COLUMN "workflowRequestHash" TEXT;
CREATE UNIQUE INDEX "PartRequisition_jobCardId_workflowRequestId_key"
    ON "PartRequisition"("jobCardId", "workflowRequestId");

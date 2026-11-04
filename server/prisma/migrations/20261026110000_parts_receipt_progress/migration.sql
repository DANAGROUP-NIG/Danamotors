ALTER TABLE "PartIssuance" ADD COLUMN "receivedById" TEXT, ADD COLUMN "receivedAt" TIMESTAMP(3);
ALTER TABLE "PartIssuance" ADD CONSTRAINT "PartIssuance_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "JobCard_technicianId_status_idx" ON "JobCard"("technicianId", "status");

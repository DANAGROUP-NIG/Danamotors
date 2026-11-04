ALTER TABLE "Estimate" ADD COLUMN "upfrontPaymentPercent" DECIMAL(5,2) NOT NULL DEFAULT 60;
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_upfrontPaymentPercent_check" CHECK ("upfrontPaymentPercent" BETWEEN 0 AND 100);
ALTER TABLE "JobCard" ADD COLUMN "depositReceiptId" TEXT;
CREATE UNIQUE INDEX "JobCard_depositReceiptId_key" ON "JobCard"("depositReceiptId");
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_depositReceiptId_fkey" FOREIGN KEY ("depositReceiptId") REFERENCES "Receipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

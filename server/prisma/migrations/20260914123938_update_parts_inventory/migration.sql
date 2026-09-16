/*
  Warnings:

  - Added the required column `branchId` to the `PartIssuance` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."PartIssuance" DROP CONSTRAINT "PartIssuance_issuedById_fkey";

-- DropForeignKey
ALTER TABLE "public"."PartIssuance" DROP CONSTRAINT "PartIssuance_sparePartId_fkey";

-- DropForeignKey
ALTER TABLE "public"."PartReturn" DROP CONSTRAINT "PartReturn_partIssuanceId_fkey";

-- DropForeignKey
ALTER TABLE "public"."PartReturn" DROP CONSTRAINT "PartReturn_returnedById_fkey";

-- DropForeignKey
ALTER TABLE "public"."PurchaseRequest" DROP CONSTRAINT "PurchaseRequest_requestedById_fkey";

-- DropForeignKey
ALTER TABLE "public"."PurchaseRequest" DROP CONSTRAINT "PurchaseRequest_sparePartId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Receipt" DROP CONSTRAINT "Receipt_issuedById_fkey";

-- DropForeignKey
ALTER TABLE "public"."StockTransaction" DROP CONSTRAINT "StockTransaction_partId_fkey";

-- AlterTable
ALTER TABLE "public"."PartIssuance" ADD COLUMN     "branchId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Customer_branchId_idx" ON "public"."Customer"("branchId");

-- CreateIndex
CREATE INDEX "CustomerApproval_estimateId_idx" ON "public"."CustomerApproval"("estimateId");

-- CreateIndex
CREATE INDEX "CustomerApproval_customerId_idx" ON "public"."CustomerApproval"("customerId");

-- CreateIndex
CREATE INDEX "CustomerCreditApplication_requestedById_idx" ON "public"."CustomerCreditApplication"("requestedById");

-- CreateIndex
CREATE INDEX "CustomerCreditTransaction_referenceId_idx" ON "public"."CustomerCreditTransaction"("referenceId");

-- CreateIndex
CREATE INDEX "CustomerDocument_customerId_idx" ON "public"."CustomerDocument"("customerId");

-- CreateIndex
CREATE INDEX "Estimate_jobCardId_idx" ON "public"."Estimate"("jobCardId");

-- CreateIndex
CREATE INDEX "Inspection_jobCardId_idx" ON "public"."Inspection"("jobCardId");

-- CreateIndex
CREATE INDEX "InterBranchTransfer_requestingBranchId_idx" ON "public"."InterBranchTransfer"("requestingBranchId");

-- CreateIndex
CREATE INDEX "InterBranchTransfer_sourceBranchId_idx" ON "public"."InterBranchTransfer"("sourceBranchId");

-- CreateIndex
CREATE INDEX "InterBranchTransfer_requestedById_idx" ON "public"."InterBranchTransfer"("requestedById");

-- CreateIndex
CREATE INDEX "InterBranchTransfer_status_idx" ON "public"."InterBranchTransfer"("status");

-- CreateIndex
CREATE INDEX "InterBranchTransferItem_transferId_idx" ON "public"."InterBranchTransferItem"("transferId");

-- CreateIndex
CREATE INDEX "InterBranchTransferItem_partId_idx" ON "public"."InterBranchTransferItem"("partId");

-- CreateIndex
CREATE INDEX "InventoryStock_partId_idx" ON "public"."InventoryStock"("partId");

-- CreateIndex
CREATE INDEX "InventoryStock_branchId_idx" ON "public"."InventoryStock"("branchId");

-- CreateIndex
CREATE INDEX "Invoice_customerId_idx" ON "public"."Invoice"("customerId");

-- CreateIndex
CREATE INDEX "Invoice_jobCardId_idx" ON "public"."Invoice"("jobCardId");

-- CreateIndex
CREATE INDEX "JobCard_branchId_idx" ON "public"."JobCard"("branchId");

-- CreateIndex
CREATE INDEX "JobCard_customerId_idx" ON "public"."JobCard"("customerId");

-- CreateIndex
CREATE INDEX "JobCard_vehicleId_idx" ON "public"."JobCard"("vehicleId");

-- CreateIndex
CREATE INDEX "JobCard_appointmentId_idx" ON "public"."JobCard"("appointmentId");

-- CreateIndex
CREATE INDEX "PartIssuance_branchId_idx" ON "public"."PartIssuance"("branchId");

-- CreateIndex
CREATE INDEX "PartIssuance_sparePartId_idx" ON "public"."PartIssuance"("sparePartId");

-- CreateIndex
CREATE INDEX "PartIssuance_jobCardId_idx" ON "public"."PartIssuance"("jobCardId");

-- CreateIndex
CREATE INDEX "PartIssuance_issuedById_idx" ON "public"."PartIssuance"("issuedById");

-- CreateIndex
CREATE INDEX "PartIssuance_issuedAt_idx" ON "public"."PartIssuance"("issuedAt");

-- CreateIndex
CREATE INDEX "PartReturn_partIssuanceId_idx" ON "public"."PartReturn"("partIssuanceId");

-- CreateIndex
CREATE INDEX "PartReturn_returnedById_idx" ON "public"."PartReturn"("returnedById");

-- CreateIndex
CREATE INDEX "PartReturn_status_idx" ON "public"."PartReturn"("status");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "public"."Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_recordedById_idx" ON "public"."Payment"("recordedById");

-- CreateIndex
CREATE INDEX "PurchaseRequest_sparePartId_idx" ON "public"."PurchaseRequest"("sparePartId");

-- CreateIndex
CREATE INDEX "PurchaseRequest_requestedById_idx" ON "public"."PurchaseRequest"("requestedById");

-- CreateIndex
CREATE INDEX "PurchaseRequest_status_idx" ON "public"."PurchaseRequest"("status");

-- CreateIndex
CREATE INDEX "Receipt_invoiceId_idx" ON "public"."Receipt"("invoiceId");

-- CreateIndex
CREATE INDEX "Receipt_issuedById_idx" ON "public"."Receipt"("issuedById");

-- CreateIndex
CREATE INDEX "ServiceAppointment_branchId_idx" ON "public"."ServiceAppointment"("branchId");

-- CreateIndex
CREATE INDEX "ServiceAppointment_customerId_idx" ON "public"."ServiceAppointment"("customerId");

-- CreateIndex
CREATE INDEX "ServiceAppointment_vehicleId_idx" ON "public"."ServiceAppointment"("vehicleId");

-- CreateIndex
CREATE INDEX "ServiceHistory_customerId_idx" ON "public"."ServiceHistory"("customerId");

-- CreateIndex
CREATE INDEX "StockTransaction_branchId_idx" ON "public"."StockTransaction"("branchId");

-- CreateIndex
CREATE INDEX "StockTransaction_partId_idx" ON "public"."StockTransaction"("partId");

-- CreateIndex
CREATE INDEX "StockTransaction_type_idx" ON "public"."StockTransaction"("type");

-- CreateIndex
CREATE INDEX "StockTransaction_referenceId_idx" ON "public"."StockTransaction"("referenceId");

-- CreateIndex
CREATE INDEX "StockTransaction_createdAt_idx" ON "public"."StockTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "Vehicle_customerId_idx" ON "public"."Vehicle"("customerId");

-- CreateIndex
CREATE INDEX "VehicleImage_vehicleId_idx" ON "public"."VehicleImage"("vehicleId");

-- CreateIndex
CREATE INDEX "VehicleOwnership_vehicleId_idx" ON "public"."VehicleOwnership"("vehicleId");

-- CreateIndex
CREATE INDEX "VehicleOwnership_customerId_idx" ON "public"."VehicleOwnership"("customerId");

-- AddForeignKey
ALTER TABLE "public"."StockTransaction" ADD CONSTRAINT "StockTransaction_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockTransaction" ADD CONSTRAINT "StockTransaction_partId_fkey" FOREIGN KEY ("partId") REFERENCES "public"."SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_sparePartId_fkey" FOREIGN KEY ("sparePartId") REFERENCES "public"."SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PartIssuance" ADD CONSTRAINT "PartIssuance_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PartIssuance" ADD CONSTRAINT "PartIssuance_sparePartId_fkey" FOREIGN KEY ("sparePartId") REFERENCES "public"."SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PartIssuance" ADD CONSTRAINT "PartIssuance_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PartReturn" ADD CONSTRAINT "PartReturn_partIssuanceId_fkey" FOREIGN KEY ("partIssuanceId") REFERENCES "public"."PartIssuance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PartReturn" ADD CONSTRAINT "PartReturn_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Receipt" ADD CONSTRAINT "Receipt_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

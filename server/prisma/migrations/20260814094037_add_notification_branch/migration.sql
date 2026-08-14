-- AlterTable
ALTER TABLE "public"."Notification" ADD COLUMN     "branchId" TEXT;

-- CreateIndex
CREATE INDEX "Notification_branchId_readAt_idx" ON "public"."Notification"("branchId", "readAt");

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

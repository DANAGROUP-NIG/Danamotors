-- DropForeignKey
ALTER TABLE "public"."Payment" DROP CONSTRAINT "Payment_recordedById_fkey";

-- AlterTable
ALTER TABLE "public"."Payment" ALTER COLUMN "recordedById" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

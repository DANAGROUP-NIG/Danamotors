-- CreateEnum
CREATE TYPE "PartRole" AS ENUM ('MAIN', 'ALTERNATE');

-- AlterTable
ALTER TABLE "SparePart" ADD COLUMN     "mainPartId" TEXT,
ADD COLUMN     "role" "PartRole" NOT NULL DEFAULT 'MAIN';

-- AddForeignKey
ALTER TABLE "SparePart" ADD CONSTRAINT "SparePart_mainPartId_fkey" FOREIGN KEY ("mainPartId") REFERENCES "SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

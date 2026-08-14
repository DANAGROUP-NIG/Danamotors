-- AlterTable
ALTER TABLE "public"."Customer" ADD COLUMN     "creditBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "public"."CustomerCreditTransaction" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "referenceId" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerCreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CustomerCreditApplication" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "comments" TEXT,
    "decisionDate" TIMESTAMP(3),
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerCreditApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerCreditTransaction_customerId_createdAt_idx" ON "public"."CustomerCreditTransaction"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerCreditApplication_customerId_status_idx" ON "public"."CustomerCreditApplication"("customerId", "status");

-- CreateIndex
CREATE INDEX "CustomerCreditApplication_invoiceId_idx" ON "public"."CustomerCreditApplication"("invoiceId");

-- AddForeignKey
ALTER TABLE "public"."CustomerCreditTransaction" ADD CONSTRAINT "CustomerCreditTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomerCreditTransaction" ADD CONSTRAINT "CustomerCreditTransaction_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomerCreditApplication" ADD CONSTRAINT "CustomerCreditApplication_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomerCreditApplication" ADD CONSTRAINT "CustomerCreditApplication_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomerCreditApplication" ADD CONSTRAINT "CustomerCreditApplication_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

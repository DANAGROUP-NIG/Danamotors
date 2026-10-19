-- Line-level cancellation of pending orders (legacy Data Management: Customer Purchase Order
-- Cancellation, Branch Indent From / To Other Branch Cancellation). Legacy recorded the cancelled
-- quantity, who, when and why on each order line.

-- AlterTable
ALTER TABLE "CustomerOrderLine" ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelledById" TEXT,
ADD COLUMN "cancelRemark" TEXT;

-- AlterTable
ALTER TABLE "BranchIndentLine" ADD COLUMN "cancelledQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelledById" TEXT,
ADD COLUMN "cancelRemark" TEXT;

-- AddForeignKey
ALTER TABLE "CustomerOrderLine" ADD CONSTRAINT "CustomerOrderLine_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchIndentLine" ADD CONSTRAINT "BranchIndentLine_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indents cancelled before this change: every line was cancelled whole (nothing had shipped).
UPDATE "BranchIndentLine" l
SET "cancelledQuantity" = l."requestedQuantity" - l."dispatchedQuantity",
    "approvedQuantity" = CASE WHEN l."approvedQuantity" IS NULL THEN NULL ELSE l."dispatchedQuantity" END,
    "backOrderQuantity" = 0,
    "cancelledAt" = i."cancelledAt",
    "cancelledById" = i."cancelledById",
    "cancelRemark" = i."cancellationReason"
FROM "BranchIndent" i
WHERE i."id" = l."indentId" AND i."status" = 'CANCELLED';

-- A line can never ship and cancel more than was requested; once approved, approved and
-- cancelled together stay within the request.
ALTER TABLE "BranchIndentLine" ADD CONSTRAINT "BranchIndentLine_cancelled_check"
  CHECK ("cancelledQuantity" >= 0
     AND "dispatchedQuantity" + "cancelledQuantity" <= "requestedQuantity"
     AND ("approvedQuantity" IS NULL OR "approvedQuantity" + "cancelledQuantity" <= "requestedQuantity"));

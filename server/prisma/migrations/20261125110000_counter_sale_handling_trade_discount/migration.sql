-- Legacy counter-sale handling and trade discount (csissue.handlingper / discountper, csfatax
-- handlingcharge / discountamount). Lagos charged 9% handling on spare parts to 2025; ABJ gave line
-- discounts to 2026. Existing bills had neither, so the amounts start at zero.
ALTER TABLE "InvoiceLine" ADD COLUMN "tradeDiscountPercent" DOUBLE PRECISION, ADD COLUMN "handlingPercent" DOUBLE PRECISION;
ALTER TABLE "Invoice" ADD COLUMN "tradeDiscountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0, ADD COLUMN "handlingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CounterSaleReturn" ADD COLUMN "tradeDiscountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0, ADD COLUMN "handlingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

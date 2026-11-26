-- Legacy counter-sale tax form (countersale.taxform): L "SALE" charges VAT on taxable parts,
-- X "TRNSFR WO/V" transfers without VAT (Lagos used it to 2026 for oil to group units).
-- Every existing bill was a VAT sale.
CREATE TYPE "SaleTaxForm" AS ENUM ('VAT_SALE', 'TRANSFER_WITHOUT_VAT');

ALTER TABLE "CounterSale" ADD COLUMN "taxForm" "SaleTaxForm" NOT NULL DEFAULT 'VAT_SALE';

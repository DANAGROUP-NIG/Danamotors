-- Counter-sale gate pass (legacy countersale.gatepass): issued with each bill from the gate pass
-- series that job cards and STN packing lists share. Bills posted before this have none.
ALTER TABLE "CounterSale" ADD COLUMN "gatePassNumber" TEXT;
CREATE UNIQUE INDEX "CounterSale_gatePassNumber_key" ON "CounterSale"("gatePassNumber");

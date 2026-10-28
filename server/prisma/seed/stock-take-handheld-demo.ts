/**
 * Demo data for counting on the handheld locally: a perpetual stock taking at CPD over 12 demo parts
 * (HHCOUNT-...) with stock and bins, and three count sheets issued to a checker, ready for HHDC Link.
 * - by bin, A-row bins, system stock shown;
 * - by bin, 1D3/1D2 and the B bins, system stock hidden (the usual blind count);
 * - by part, the rest (C bins).
 * Local database only. Run it again once the earlier stock taking is completed or cancelled.
 *
 *   npx ts-node prisma/seed/stock-take-handheld-demo.ts
 */
import "dotenv/config";
import { hash } from "./helpers";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error("Refusing to seed: DATABASE_URL is not a local database.");
  process.exit(1);
}

/* eslint-disable @typescript-eslint/no-var-requires */
const prisma = require("../../src/prisma/client").default;
const { InventoryService } = require("../../src/modules/inventory/inventory.service");
const { StockTakeService } = require("../../src/modules/stock-take/stockTake.service");

const inventory = new InventoryService();
const stockTakes = new StockTakeService();

/** Part number, name, bin, stock, dealer rate. One part sits in two bins (1D3/1D2), as in the legacy data. */
const PARTS = [
  ["HHCOUNT-2630035505", "OIL FILTER", "A1-01", 24, 4200],
  ["HHCOUNT-1884911100", "SPARK PLUG", "A1-01", 48, 2600],
  ["HHCOUNT-97133D3000", "FILTER-AIR CLEANER", "A1-02", 12, 9800],
  ["HHCOUNT-58101D7A00", "PAD KIT-FRONT DISC BRAKE", "A2-01", 8, 28500],
  ["HHCOUNT-0K2N133070", "WIPER BLADE ASSY", "A2-02", 15, 5400],
  ["HHCOUNT-96611P2700", "HORN ASSY", "1D3/1D2", 6, 12000],
  ["HHCOUNT-8659028000", "RETAINE ASSY-BUMPER", "B4-03", 30, 1155.06],
  ["HHCOUNT-31112D7000", "FUEL PUMP ASSY", "B4-03", 3, 96000],
  ["HHCOUNT-25212-2B000", "V-RIBBED BELT", "C2-01", 10, 9800],
  ["HHCOUNT-92101D4000", "HEAD LAMP ASSY LH", "C2-02", 2, 485000],
  ["HHCOUNT-87610D4000", "MIRROR ASSY OUTSIDE RH", "C3-01", 4, 132036.62],
  ["HHCOUNT-0000000OIL", "ENGINE OIL 5W30 4L", "C3-02", 40, 18800],
] as const;

async function main() {
  const cpd = await prisma.branch.findFirstOrThrow({ where: { name: "CPD" } });
  const actor = await prisma.user.findFirstOrThrow({ where: { email: "superadmin@danamotors.com" } });
  // Checkers are users of the branch; the local database has none at CPD.
  const role = await prisma.role.findFirstOrThrow({ where: { name: "StoreOfficer" } });
  const checker = await prisma.user.upsert({
    where: { email: "checker.cpd@danamotors.local" },
    update: {},
    create: { email: "checker.cpd@danamotors.local", passwordHash: await hash("Checker@123"), firstName: "Checker", lastName: "CPD (demo)", roleId: role.id, branchId: cpd.id },
  });

  for (const [partNumber, name, bin, quantity, dealer] of PARTS) {
    const part = await prisma.sparePart.upsert({
      where: { partNumber },
      update: {},
      create: { partNumber, name, partType: "S", partFlag: "O", unitPrice: dealer, retailRate: Math.round(dealer * 1.8 * 100) / 100 },
    });
    const stock = await prisma.inventoryStock.findUnique({ where: { branchId_partId: { branchId: cpd.id, partId: part.id } } });
    const missing = quantity - (stock?.quantity ?? 0);
    if (missing !== 0) await inventory.adjustStock({ branchId: cpd.id, partId: part.id, quantity: missing, type: "ADJUSTMENT", notes: "Handheld count demo stock", recordedById: actor.id });
    await prisma.inventoryStock.update({ where: { branchId_partId: { branchId: cpd.id, partId: part.id } }, data: { rackLocation: bin } });
  }

  const { stockTake } = await stockTakes.createStockTake(
    { branchId: cpd.id, type: "PERPETUAL", remarks: "Handheld count demo", selection: { basis: "PART", from: "HHCOUNT-", to: "HHCOUNT-~" } },
    actor.id,
  );
  const sheets = [
    await stockTakes.createSheet(stockTake.id, { checkerId: checker.id, basis: "BIN", from: "A", to: "A~", showSystemStock: true }, actor.id),
    await stockTakes.createSheet(stockTake.id, { checkerId: checker.id, basis: "BIN", from: "1", to: "B~" }, actor.id),
    await stockTakes.createSheet(stockTake.id, { checkerId: checker.id, basis: "PART" }, actor.id),
  ];

  console.log(`Done at ${cpd.name}: stock taking ${stockTake.batchNumber} (${stockTake.id}), checker ${checker.email}.
Sheets: ${sheets.map((s: { sheetNumber?: string; id: string; lineCount: number }) => `${s.sheetNumber ?? s.id} (${s.lineCount} lines)`).join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

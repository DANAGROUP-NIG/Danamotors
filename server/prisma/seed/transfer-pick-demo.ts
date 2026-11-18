/**
 * Demo data for picking transfers on the handheld locally: branch indents to CPD, approved, so each has
 * an open picking list with stock reserved and is ready to send to the handheld (indent page > Send to
 * handheld; also listed on Settings > HHDC under "Indents to pick for transfer"). At CPD:
 * - 16 demo parts (HHPICK-...) with stock and bins spread over the store, one kept in two bins;
 * - one indent from each other branch, from 2 to 12 lines, so the bin order on the device shows;
 * - one indent asks for more than CPD holds of a part, so its picking list is partial and the rest is
 *   on back order.
 * Goes through the real services. Local database only. Run it again to add another set.
 *
 *   npx ts-node prisma/seed/transfer-pick-demo.ts
 */
import "dotenv/config";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error("Refusing to seed: DATABASE_URL is not a local database.");
  process.exit(1);
}

/* eslint-disable @typescript-eslint/no-var-requires */
const prisma = require("../../src/prisma/client").default;
const { StockTransferService } = require("../../src/modules/stock-transfer/stockTransfer.service");
const { InventoryService } = require("../../src/modules/inventory/inventory.service");

const transfers = new StockTransferService();
const inventory = new InventoryService();

/** Part number, name, bin, stock to hold at CPD, dealer rate. */
const PARTS = [
  ["HHPICK-2630035505", "FILTER ASSY-OIL", "2B1", 80, 4200],
  ["HHPICK-28113D3300", "ELEMENT-AIR CLEANER", "2B4", 30, 9800],
  ["HHPICK-97133D3000", "FILTER-CABIN AIR", "2C2", 40, 7600],
  ["HHPICK-1884911100", "PLUG ASSY-SPARK", "3A4", 120, 2600],
  ["HHPICK-58101D7A00", "PAD KIT-FRONT DISC BRAKE", "14C2", 24, 28500],
  ["HHPICK-58302D7A00", "PAD KIT-REAR DISC BRAKE", "14C3", 18, 21400],
  ["HHPICK-51712D7000", "DISC-FRONT WHEEL BRAKE", "15A1", 10, 46000],
  ["HHPICK-8659028000", "RETAINE ASSY-BUMPER", "59A3", 50, 1155],
  ["HHPICK-96611P2700", "HORN ASSY", "1D3/1D2", 12, 12000],
  ["HHPICK-98350D7000", "BLADE ASSY-WIPER, DRIVER", "6A2", 36, 5400],
  ["HHPICK-98360D7000", "BLADE ASSY-WIPER, PASSENGER", "6A3", 36, 4900],
  ["HHPICK-0K20133065A", "GASKET-OIL DRAIN PLUG", "1A1", 200, 350],
  ["HHPICK-25212F2000", "BELT-V RIBBED", "8B2", 14, 13200],
  ["HHPICK-31112D7000", "FILTER-FUEL", "2C5", 22, 11800],
  ["HHPICK-92101D4000", "LAMP ASSY-HEAD, LH", "40A1", 4, 185000],
  ["HHPICK-87610D7000", "MIRROR ASSY-OUTSIDE RR VIEW, LH", "41C2", 3, 96000],
] as const;

type Part = { id: string; partNumber: string };

async function main() {
  const cpd = await prisma.branch.findFirstOrThrow({ where: { name: "CPD" } });
  const actor = await prisma.user.findFirstOrThrow({ where: { email: "superadmin@danamotors.com" } });
  const others = await prisma.branch.findMany({ where: { id: { not: cpd.id }, isActive: { not: false } }, orderBy: { name: "asc" } });
  if (!others.length) throw new Error("No other branch to raise an indent from");

  // ── Parts with stock and a bin at CPD (topped up to the target free stock) ──
  const parts: Part[] = [];
  for (const [partNumber, name, bin, target, dealer] of PARTS) {
    const part = await prisma.sparePart.upsert({
      where: { partNumber },
      update: {},
      create: { partNumber, name, partType: "S", partFlag: "O", unitPrice: dealer, retailRate: Math.round(dealer * 1.8 * 100) / 100 },
    });
    const stock = await prisma.inventoryStock.findUnique({ where: { branchId_partId: { branchId: cpd.id, partId: part.id } } });
    const free = stock ? stock.quantity - stock.reservedQuantity : 0;
    if (free < target) {
      await inventory.adjustStock({ branchId: cpd.id, partId: part.id, quantity: target - free, type: "ADJUSTMENT", notes: "Transfer picking demo stock", recordedById: actor.id });
    }
    await prisma.inventoryStock.update({ where: { branchId_partId: { branchId: cpd.id, partId: part.id } }, data: { rackLocation: bin } });
    parts.push(part);
  }
  const at = (...idx: number[]) => idx.map((i) => parts[i]);

  // ── Indents to CPD, approved: each gets an open picking list with the stock reserved ──
  const plans: { picks: Part[]; qty: (k: number) => number; note: string }[] = [
    { picks: at(0, 3, 11, 1, 2, 13, 9, 10, 4, 5, 7, 12), qty: (k) => 2 + (k % 4), note: "service stock top-up, 12 lines" },
    { picks: at(4, 6, 5), qty: (k) => 2 + k, note: "brake job parts" },
    { picks: at(8, 7, 14, 15), qty: () => 1, note: "body shop, one of each" },
    { picks: at(0, 3), qty: () => 10, note: "two lines, larger quantities" },
    // More headlamps than CPD holds: part of it is picked, the rest goes on back order.
    { picks: at(14, 2, 0), qty: (k) => (k === 0 ? 7 : 3), note: "short on stock: partial pick + back order" },
  ];
  const made: string[] = [];
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    const from = others[i % others.length];
    const indent = await transfers.createIndent(
      {
        requestingBranchId: from.id,
        sourceBranchId: cpd.id,
        authorisedBy: "PICK DEMO",
        lines: plan.picks.map((p, k) => ({ partId: p.id, urgentQuantity: plan.qty(k) })),
      },
      actor.id,
    );
    const approved = await transfers.approveIndent(indent.id, actor.id);
    const list = approved.openPickingList;
    const reserved = list ? list.lines.reduce((s: number, l: { pickedQuantity: number }) => s + l.pickedQuantity, 0) : 0;
    made.push(
      `  Indent ${approved.indentNumber}  ${from.name} -> CPD  ${plan.picks.length} line(s), ${reserved} reserved on ${list ? list.pickingNumber : "no picking list"}  (${plan.note})`,
    );
  }

  console.log(`Done. Indents ready to pick for transfer at ${cpd.name} (open each and click Send to handheld):\n${made.join("\n")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

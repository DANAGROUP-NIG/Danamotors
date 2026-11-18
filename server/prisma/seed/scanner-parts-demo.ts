/**
 * Demo data for trying the handheld with three parts whose labels are at hand, so every scan is real:
 *   1864761566  BULB-HALOGEN           (Mobis price list; legacy partmast)
 *   96610H9100  HORN ASSY-HIGH PITCH   (Mobis price list; legacy partmast)
 *   391752A086  ECU (demo)             (label 39175-2A086; in neither: description and rate are made up)
 * At CPD, through the real services, one of each handheld job, ready to send from its page:
 * - stock and bins for the three parts;
 * - an indent from KIA PLAZA, approved (picking list with all three reserved);
 * - a CPO, picked (bulb and horn reserved);
 * - a Mobis MIT in transit, two cases;
 * - a perpetual stock taking over the three parts with one count sheet (checker: the demo checker, else superadmin).
 * They are also listed on Settings > HHDC under "Ready for the handheld". Local database only. Run it again
 * for another indent, CPO and MIT (the stock taking is made only while none is open over these parts).
 *
 *   npx ts-node prisma/seed/scanner-parts-demo.ts
 */
import "dotenv/config";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error("Refusing to seed: DATABASE_URL is not a local database.");
  process.exit(1);
}

/* eslint-disable @typescript-eslint/no-var-requires */
const prisma = require("../../src/prisma/client").default;
const { PartSaleService } = require("../../src/modules/part-sale/partSale.service");
const { StockTransferService } = require("../../src/modules/stock-transfer/stockTransfer.service");
const { MobisPurchaseService } = require("../../src/modules/mobis-purchase/mobisPurchase.service");
const { InventoryService } = require("../../src/modules/inventory/inventory.service");
const { StockTakeService } = require("../../src/modules/stock-take/stockTake.service");

const sales = new PartSaleService();
const transfers = new StockTransferService();
const mobis = new MobisPurchaseService();
const inventory = new InventoryService();
const stockTakes = new StockTakeService();

/** Part number, name, bin, stock to hold at CPD, dealer rate, retail rate (Mobis price list where it has them). */
const PARTS = [
  ["1864761566", "BULB-HALOGEN", "3C1", 20, 12002.58, 24845.34],
  ["96610H9100", "HORN ASSY-HIGH PITCH", "1D4", 6, 38317.86, 127598.47],
  ["391752A086", "ECU (demo)", "9E2", 3, 250000, 450000],
] as const;

type Part = { id: string; partNumber: string; unitPrice: number };

async function main() {
  const cpd = await prisma.branch.findFirstOrThrow({ where: { name: "CPD" } });
  const kiaPlaza = await prisma.branch.findFirstOrThrow({ where: { name: { startsWith: "KIA PLAZA" } } });
  const actor = await prisma.user.findFirstOrThrow({ where: { email: "superadmin@danamotors.com" } });
  const checker = (await prisma.user.findFirst({ where: { email: "checker.cpd@danamotors.local", isActive: true } })) ?? actor;
  const customer = await prisma.customer.findFirstOrThrow({ where: { code: { not: null }, NOT: { type: "VENDOR" } }, orderBy: { createdAt: "asc" } });

  // ── The three parts, with stock and a bin at CPD ──
  const parts: Part[] = [];
  for (const [partNumber, name, bin, target, dealer, retail] of PARTS) {
    const part = await prisma.sparePart.upsert({
      where: { partNumber },
      update: {},
      create: { partNumber, name, partType: "S", partFlag: "O", unitPrice: dealer, retailRate: retail },
    });
    const stock = await prisma.inventoryStock.findUnique({ where: { branchId_partId: { branchId: cpd.id, partId: part.id } } });
    const free = stock ? stock.quantity - stock.reservedQuantity : 0;
    if (free < target) {
      await inventory.adjustStock({ branchId: cpd.id, partId: part.id, quantity: target - free, type: "ADJUSTMENT", notes: "Scanner parts demo stock", recordedById: actor.id });
    }
    await prisma.inventoryStock.update({ where: { branchId_partId: { branchId: cpd.id, partId: part.id } }, data: { rackLocation: bin } });
    parts.push(part);
  }
  const [bulb, horn, ecu] = parts;

  // ── Indent from KIA PLAZA, approved: picking list with the stock reserved ──
  const indent = await transfers.createIndent(
    {
      requestingBranchId: kiaPlaza.id,
      sourceBranchId: cpd.id,
      authorisedBy: "SCAN DEMO",
      lines: [
        { partId: bulb.id, urgentQuantity: 4 },
        { partId: horn.id, urgentQuantity: 2 },
        { partId: ecu.id, urgentQuantity: 1 },
      ],
    },
    actor.id,
  );
  const approved = await transfers.approveIndent(indent.id, actor.id);

  // ── CPO, picked ──
  const cpo = await sales.createOrder(
    { branchId: cpd.id, customerId: customer.id, customerRefNo: "SCAN DEMO", pick: true, lines: [{ partId: bulb.id, quantity: 2 }, { partId: horn.id, quantity: 1 }] },
    actor.id,
  );

  // ── Mobis MIT in transit: bulbs and the ECU in one case, horns in another ──
  const mit = await mobis.importMit(
    {
      destinationBranchId: cpd.id,
      invoiceNumber: `SCANDEMO-${Date.now()}`,
      conversionRate: 1500,
      receivedMode: "SEA",
      lines: [
        { orderNumber: "SCANDEMO01", partNumber: bulb.partNumber, quantity: 10, unitPrice: 8.0, caseNumber: "SPD2APD00301" },
        { orderNumber: "SCANDEMO01", partNumber: ecu.partNumber, quantity: 1, unitPrice: 166.67, caseNumber: "SPD2APD00301" },
        { orderNumber: "SCANDEMO01", partNumber: horn.partNumber, quantity: 4, unitPrice: 25.55, caseNumber: "SPD2APD00302" },
      ],
    },
    actor.id,
  );

  // ── Perpetual stock taking over the three parts, one count sheet ──
  let counting = "skipped: a stock taking over these parts is still open";
  const open = await prisma.stockTakeLine.findFirst({
    where: { partId: { in: parts.map((p) => p.id) }, stockTake: { branchId: cpd.id, status: "ACTIVE" } },
    select: { stockTake: { select: { batchNumber: true } } },
  });
  if (!open) {
    const { stockTake } = await stockTakes.createStockTake(
      { branchId: cpd.id, type: "PERPETUAL", remarks: "Scanner parts demo", selection: { basis: "PART", from: "1864761566", to: "96610H9100", onlyWithStock: true } },
      actor.id,
    );
    const sheet = await stockTakes.createSheet(stockTake.id, { checkerId: checker.id, showSystemStock: true }, actor.id);
    counting = `Stock taking ${stockTake.batchNumber}, count sheet ${sheet.sheetNumber} (${sheet.lineCount} parts, checker ${checker.firstName} ${checker.lastName})`;
  } else {
    counting = `skipped: stock taking ${open.stockTake.batchNumber} already counts these parts`;
  }

  console.log(`Done at ${cpd.name}. Parts: 1864761566 BULB-HALOGEN (bin 3C1, 20), 96610H9100 HORN ASSY-HIGH PITCH (1D4, 6), 391752A086 ECU (demo) (9E2, 3).
Ready to send to the handheld:
  Indent ${approved.indentNumber} from ${kiaPlaza.name}: bulb 4, horn 2, ECU 1 (picking list ${approved.openPickingList?.pickingNumber ?? "-"})
  CPO ${cpo.cpoNumber}: bulb 2, horn 1
  MIT ${mit.mitNumber}: case SPD2APD00301 bulb 10 + ECU 1, case SPD2APD00302 horn 4
  ${counting}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

/**
 * Demo data for reviewing the Part sales reports locally: about ten lines on each register.
 * Goes through the real services (Mobis MRN, CPO, counter sale, return, indent, STN), so stock and
 * totals agree. Local database only. Each step skips what is already there, so a run that stopped
 * part-way can be run again.
 *
 *   npx ts-node prisma/seed/part-sales-reports-demo.ts
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

const sales = new PartSaleService();
const transfers = new StockTransferService();
const mobis = new MobisPurchaseService();
const inventory = new InventoryService();

/** Part type S/O/A, flag (purchase source), category, taxable, dealer rate, multiplier. */
const PARTS = [
  ["DEMO-FLT-001", "OIL FILTER ASSY", "S", "O", "B", true, 4200, 1.8],
  ["DEMO-PAD-002", "BRAKE PAD KIT FRONT", "S", "O", "A", true, 28500, 2.07],
  ["DEMO-MIR-003", "MIRROR ASSY OUTSIDE RH", "S", "O", "A", true, 132036.62, 2.07],
  ["DEMO-BLT-004", "V-RIBBED BELT", "S", "A", "C", true, 9800, 1.9],
  ["DEMO-SPK-005", "SPARK PLUG", "S", "L", "C", true, 2600, 1.9],
  ["DEMO-LMP-006", "HEAD LAMP ASSY LH", "S", "O", "H", true, 485000, 1.5],
  ["DEMO-OIL-007", "ENGINE OIL 5W30 4L", "O", "O", "O", false, 18800, 1.5],
  ["DEMO-ATF-008", "ATF SP-IV 1L", "O", "A", "O", false, 6400, 1.5],
  ["DEMO-MAT-009", "FLOOR MAT SET", "A", "L", "L", true, 21000, 1.6],
  ["DEMO-PRF-010", "DOOR VISOR SET", "A", "O", "L", true, 34000, 1.6],
] as const;

const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(10, 0, 0, 0);
  return d;
};

type Part = { id: string; partNumber: string; unitPrice: number };
const mobisLine = (orderNumber: string, quantity: number, caseNumber: (i: number) => string) => (p: Part, i: number) => ({
  orderNumber,
  partNumber: p.partNumber,
  quantity,
  unitPrice: Math.round((p.unitPrice / 1500) * 100) / 100,
  caseNumber: caseNumber(i),
});

/** Stock into CPD on a Mobis MRN (one line damaged, one short), and a second MIT left in transit. */
async function receiveStock(branchId: string, actorId: string, parts: Part[]) {
  const mit = await mobis.importMit(
    { destinationBranchId: branchId, invoiceNumber: `DEMO-INV-${Date.now()}`, conversionRate: 1500, receivedMode: "SEA", lines: parts.map(mobisLine("DEMO10K6Q01R", 120, (i) => `C${(i % 3) + 1}`)) },
    actorId,
  );
  await mobis.createMrn(mit.id, actorId, {
    lines: mit.lines.map((l: { id: string }, i: number) =>
      i === 1 ? { mitLineId: l.id, receivedQuantity: 116, damagedQuantity: 2 } : i === 4 ? { mitLineId: l.id, receivedQuantity: 115 } : { mitLineId: l.id, receivedQuantity: 120 },
    ),
  });
  await mobis.importMit(
    { destinationBranchId: branchId, invoiceNumber: `DEMO-INV-T-${Date.now()}`, conversionRate: 1500, receivedMode: "AIR", lines: parts.slice(0, 4).map(mobisLine("DEMO10K6Q02R", 10, () => "C9")) },
    actorId,
  );
}

async function main() {
  const cpd = await prisma.branch.findFirstOrThrow({ where: { name: "CPD" } });
  const kiaPlaza = await prisma.branch.findFirstOrThrow({ where: { name: { startsWith: "KIA PLAZA" } } });
  const actor = await prisma.user.findFirstOrThrow({ where: { email: "store.lagos@kiamotors.com" } });
  const executives = await prisma.user.findMany({ where: { email: { in: ["store.lagos@kiamotors.com", "admin.lagos@danamotors.com"] } } });
  const customers = await prisma.customer.findMany({ where: { code: { not: null }, NOT: { type: "VENDOR" } }, take: 5, orderBy: { createdAt: "asc" } });
  if (customers.length < 3) throw new Error("Need at least 3 customers with a code");

  // ── Parts, and their stock (see receiveStock) ──
  for (const code of ["A", "B", "C", "H", "L", "O"]) {
    await prisma.partCategory.upsert({ where: { code }, update: {}, create: { code, description: `Category ${code}`, markupMultiplier: 1.5 } });
  }
  const parts = [];
  for (const [partNumber, name, partType, partFlag, category, taxable, dealer, multiplier] of PARTS) {
    const data = { partNumber, name, partType, partFlag, priceCategoryCode: category, taxable, unitPrice: dealer, retailRate: Math.round(dealer * multiplier * 100) / 100 };
    parts.push(await prisma.sparePart.upsert({ where: { partNumber }, update: {}, create: data }));
  }
  const ids = parts.map((p) => p.id);
  const demo = { partId: { in: ids } };
  // Bills loaded into the local database without their number sequence: start after the last one.
  const year = new Date().getFullYear();
  const lastBill = await prisma.invoice.findFirst({ where: { invoiceNumber: { startsWith: `CS${year}` } }, orderBy: { invoiceNumber: "desc" } });
  const used = lastBill ? Number(lastBill.invoiceNumber.slice(6, 12)) : 0;
  const key = `COUNTER_SALE_${year}`;
  const sequence = await prisma.documentSequence.findUnique({ where: { key } });
  if ((sequence?.value ?? 0) < used) await prisma.documentSequence.upsert({ where: { key }, update: { value: used }, create: { key, value: used } });

  if (!(await prisma.materialInTransit.findFirst({ where: { invoiceNumber: { startsWith: "DEMO-INV-" } } }))) await receiveStock(cpd.id, actor.id, parts);

  // ── CPOs, picked, billed on 14 bills across the month; 4 cancelled (2 of them FOC) ──
  const billed = !!(await prisma.invoiceLine.findFirst({ where: demo }));
  for (let n = 0; n < 14 && !billed; n++) {
    const customer = customers[n % customers.length];
    const lines = [parts[n % 10], parts[(n + 3) % 10]].map((p, k) => ({ partId: p.id, quantity: 2 + ((n + k) % 4) }));
    const order = await sales.createOrder({ branchId: cpd.id, customerId: customer.id, customerRefNo: `PO/${2026}/${100 + n}`, pick: true, lines }, actor.id);
    const day = 26 - n * 2 > 0 ? 26 - n * 2 : 1;
    await prisma.customerOrder.update({ where: { id: order.id }, data: { orderDate: daysAgo(day + 1) } });
    const foc = n === 5 || n === 11;
    const sale = await sales.createCounterSale(
      {
        branchId: cpd.id,
        customerId: customer.id,
        cashDiscountPercent: foc ? 100 : n % 3 === 0 ? 0 : 22.5,
        salesExecutiveId: n % 4 === 3 ? undefined : executives[n % executives.length]?.id,
        // Bill all but one line of the last order, leaving it pending on the CPO register.
        lines: order.lines.slice(0, n === 13 ? 1 : 2).map((l: { id: string; orderedQuantity: number }) => ({ orderLineId: l.id, quantity: l.orderedQuantity })),
      },
      actor.id,
    );
    await prisma.invoice.update({ where: { id: sale.invoiceId ?? sale.invoice.id }, data: { issuedDate: daysAgo(day) } });
    if (foc || n === 2 || n === 9) await sales.cancelCounterSale(sale.id, foc ? "FOC issued in error" : "Customer cancelled the order", actor.id);
  }

  // ── Returns: 5 returns, about 10 lines, from bills that were not cancelled ──
  const returned = await prisma.counterSaleReturn.count({ where: { lines: { some: demo } } });
  const returnable = await prisma.counterSale.findMany({
    where: { returns: { none: {} }, invoice: { cancelledAt: null, customer: { NOT: { type: "VENDOR" } }, lines: { some: demo } } },
    include: { invoice: { include: { lines: true } } },
    take: Math.max(0, 5 - returned),
  });
  for (const [k, sale] of returnable.entries()) {
    const lines = sale.invoice.lines.map((l: { id: string }) => ({ invoiceLineId: l.id, quantity: 1 }));
    await sales.createReturn(sale.id, { lines }, actor.id);
    await prisma.counterSaleReturn.updateMany({ where: { counterSaleId: sale.id }, data: { returnDate: daysAgo(Math.max(1, 20 - k * 4)) } });
  }

  // ── Indents from KIA PLAZA on CPD: picked, 4 dispatched on STNs, 3 received (one with a damaged part) ──
  // Local purchase parts (flag L) are bought by each branch, never indented from CPD.
  const indentable = parts.filter((p) => p.partFlag !== "L");
  const indented = await prisma.branchIndent.count({ where: { lines: { some: demo } } });
  for (let n = indented; n < 5; n++) {
    const indent = await transfers.createIndent(
      { requestingBranchId: kiaPlaza.id, sourceBranchId: cpd.id, lines: [indentable[n % indentable.length], indentable[(n + 4) % indentable.length]].map((p, k) => ({ partId: p.id, stockQuantity: 3 + k + n })) },
      actor.id,
    );
    await transfers.approveIndent(indent.id, actor.id, { pickerName: ["YAHAYA", "TUNDE", "CHIDI"][n % 3] });
    if (n === 4) continue;
    await transfers.dispatchIndent(indent.id, actor.id, { courierName: "GIG LOGISTICS", waybillNumber: `WB${2600 + n}` });
    if (n === 3) continue;
    const stn = await prisma.stockTransferNote.findFirstOrThrow({ where: { indents: { some: { id: indent.id } } }, include: { lines: true } });
    await transfers.receiveStn(stn.id, actor.id, {
      lines: stn.lines.map((l: { id: string; quantity: number }, k: number) => (n === 0 && k === 0 ? { stnLineId: l.id, receivedQuantity: l.quantity - 1, damagedQuantity: 1 } : { stnLineId: l.id, receivedQuantity: l.quantity })),
    });
  }

  // ── Stock adjustments (SAN): 6 additions and 4 write-offs ──
  const sanNotes = ["Found in physical count", "Leaking tin", "Bin recount", "Damaged in store", "Unrecorded receipt", "Expired stock"];
  const adjusted = await prisma.stockTransaction.count({ where: { type: "ADJUSTMENT", ...demo } });
  for (let n = adjusted; n < 10; n++) {
    const quantity = n % 5 === 1 || n % 5 === 3 ? -1 : 2;
    await inventory.adjustStock({ branchId: cpd.id, partId: parts[n].id, quantity, type: "ADJUSTMENT", notes: sanNotes[n % sanNotes.length], recordedById: actor.id });
  }

  // ── Consumable issues (no job card): Checklist for Issues "Other issues" and Consumption ──
  const issued = await prisma.partIssuance.count({ where: { sparePartId: { in: ids }, jobCardId: null } });
  for (const [n, p] of [parts[6], parts[7], parts[8], parts[0]].entries()) {
    if (n < issued) continue;
    const issuance = await prisma.partIssuance.create({ data: { branchId: cpd.id, sparePartId: p.id, issuedById: actor.id, quantity: 1 + n, notes: ["Showroom top-up", "Pool car service", "Workshop consumables", "Generator service"][n] } });
    await prisma.inventoryStock.update({ where: { branchId_partId: { branchId: cpd.id, partId: p.id } }, data: { quantity: { decrement: 1 + n } } });
    await prisma.stockTransaction.create({ data: { branchId: cpd.id, partId: p.id, type: "ISSUED", quantity: -(1 + n), referenceId: issuance.id, recordedById: actor.id } });
  }

  console.log(`Done: 10 demo parts, 14 CPOs and bills (4 cancelled), 5 returns, 5 indents (4 STNs, 3 received), 10 SANs, 4 consumable issues at ${cpd.name}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

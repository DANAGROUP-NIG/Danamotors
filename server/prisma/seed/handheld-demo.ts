/**
 * Demo data for trying the web-driven handheld locally (the indent, CPO and MIT pages, Inventory >
 * Handheld, and HHDC Link in station mode). At CPD, through the real services and station protocol:
 * - a station DEMO-PC and a handheld DEMO-MC3190 (its key is printed: enter it in HHDC Link, Station...);
 * - ready to send: one indent picking list, one picked CPO and one MIT in transit (Send to handheld);
 * - waiting for a handheld: one CPO (QUEUED);
 * - on a handheld: one of each, picker 00015 (SENT to DEMO-MC3190; no file on any device);
 * - finished on the handheld: one indent with a short line and an unreported line (RECEIVED: Post it);
 * - posted: one MIT checked on the handheld (Verified, Generate MRN is filled in from it).
 * Local database only. Run it again to add another set (the station gets a new key).
 *
 *   npx ts-node prisma/seed/handheld-demo.ts
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
const { HandheldService } = require("../../src/modules/handheld/handheld.service");
const { HandheldStationService } = require("../../src/modules/handheld/handheld.station.service");

const sales = new PartSaleService();
const transfers = new StockTransferService();
const mobis = new MobisPurchaseService();
const inventory = new InventoryService();
const handheld = new HandheldService();
const stations = new HandheldStationService();

/** Part number, name, bin, dealer rate. Bins are spread so the device's bin order shows. */
const PARTS = [
  ["HHDEMO-8659028000", "RETAINE ASSY-BUMPER", "59A3", 1155.06],
  ["HHDEMO-96611P2700", "HORN ASSY", "1D3/1D2", 12000],
  ["HHDEMO-2630035505", "OIL FILTER", "2B1", 4200],
  ["HHDEMO-58101D7A00", "PAD KIT-FRONT DISC BRAKE", "14C2", 28500],
  ["HHDEMO-1884911100", "SPARK PLUG", "3A4", 2600],
  ["HHDEMO-97133D3000", "FILTER-AIR CLEANER", "22D1", 9800],
] as const;

type Part = { id: string; partNumber: string; unitPrice: number };
type Line = { id: string; partId: string | null; expectedQuantity: number };

async function main() {
  const cpd = await prisma.branch.findFirstOrThrow({ where: { name: "CPD" } });
  const kiaPlaza = await prisma.branch.findFirstOrThrow({ where: { name: { startsWith: "KIA PLAZA" } } });
  const actor = await prisma.user.findFirstOrThrow({ where: { email: "superadmin@danamotors.com" } });
  const customer = await prisma.customer.findFirstOrThrow({ where: { code: { not: null }, NOT: { type: "VENDOR" } }, orderBy: { createdAt: "asc" } });
  const picker =
    (await prisma.employee.findFirst({ where: { code: "00015", leftDate: null } })) ??
    (await prisma.employee.create({ data: { code: "00015", name: "Picker 00015 (test)", branchId: cpd.id } }));

  // ── Parts with stock and a bin at CPD ──
  const parts: Part[] = [];
  for (const [partNumber, name, bin, dealer] of PARTS) {
    const part = await prisma.sparePart.upsert({
      where: { partNumber },
      update: {},
      create: { partNumber, name, partType: "S", partFlag: "O", unitPrice: dealer, retailRate: Math.round(dealer * 1.8 * 100) / 100 },
    });
    const stock = await prisma.inventoryStock.findUnique({ where: { branchId_partId: { branchId: cpd.id, partId: part.id } } });
    const free = stock ? stock.quantity - stock.reservedQuantity : 0;
    if (free < 40) await inventory.adjustStock({ branchId: cpd.id, partId: part.id, quantity: 60 - free, type: "ADJUSTMENT", notes: "Handheld demo stock", recordedById: actor.id });
    await prisma.inventoryStock.update({ where: { branchId_partId: { branchId: cpd.id, partId: part.id } }, data: { rackLocation: bin } });
    parts.push(part);
  }
  const at = (...idx: number[]) => idx.map((i) => parts[i]);

  // ── Indents from KIA PLAZA, approved: each has an open picking list ──
  const indent = async (picks: Part[], qty: number) => {
    const created = await transfers.createIndent(
      { requestingBranchId: kiaPlaza.id, sourceBranchId: cpd.id, authorisedBy: "HH DEMO", lines: picks.map((p, k) => ({ partId: p.id, urgentQuantity: qty + k })) },
      actor.id,
    );
    const approved = await transfers.approveIndent(created.id, actor.id);
    return { indentNumber: approved.indentNumber as string, listId: approved.openPickingList.id as string };
  };
  const indentReady = await indent(at(0, 1, 2, 3), 3);
  const indentSent = await indent(at(4, 5, 1), 2);

  // ── CPOs, picked (stock reserved) ──
  const order = async (picks: Part[], qty: number) =>
    sales.createOrder({ branchId: cpd.id, customerId: customer.id, customerRefNo: "HH DEMO", pick: true, lines: picks.map((p, k) => ({ partId: p.id, quantity: qty + k })) }, actor.id);
  const cpoReady = await order(at(2, 4, 0), 2);
  const cpoSent = await order(at(3, 5), 1);
  const cpoQueued = await order(at(1), 1);
  const indentBack = await indent(at(2, 3, 0), 2);

  // ── Mobis MITs in transit, two cases each ──
  const mit = async (picks: Part[], tag: string) =>
    mobis.importMit(
      {
        destinationBranchId: cpd.id,
        invoiceNumber: `HHDEMO-${tag}-${Date.now()}`,
        conversionRate: 1500,
        receivedMode: "SEA",
        lines: picks.map((p, i) => ({
          orderNumber: "HHDEMO10K6Q01R",
          partNumber: p.partNumber,
          quantity: 6 + i * 2,
          unitPrice: Math.round((p.unitPrice / 1500) * 100) / 100,
          caseNumber: `SPD2APD0018${i % 2 ? 4 : 3}`,
        })),
      },
      actor.id,
    );
  const mitReady = await mit(at(0, 1, 2, 3, 4, 5), "R");
  const mitSent = await mit(at(1, 3, 5), "S");
  const mitDone = await mit(at(0, 2, 4, 5), "U");

  // ── A station and a handheld at CPD (as if DEMO-PC had seen DEMO-MC3190 docked) ──
  const existing = await prisma.handheldStation.findFirst({ where: { branchId: cpd.id, name: "DEMO-PC", revokedAt: null } });
  const { station, key } = existing ? await stations.rotateKey(existing.id) : await stations.createStation({ branchId: cpd.id, name: "DEMO-PC" }, actor.id);
  const pc = await stations.authenticate(`Station ${key}`);
  const device =
    (await prisma.handheldDevice.findFirst({ where: { branchId: cpd.id, name: "DEMO-MC3190" } })) ??
    (await prisma.handheldDevice.create({ data: { branchId: cpd.id, name: "DEMO-MC3190" } }));
  // Delivers whatever is waiting at CPD to the demo handheld (the station's claim and confirm).
  const deliver = async () => {
    const { jobs } = await stations.claim(pc, device.id);
    for (const j of jobs) await stations.confirm(pc, j.id, device.id);
  };

  // ── Waiting for a handheld: a CPO ──
  const send = (type: string, sourceId: string) => handheld.createDocument({ type, sourceId, pickerId: picker.id }, actor.id);
  const sentIndent = await send("INDENT_PICK", indentSent.listId);
  const sentCpo = await send("CPO_PICK", cpoSent.id);
  const sentMit = await send("MIT_RECEIVE", mitSent.id);
  const backDoc = await send("INDENT_PICK", indentBack.listId);
  const doneDoc = await send("MIT_RECEIVE", mitDone.id);
  await deliver();
  const queuedCpo = await send("CPO_PICK", cpoQueued.id);

  // ── Finished on the handheld: an indent, one line short (less in bin), one never reported ──
  await stations.submitResult(pc, {
    deviceId: device.id,
    kind: "DOC",
    id: backDoc.id,
    result: {
      lines: backDoc.lines
        .slice(0, 2)
        .map((l: Line, i: number) => (i === 0 ? { lineId: l.id, quantity: l.expectedQuantity - 1, shortReason: "LESS_IN_BIN" } : { lineId: l.id, quantity: l.expectedQuantity })),
    },
  });

  // ── Posted: an MIT checked on the handheld, one line damaged, one short, one extra part ──
  await stations.submitResult(pc, {
    deviceId: device.id,
    kind: "DOC",
    id: doneDoc.id,
    result: {
      lines: doneDoc.lines.map((l: Line, i: number) =>
        i === 0 ? { lineId: l.id, quantity: l.expectedQuantity - 1, damagedQuantity: 1 } : i === 1 ? { lineId: l.id, quantity: l.expectedQuantity - 2 } : { lineId: l.id, quantity: l.expectedQuantity },
      ),
      extras: [{ partNumber: "96611P2710", quantity: 1, note: "In case SPD2APD00183, not on the invoice" }],
    },
  });
  await handheld.post(doneDoc.id, {}, actor.id);

  console.log(`Done at ${cpd.name} (picker ${picker.code} ${picker.name}).
Station ${station.name}, handheld ${device.name}. Station key (local demo only; HHDC Link > Station...):
  ${key}
Ready to send from the web:
  Indent ${indentReady.indentNumber}   CPO ${cpoReady.cpoNumber}   MIT ${mitReady.mitNumber}
Waiting for a handheld:
  CPO ${cpoQueued.cpoNumber} as ${queuedCpo.documentNumber}
On handheld ${device.name}:
  Indent ${indentSent.indentNumber} as ${sentIndent.documentNumber}   CPO ${cpoSent.cpoNumber} as ${sentCpo.documentNumber}   MIT ${mitSent.mitNumber} as ${sentMit.documentNumber}
Finished on the handheld (Post it on the indent page):
  Indent ${indentBack.indentNumber} as ${backDoc.documentNumber}
Posted (MIT Verified, MRN to post):
  MIT ${mitDone.mitNumber} as ${doneDoc.documentNumber}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

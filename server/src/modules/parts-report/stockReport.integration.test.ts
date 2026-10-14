/**
 * Stock reports against a real database: FIFO ledger and summary, balances on a date, ageing,
 * branch-wise stock, blocked and unavailable stock, and negative balances.
 * Skipped unless TEST_DATABASE_URL points at a separate, migrated database.
 */
import type { PrismaClient } from "@prisma/client";
import type { PartsReportService as ReportType } from "./partsReport.service";

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

jest.setTimeout(60_000);

describeDb("Stock reports (database)", () => {
  let prisma: PrismaClient;
  let reports: ReportType;
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-8);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
  let cpd: { id: string; name: string };
  let plaza: { id: string; name: string };
  let joint: { id: string; partNumber: string };

  const report = (kind: string, extra: Record<string, unknown> = {}) => reports.run(kind, { from: today, to: today, branchId: cpd.id, ...extra });
  const forPart = (rows: Record<string, unknown>[], partNumber: string) => rows.filter((r) => r.partNumber === partNumber);

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = require("../../prisma/client").default;
    reports = new (require("./partsReport.service").PartsReportService)();
    const sales = new (require("../part-sale/partSale.service").PartSaleService)();
    const transfers = new (require("../stock-transfer/stockTransfer.service").StockTransferService)();
    const mobis = new (require("../mobis-purchase/mobisPurchase.service").MobisPurchaseService)();
    const inventory = new (require("../inventory/inventory.service").InventoryService)();

    const role = await prisma.role.upsert({ where: { name: "GeneralStoreManager" }, update: {}, create: { name: "GeneralStoreManager" } });
    cpd = await prisma.branch.create({ data: { name: `CPD Stock ${run}` } });
    plaza = await prisma.branch.create({ data: { name: `Kia Plaza Stock ${run}` } });
    const user = await prisma.user.create({
      data: { email: `stock.${run}@test.local`, passwordHash: "x", firstName: "Emeka", lastName: "Store", roleId: role.id, branchId: cpd.id },
    });
    const customer = await prisma.customer.create({ data: { firstName: "Cavem", lastName: "Ltd", companyName: `CAVEM ${run}`, code: `S${run}`, branchId: cpd.id } });
    await prisma.partCategory.upsert({ where: { code: "A" }, update: {}, create: { code: "A", description: "Co-op parts", markupMultiplier: 2.07 } });
    const part = (suffix: string, name: string, unitPrice: number, binLocation?: string) =>
      prisma.sparePart.create({
        data: { partCode: `STK-${suffix}-${run}`, partNumber: `STK-${suffix}-${run}`, name, unitPrice, retailRate: unitPrice * 2.07, priceCategoryCode: "A", binLocation },
      });
    joint = await part("J", "BALL JOINT ASSY-LWR ARM", 39258, "53B3");
    const bolt = await part("B", "BOLT-FLANGE", 500);
    const filter = await part("F", "FILTER ASSY-ENGINE OIL", 8829);
    const oil = await part("O", "ENGINE OIL 4L", 4700);
    // Stock with no movement behind it, as migrated stock: one ball joint and five bolts.
    await prisma.inventoryStock.createMany({
      data: [
        { branchId: cpd.id, partId: joint.id, quantity: 1 },
        { branchId: cpd.id, partId: bolt.id, quantity: 5 },
        { branchId: cpd.id, partId: filter.id, quantity: 0 },
      ],
    });

    // Mobis MRN: six ball joints at ₦37,314.
    const mit = await mobis.importMit(
      {
        destinationBranchId: cpd.id,
        invoiceNumber: `A5LA-${run}`,
        conversionRate: 1000,
        receivedMode: "AIR",
        lines: [{ orderNumber: "AV10K6Q01R", partNumber: joint.partNumber, quantity: 6, unitPrice: 37.314, caseNumber: "C1" }],
      },
      user.id,
    );
    await mobis.createMrn(mit.id, user.id, { lines: mit.lines.map((l: { id: string }) => ({ mitLineId: l.id, receivedQuantity: 6 })) });

    // Three shipped to Kia Plaza on an STN (the opening unit first, FIFO) and received there.
    const shipped = await transfers.createIndent({ requestingBranchId: plaza.id, sourceBranchId: cpd.id, lines: [{ partId: joint.id, stockQuantity: 3 }] }, user.id);
    await transfers.approveIndent(shipped.id, user.id, { pickerName: "YAHAYA" });
    await transfers.dispatchIndent(shipped.id, user.id);
    await transfers.receiveIndent(shipped.id, user.id);

    // A CPO for two: both picked (blocked), one billed.
    const order = await sales.createOrder({ branchId: cpd.id, customerId: customer.id, pick: true, lines: [{ partId: joint.id, quantity: 2 }] }, user.id);
    await sales.createCounterSale({ branchId: cpd.id, customerId: customer.id, lines: [{ orderLineId: order.lines[0].id, quantity: 1 }] }, user.id);

    // A second indent for five: two free to pick (blocked until its STN), three back-ordered.
    const backOrdered = await transfers.createIndent({ requestingBranchId: plaza.id, sourceBranchId: cpd.id, lines: [{ partId: joint.id, stockQuantity: 5 }] }, user.id);
    await transfers.approveIndent(backOrdered.id, user.id, { pickerName: "MUSA" });

    // Oil taken out with nothing in stock.
    await inventory.adjustStock({ branchId: cpd.id, partId: oil.id, quantity: -2, type: "ADJUSTMENT", notes: "Damaged in store", recordedById: user.id });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("prints the FIFO ledger: opening stock, the MRN, the STN split by receipt rate and the counter sale", async () => {
    const r = await report("stock-ledger", { partId: joint.id });
    expect(r.grouped).toBe(true);
    expect(r.rows.map((row) => [row.type, row.rate ?? null, row.receiptQty ?? row.issueQty ?? null, row.balanceQty, row.balanceValue])).toEqual([
      ["Opening balance", null, null, 1, 39258],
      ["MRN", 37314, 6, 7, 263142],
      ["STN", 39258, 1, 6, 223884],
      [undefined, 37314, 2, 4, 149256],
      ["Counter sale", 37314, 1, 3, 111942],
    ]);
    expect(r.rows[1]).toMatchObject({ party: "MOBIS", invoice: `A5LA-${run}` });
    expect(r.rows[2]).toMatchObject({ party: plaza.name });
    expect(r.totals).toMatchObject({ receiptQty: 6, receiptValue: 223884, issueQty: 4, issueValue: 151200, balanceQty: 3, balanceValue: 111942 });
  });

  it("values the same ledger at dealer rate, and shows the SRN at the receiving branch", async () => {
    const dealer = await report("stock-ledger", { partId: joint.id, option: "DEALER" });
    expect(dealer.totals).toMatchObject({ balanceQty: 3, balanceValue: 117774, issueValue: 157032 });

    const received = await report("stock-ledger", { partId: joint.id, branchId: plaza.id });
    expect(received.rows.slice(1)).toEqual([expect.objectContaining({ type: "SRN", party: cpd.name, rate: 39258, receiptQty: 3, balanceQty: 3, balanceValue: 117774 })]);
  });

  it("summarises opening, receipts, issues at cost and closing", async () => {
    const r = await report("stock-summary", { partId: joint.id });
    expect(r.rows).toEqual([
      expect.objectContaining({
        bin: "53B3",
        openingQty: 1,
        openingValue: 39258,
        receiptQty: 6,
        receiptValue: 223884,
        issueQty: 4,
        issueValue: 151200,
        closingQty: 3,
        closingValue: 111942,
      }),
    ]);
  });

  it("lists stock on a date, FIFO or at dealer rate, by branch for all branches", async () => {
    const fifo = await report("current-stock", { option: "FIFO" });
    expect(forPart(fifo.rows, joint.partNumber)).toEqual([expect.objectContaining({ quantity: 3, rate: 37314, value: 111942 })]);

    const all = await report("current-stock", { branchId: undefined, partId: joint.id });
    expect(all.rows.filter((row) => row.group === cpd.name || row.group === plaza.name).map((row) => [row.group, row.quantity, row.value])).toEqual([
      [cpd.name, 3, 117774],
      [plaza.name, 3, 117774],
    ]);
  });

  it("lists zero-balance and slow-moving parts", async () => {
    const zero = await report("zero-balance");
    expect(zero.rows.map((row) => row.partNumber)).toEqual([`STK-F-${run}`]);

    // The bolts were never issued; the ball joint was issued today.
    const slow = await report("slow-moving", { days: 1 });
    expect(slow.rows).toEqual([expect.objectContaining({ partNumber: `STK-B-${run}`, lastIssue: null, quantity: 5, value: 2500 })]);
  });

  it("ages stock into the bands asked for, with unrecorded stock in the oldest", async () => {
    const r = await report("stock-ageing", { ageLimits: [30, 60, 90, 180, 365] });
    expect(r.columns.map((c) => c.label)).toContain("Above 365 days qty");
    expect(forPart(r.rows, joint.partNumber)).toEqual([expect.objectContaining({ quantity: 3, age0Qty: 3, age0Value: 117774 })]);
    expect(forPart(r.rows, `STK-B-${run}`)).toEqual([expect.objectContaining({ age5Qty: 5, age5Value: 2500 })]);
  });

  it("shows each part's stock at every branch, or the total", async () => {
    // Blocked at CPD: one picked for the CPO and two for the second indent.
    const byBranch = await report("branch-stock", { partId: joint.id });
    expect(byBranch.rows.map((row) => [row.branch, row.quantity, row.blocked, row.available])).toEqual([
      [cpd.name, 3, 3, 0],
      [plaza.name, 3, 0, 3],
    ]);
    const total = await report("branch-stock", { partId: joint.id, option: "TOTAL" });
    expect(total.rows).toEqual([expect.objectContaining({ branches: 2, quantity: 6, blocked: 3, available: 3, value: 235548 })]);
  });

  it("lists stock blocked for CPOs and indents, and the demand that could not be met", async () => {
    const detail = await report("parts-blocked");
    expect(detail.rows.map((row) => [row.type, row.party, row.picker, row.quantity])).toEqual([
      ["CPO", `CAVEM ${run}`, null, 1],
      ["Branch indent", plaza.name, "MUSA", 2],
    ]);
    const summary = await report("parts-blocked", { option: "SUMMARY" });
    expect(summary.rows).toEqual([expect.objectContaining({ stock: 3, cpo: 1, indent: 2, blocked: 3, available: 0 })]);

    const unavailable = await report("item-unavailability");
    expect(unavailable.rows).toEqual([expect.objectContaining({ partNumber: joint.partNumber, cpo: 0, backOrder: 3, quantity: 3, value: 117774 })]);
  });

  it("finds movements that left a balance below zero", async () => {
    const r = await report("negative-stock");
    expect(r.rows).toEqual([expect.objectContaining({ partNumber: `STK-O-${run}`, type: "SAN", party: "Damaged in store", quantity: -2, balance: -2, value: -9400 })]);
  });

  it("compares closing stock with sales at cost", async () => {
    const r = await report("inventory-sales-ratio", { partId: joint.id });
    expect(r.rows).toEqual([expect.objectContaining({ openingValue: 39258, soldQty: 1, sales: 37314, closingValue: 111942, ratio: 3 })]);
    expect(r.totals.ratio).toBe(3);
  });

  it("lists stock in bin order, filtered by bin", async () => {
    const r = await report("bin-location-stock", { search: "53b" });
    expect(r.rows).toEqual([expect.objectContaining({ bin: "53B3", partNumber: joint.partNumber, quantity: 3 })]);
  });
});

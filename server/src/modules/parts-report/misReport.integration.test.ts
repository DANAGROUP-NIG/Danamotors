/**
 * MIS reports against a real database: stock levels, most consumed parts, model and mileage wise
 * issues, profitability, percent fill, part rate and bin history, and the STN packing list register.
 * Skipped unless TEST_DATABASE_URL points at a separate, migrated database.
 */
import type { PrismaClient } from "@prisma/client";
import type { PartsReportService as ReportType } from "./partsReport.service";

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

jest.setTimeout(60_000);

describeDb("MIS reports (database)", () => {
  let prisma: PrismaClient;
  let reports: ReportType;
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-8);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
  let cpd: { id: string; name: string };
  let plaza: { id: string; name: string };
  let joint: { id: string; partNumber: string };
  let bolt: { id: string; partNumber: string };
  let stnNumber: string;

  const report = (kind: string, extra: Record<string, unknown> = {}) => reports.run(kind, { from: today, to: today, branchId: cpd.id, ...extra });
  const pick = (rows: Record<string, unknown>[], ...keys: string[]) => rows.map((row) => keys.map((k) => row[k] ?? null));

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = require("../../prisma/client").default;
    reports = new (require("./partsReport.service").PartsReportService)();
    const sales = new (require("../part-sale/partSale.service").PartSaleService)();
    const transfers = new (require("../stock-transfer/stockTransfer.service").StockTransferService)();
    const mobis = new (require("../mobis-purchase/mobisPurchase.service").MobisPurchaseService)();
    const inventory = new (require("../inventory/inventory.service").InventoryService)();

    const role = await prisma.role.upsert({ where: { name: "GeneralStoreManager" }, update: {}, create: { name: "GeneralStoreManager" } });
    cpd = await prisma.branch.create({ data: { name: `CPD MIS ${run}` } });
    plaza = await prisma.branch.create({ data: { name: `Kia Plaza MIS ${run}` } });
    const user = await prisma.user.create({
      data: { email: `mis.${run}@test.local`, passwordHash: "x", firstName: "Emeka", lastName: "Store", roleId: role.id, branchId: cpd.id },
    });
    const customer = await prisma.customer.create({ data: { firstName: "Cavem", lastName: "Ltd", companyName: `CAVEM ${run}`, code: `M${run}`, branchId: cpd.id } });
    await prisma.partCategory.upsert({ where: { code: "A" }, update: {}, create: { code: "A", description: "Co-op parts", markupMultiplier: 2.07 } });

    // Part Master: added at ₦39,258 (retail 2.07×), then re-rated to ₦40,000 and moved to bin 54A1;
    // CPD keeps it in rack N-4A2 with its own minimum of 4. A part added by mistake is deleted.
    const created = await inventory.createPart(
      { partNumber: `MIS-J-${run}`, name: "BALL JOINT ASSY-LWR ARM", category: "Parts", uom: "EA", unitRate: 39258, priceCategoryCode: "A", binLocation: "53B3", minLevel: 5, maxLevel: 10, reorderQty: 2 },
      user.id,
    );
    joint = { id: created.id, partNumber: created.partNumber };
    await inventory.updatePart(joint.id, { unitRate: 40000, binLocation: "54A1" }, user.id);
    await inventory.updateStockLocation(cpd.id, joint.id, { rackLocation: "N-4A2", minimumStock: 4 }, user.id);
    const mistake = await inventory.createPart({ partNumber: `MIS-X-${run}`, name: "WRONG PART", category: "Parts", uom: "EA", unitRate: 100 }, user.id);
    await inventory.deletePart(mistake.id, user.id);
    bolt = await prisma.sparePart.create({
      data: { partCode: `MIS-B-${run}`, partNumber: `MIS-B-${run}`, name: "BOLT-FLANGE", unitPrice: 500, retailRate: 1035, priceCategoryCode: "A", minLevel: 10, maxLevel: 20 },
    });
    // Stock with no movement behind it: one ball joint and five bolts.
    await prisma.inventoryStock.update({ where: { branchId_partId: { branchId: cpd.id, partId: joint.id } }, data: { quantity: 1 } });
    await prisma.inventoryStock.create({ data: { branchId: cpd.id, partId: bolt.id, quantity: 5 } });

    // Mobis MRN: six ball joints at ₦37,314.
    const mit = await mobis.importMit(
      {
        destinationBranchId: cpd.id,
        invoiceNumber: `MIS-INV-${run}`,
        conversionRate: 1000,
        receivedMode: "AIR",
        lines: [{ orderNumber: "AV10K6Q01R", partNumber: joint.partNumber, quantity: 6, unitPrice: 37.314, caseNumber: "C1" }],
      },
      user.id,
    );
    await mobis.createMrn(mit.id, user.id, { lines: mit.lines.map((l: { id: string }) => ({ mitLineId: l.id, receivedQuantity: 6 })) });

    // Three sent to Kia Plaza on an STN at the ₦40,000 dealer rate (FIFO cost: the opening unit and two MRN units).
    const indent = await transfers.createIndent({ requestingBranchId: plaza.id, sourceBranchId: cpd.id, lines: [{ partId: joint.id, stockQuantity: 3 }] }, user.id);
    await transfers.approveIndent(indent.id, user.id, { pickerName: "YAHAYA" });
    await transfers.dispatchIndent(indent.id, user.id);
    await transfers.receiveIndent(indent.id, user.id);
    stnNumber = (await prisma.stockTransferNote.findFirstOrThrow({ where: { sourceBranchId: cpd.id } })).stnNumber;

    // A CPO for two, one billed at ₦82,800; a second CPO for three, cancelled unsupplied.
    const order = await sales.createOrder({ branchId: cpd.id, customerId: customer.id, pick: true, lines: [{ partId: joint.id, quantity: 2 }] }, user.id);
    await sales.createCounterSale({ branchId: cpd.id, customerId: customer.id, lines: [{ orderLineId: order.lines[0].id, quantity: 1 }] }, user.id);
    const cancelled = await sales.createOrder({ branchId: cpd.id, customerId: customer.id, lines: [{ partId: joint.id, quantity: 3 }] }, user.id);
    await sales.cancelOrder(cancelled.id, "Customer bought elsewhere", user.id);

    // Workshop: two ball joints to a Sorento at 15,000 km (one returned), and a bolt to a PDI job.
    const issueToJob = async (jobCardId: string, part: { id: string }, quantity: number, rate: number) => {
      const issuance = await prisma.partIssuance.create({ data: { branchId: cpd.id, sparePartId: part.id, jobCardId, issuedById: user.id, quantity } });
      await prisma.jobCardLine.create({ data: { jobCardId, kind: "PART", sparePartId: part.id, partIssuanceId: issuance.id, description: "Part", quantity, rate, amount: quantity * rate } });
      await prisma.inventoryStock.update({ where: { branchId_partId: { branchId: cpd.id, partId: part.id } }, data: { quantity: { decrement: quantity } } });
      await prisma.stockTransaction.create({ data: { branchId: cpd.id, partId: part.id, type: "ISSUED", quantity: -quantity, referenceId: issuance.id, recordedById: user.id } });
      return issuance;
    };
    const vehicle = await prisma.vehicle.create({ data: { customerId: customer.id, vin: `MISVIN${run}`, model: "SOR", customModel: "SORENTO" } });
    const job = await prisma.jobCard.create({ data: { branchId: cpd.id, vehicleId: vehicle.id, jobNumber: `MIS-J-${run}`, description: "Front suspension", mileage: 15000 } });
    const issued = await issueToJob(job.id, joint, 2, 82800);
    await prisma.inventoryStock.update({ where: { branchId_partId: { branchId: cpd.id, partId: joint.id } }, data: { quantity: { increment: 1 } } });
    await prisma.stockTransaction.create({ data: { branchId: cpd.id, partId: joint.id, type: "RETURNED", quantity: 1, referenceId: issued.id, recordedById: user.id } });
    const pdiType = await prisma.workshopMaster.create({ data: { kind: "SERVICE_TYPE", code: `P${run}`, description: "PDI SERVICE", preDelivery: true } });
    const pdi = await prisma.jobCard.create({ data: { branchId: cpd.id, jobNumber: `MIS-P-${run}`, description: "PDI", serviceTypeId: pdiType.id } });
    await issueToJob(pdi.id, bolt, 1, 1035);

    // Two bolts written off.
    await inventory.adjustStock({ branchId: cpd.id, partId: bolt.id, quantity: -2, type: "ADJUSTMENT", notes: "Damaged in store", recordedById: user.id });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("compares stock with the branch's own minimum (else Part Master's) and the maximum", async () => {
    const levels = await report("stock-levels");
    expect(pick(levels.rows, "partNumber", "bin", "minLevel", "maxLevel", "reorderQty", "quantity", "level")).toEqual([
      [bolt.partNumber, "", 10, 20, null, 2, "Below minimum"],
      [joint.partNumber, "N-4A2", 4, 10, 2, 2, "Below minimum"],
    ]);

    const below = await report("stock-levels", { option: "BELOW_MIN" });
    expect(pick(below.rows, "partNumber", "shortfall", "orderQty", "value")).toEqual([
      [bolt.partNumber, 8, 18, 9000],
      [joint.partNumber, 2, 8, 320000],
    ]);
    expect(below.totals.value).toBe(329000);
  });

  it("works out the re-order quantity from consumption and compares the one entered", async () => {
    const r = await report("stock-levels", { option: "REORDER", days: 90 });
    // Ball joints: STN 3 + counter sale 1 + job 2 − returned 1. Bolts: one to the PDI job (SANs are not consumption).
    expect(pick(r.rows, "partNumber", "calculated", "entered", "difference", "monthly")).toEqual([
      [bolt.partNumber, 1, 0, -1, 0.33],
      [joint.partNumber, 5, 2, -3, 1.67],
    ]);
  });

  it("ranks the most consumed parts, with workshop issues by mileage", async () => {
    const r = await report("max-consumed");
    expect(r.columns.map((c) => c.label)).toEqual(expect.arrayContaining(["10001–20000 km", "Mileage not recorded"]));
    expect(pick(r.rows, "rank", "partNumber", "counterSale", "job", "stn", "quantity", "value", "mileage1", "mileageNone")).toEqual([
      [1, joint.partNumber, 1, 1, 3, 5, 200000, 1, null],
      [2, bolt.partNumber, 0, 1, 0, 1, 500, null, 1],
    ]);
    expect((await report("max-consumed", { topN: 1 })).rows).toHaveLength(1);
    const jobsOnly = await report("max-consumed", { option: "JOB" });
    expect(pick(jobsOnly.rows, "partNumber", "quantity", "stn")).toEqual([
      [bolt.partNumber, 1, 0],
      [joint.partNumber, 1, 0],
    ]);
  });

  it("splits workshop issues by vehicle model and mileage band", async () => {
    const r = await report("model-mileage-issue", { mileageLimits: [5000, 10000, 20000, 40000, 80000] });
    expect(pick(r.rows, "group", "partNumber", "mileage2", "mileageNone", "quantity")).toEqual([
      ["No vehicle", bolt.partNumber, null, 1, 1],
      ["SORENTO", joint.partNumber, 1, null, 1],
    ]);
  });

  it("states sale value against FIFO cost by kind of sale, returns taken off", async () => {
    const r = await report("profitability");
    expect(pick(r.rows, "group", "partNumber", "quantity", "sales", "cost", "margin", "marginPercent")).toEqual([
      ["Counter sale", joint.partNumber, 1, 82800, 37314, 45486, 54.93],
      // Two issued at ₦37,314 each, one returned into stock at the ₦40,000 dealer rate.
      ["Workshop job", joint.partNumber, 1, 82800, 34628, 48172, 58.18],
      ["PDI job", bolt.partNumber, 1, 1035, 500, 535, 51.69],
      ["STN", joint.partNumber, 3, 120000, 114628, 5372, 4.48],
      ["SAN", bolt.partNumber, 2, 0, 1000, -1000, null],
    ]);
    expect(r.totals).toMatchObject({ sales: 286635, cost: 188070, margin: 98565, marginPercent: 34.39 });

    const summary = await report("profitability", { summary: true });
    expect(summary.columns[0].key).toBe("category");
    expect(summary.rows.every((row) => row.category === "A")).toBe(true);
    expect(summary.totals).toEqual(r.totals);
  });

  it("measures how much of what was ordered was supplied", async () => {
    const r = await report("percent-fill");
    expect(pick(r.rows, "group", "orders", "ordered", "supplied", "notSupplied", "pending", "fill")).toEqual([
      ["Branch indent", 1, 3, 3, 0, 0, 100],
      // One billed, one still open, three cancelled.
      ["CPO", 2, 5, 1, 3, 1, 25],
    ]);
    expect(r.totals.fill).toBe(57.14);
    expect((await report("percent-fill", { option: "CPO" })).rows).toHaveLength(1);
  });

  it("keeps every rate set in Part Master, and deleted parts", async () => {
    const r = await report("part-rate-history", { partId: joint.id });
    expect(pick(r.rows, "action", "oldDealerRate", "newDealerRate", "oldRetailRate", "newRetailRate", "by")).toEqual([
      ["Added", null, 39258, null, 81264.06, "Emeka Store"],
      ["Edited", 39258, 40000, 81264.06, 82800, "Emeka Store"],
    ]);
    const deleted = await report("part-rate-history", { option: "DELETED" });
    expect(deleted.rows.filter((row) => row.partNumber === `MIS-X-${run}`)).toEqual([
      expect.objectContaining({ action: "Deleted", oldDealerRate: 100, newDealerRate: null }),
    ]);
  });

  it("keeps every bin change, at the branch and in Part Master", async () => {
    const r = await report("part-bin-history", { partId: joint.id });
    expect(pick(r.rows, "location", "oldBin", "newBin", "by")).toEqual([
      ["Part Master", "53B3", "54A1", "Emeka Store"],
      [cpd.name, null, "N-4A2", "Emeka Store"],
    ]);
    expect((await report("part-bin-history", { partId: joint.id, option: "BRANCH" })).rows).toHaveLength(1);
    expect((await report("part-bin-history", { partId: joint.id, branchId: plaza.id, option: "BRANCH" })).rows).toHaveLength(0);
  });

  it("lists the STN packing list by case and part, or one line per packing list", async () => {
    const detail = await report("packing-list-register");
    expect(pick(detail.rows, "group", "stnNumber", "partNumber", "quantity", "rate", "value")).toEqual([[plaza.name, stnNumber, joint.partNumber, 3, 40000, 120000]]);
    expect(detail.rows[0].caseNumber).toBeTruthy();

    const byCourier = await report("packing-list-register", { option: "COURIER", summary: true });
    expect(byCourier.rows).toEqual([expect.objectContaining({ group: "No courier", toBranch: plaza.name, cases: 1, quantity: 3, value: 120000 })]);
  });

  it("summarises consumption by part category", async () => {
    const r = await report("consumption", { summary: true });
    expect(r.rows).toEqual([expect.objectContaining({ category: "A", issued: 4, transferred: 3, returned: 1, net: 6, value: 200500 })]);
  });
});

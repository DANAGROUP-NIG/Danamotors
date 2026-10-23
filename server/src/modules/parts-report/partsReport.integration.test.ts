/**
 * Parts reports against a real database: counter sales, returns, cancellations, CPOs, Mobis
 * receipts (MIT and MRN), indents and STNs.
 * Skipped unless TEST_DATABASE_URL points at a separate, migrated database.
 */
import type { PrismaClient } from "@prisma/client";
import type { PartsReportService as ReportType } from "./partsReport.service";
import type { PartSaleService as SaleType } from "../part-sale/partSale.service";
import type { StockTransferService as TransferType } from "../stock-transfer/stockTransfer.service";
import type { MobisPurchaseService as MobisType } from "../mobis-purchase/mobisPurchase.service";

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

jest.setTimeout(60_000);

describeDb("Parts reports (database)", () => {
  let prisma: PrismaClient;
  let reports: ReportType;
  let sales: SaleType;
  let transfers: TransferType;
  let mobis: MobisType;
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-8);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
  let cpd: { id: string };
  let branch: { id: string };
  let user: { id: string };
  let customer: { id: string };
  let mirror: { id: string };
  let oil: { id: string };

  const report = (kind: string, extra: Record<string, unknown> = {}) =>
    reports.run(kind, { from: today, to: today, branchId: cpd.id, ...extra });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = require("../../prisma/client").default;
    reports = new (require("./partsReport.service").PartsReportService)();
    sales = new (require("../part-sale/partSale.service").PartSaleService)();
    transfers = new (require("../stock-transfer/stockTransfer.service").StockTransferService)();
    mobis = new (require("../mobis-purchase/mobisPurchase.service").MobisPurchaseService)();
    const role = await prisma.role.upsert({ where: { name: "GeneralStoreManager" }, update: {}, create: { name: "GeneralStoreManager" } });
    cpd = await prisma.branch.create({ data: { name: `CPD Reports ${run}` } });
    branch = await prisma.branch.create({ data: { name: `Kia Plaza Reports ${run}` } });
    user = await prisma.user.create({
      data: { email: `reports.${run}@test.local`, passwordHash: "x", firstName: "Emeka", lastName: "Store", roleId: role.id, branchId: cpd.id },
    });
    customer = await prisma.customer.create({ data: { firstName: "Cavem", lastName: "Ltd", companyName: `CAVEM ${run}`, code: `R${run}`, branchId: cpd.id } });
    await prisma.partCategory.upsert({ where: { code: "A" }, update: {}, create: { code: "A", description: "Co-op parts", markupMultiplier: 2.07 } });
    await prisma.partCategory.upsert({ where: { code: "O" }, update: {}, create: { code: "O", description: "Oil & lubricants", markupMultiplier: 1.5 } });
    mirror = await prisma.sparePart.create({
      data: { partCode: `RPT-M-${run}`, partNumber: `RPT-M-${run}`, name: "MIRROR ASSY", unitPrice: 132036.62, retailRate: 273313.81, priceCategoryCode: "A", binLocation: "53B3" },
    });
    oil = await prisma.sparePart.create({
      data: { partCode: `RPT-O-${run}`, partNumber: `RPT-O-${run}`, name: "ENGINE OIL 4L", unitPrice: 4700, retailRate: 7050, taxable: false, priceCategoryCode: "O", partType: "O" },
    });
    await prisma.inventoryStock.createMany({
      data: [
        { branchId: cpd.id, partId: mirror.id, quantity: 10 },
        { branchId: cpd.id, partId: oil.id, quantity: 50 },
      ],
    });

    // Bill 1: legacy CPD pricing (22.5% cash discount). Bill 2: FOC, then cancelled.
    const order = await sales.createOrder(
      { branchId: cpd.id, customerId: customer.id, pick: true, lines: [{ partId: mirror.id, quantity: 3 }, { partId: oil.id, quantity: 4 }] },
      user.id,
    );
    const [m, o] = order.lines;
    const sale = await sales.createCounterSale(
      { branchId: cpd.id, customerId: customer.id, cashDiscountPercent: 22.5, lines: [{ orderLineId: m.id, quantity: 1 }, { orderLineId: o.id, quantity: 4 }] },
      user.id,
    );
    await sales.createReturn(sale.id, { lines: [{ invoiceLineId: sale.invoice.lines.find((l) => l.partId === oil.id)!.id, quantity: 2 }] }, user.id);
    const foc = await sales.createCounterSale(
      { branchId: cpd.id, customerId: customer.id, cashDiscountPercent: 100, lines: [{ orderLineId: m.id, quantity: 1 }] },
      user.id,
    );
    await sales.cancelCounterSale(foc.id, "Raised in error", user.id);

    // A branch indent shipped on an STN.
    const indent = await transfers.createIndent({ requestingBranchId: branch.id, sourceBranchId: cpd.id, lines: [{ partId: oil.id, stockQuantity: 5 }] }, user.id);
    await transfers.approveIndent(indent.id, user.id, { pickerName: "YAHAYA" });
    await transfers.dispatchIndent(indent.id, user.id);

    // Two Mobis invoices: one received with a damaged and a missing tin, one still in transit.
    const mobisLine = (partNumber: string, quantity: number, caseNumber: string) => ({ orderNumber: "AV10K6Q01R", partNumber, quantity, unitPrice: 10, caseNumber });
    const received = await mobis.importMit(
      { destinationBranchId: cpd.id, invoiceNumber: `INV-A-${run}`, conversionRate: 1000, receivedMode: "AIR", lines: [mobisLine(`RPT-M-${run}`, 2, "C1"), mobisLine(`RPT-O-${run}`, 6, "C2")] },
      user.id,
    );
    await mobis.createMrn(received.id, user.id, {
      lines: received.lines.map((l) => (l.partId === oil.id ? { mitLineId: l.id, receivedQuantity: 4, damagedQuantity: 1 } : { mitLineId: l.id, receivedQuantity: 2 })),
    });
    await mobis.importMit({ destinationBranchId: cpd.id, invoiceNumber: `INV-B-${run}`, conversionRate: 1000, receivedMode: "AIR", lines: [mobisLine(`RPT-O-${run}`, 3, "C9")] }, user.id);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("lists bill lines priced like the bill, excluding cancelled bills", async () => {
    const r = await report("counter-sales", { option: "LINES" });
    expect(r.rows).toHaveLength(2);
    const mirrorLine = r.rows.find((row) => row.partNumber === `RPT-M-${run}`)!;
    expect(mirrorLine).toMatchObject({ gross: 273313.81, discount: 61495.61, vat: 15886.37, net: 227704.57 });
    // Lines add up to the bill before its ₦10 round-off (bill total 249,550).
    expect(r.totals.net).toBe(249559.57);

    // The same bill in the legacy layout: one line, with its round-off, adding up to the bill total.
    const bills = await report("counter-sales");
    expect(bills.rows).toEqual([expect.objectContaining({ vat: 15886.37, roundOff: -9.57, net: 249550 })]);
    const [bill] = bills.rows as Record<string, number>[];
    // The mirror is taxable spares and the oil non-taxable oil, both before the 22.5% cash discount.
    expect(bill).toMatchObject({ sparesTaxable: 273313.81, sparesExempt: 0, oilTaxable: 0, oilExempt: 28200 });
    expect(bill.gatePass).toMatch(/^\d{10}$/);
    expect(bills.totals.net).toBe(249550);
  });

  it("summarises bills, splits taxable and exempt value by day, and lists cancellations", async () => {
    // Defaults to the legacy executive-wise layout: value by part type before the cash discount.
    const summary = await report("counter-sales-summary");
    expect(summary.rows).toEqual([expect.objectContaining({ spares: 273313.81, accessories: 0, oil: 28200, net: 249550, roundOff: -9.57 })]);

    const datewise = await report("counter-sales-summary", { option: "DAY" });
    expect(datewise.rows[0]).toMatchObject({ bills: 1, taxable: 211818.2, exempt: 21855, vat: 15886.37, net: 249550 });

    const annexure = await report("counter-sales-tax-annexure", { includeCancelled: true });
    expect(annexure.rows.map((row) => row.status).sort()).toEqual(["Cancelled", "Partially Paid"]);
    expect(annexure.totals.net).toBe(249550);
    expect(annexure.totals.gross).toBe(301513.81);

    const foc = await report("counter-sales-cancellations", { option: "FOC" });
    expect(foc.rows).toEqual([expect.objectContaining({ type: "FOC", remark: "Raised in error", cancelledBy: "Emeka Store" })]);
    expect((await report("counter-sales-cancellations", { option: "COUNTER_SALE" })).rows).toHaveLength(0);
  });

  it("reports returns and revenue net of returns against dealer cost", async () => {
    const returns = await report("counter-sales-returns");
    expect(returns.rows).toEqual([expect.objectContaining({ quantity: 2, gross: 14100, discount: 3172.5, vat: 0, net: 10927.5 })]);

    const revenue = await report("counter-sales-revenue");
    const oilRow = revenue.rows.find((row) => row.category === "O")!;
    // 4 sold and 2 returned at 7,050 less 22.5%, against 2 x 4,700 dealer cost.
    expect(oilRow).toMatchObject({ quantity: 2, sales: 21855, returns: 10927.5, netSales: 10927.5, cost: 9400, margin: 1527.5 });
    const byCustomer = await report("counter-sales-revenue", { option: "CUSTOMER" });
    expect(byCustomer.grouped).toBe(true);
    expect(byCustomer.rows[0].group).toContain(`CAVEM ${run}`);
  });

  it("groups bills by sales executive", async () => {
    const r = await report("counter-sales-summary", { option: "EXECUTIVE", executiveId: user.id });
    expect(r.grouped).toBe(true);
    expect(r.rows).toEqual([expect.objectContaining({ group: "Emeka Store", net: 249550 })]);
  });

  it("filters CPO lines by status and part category", async () => {
    const pending = await report("cpo-register", { status: "PENDING" });
    expect(pending.rows.map((row) => [row.partNumber, row.pending])).toEqual([[`RPT-M-${run}`, 2]]);
    const oilOnly = await report("cpo-register", { status: "EXECUTED", fullyExecuted: true, priceCategory: "O" });
    expect(oilOnly.rows).toEqual([expect.objectContaining({ ordered: 4, billed: 4 })]);
  });

  it("reports picking, STNs by store and inward indents", async () => {
    const picking = await report("picking-register");
    expect(picking.rows).toEqual([expect.objectContaining({ picked: 5, picker: "YAHAYA" })]);
    // Store wise: headed by the sending store, without the receiving store or rate.
    const stores = await report("store-wise-stn");
    expect(stores.columns.map((c) => c.label)).toEqual([
      "Bill Number", "Date", "Part No", "Flag", "Description", "Qty", "Amount", "Tax", "Discount", "Others", "Net Amount",
    ]);
    const [storeLine] = stores.rows;
    const day = today.split("-").reverse().join("/");
    expect(stores.rows).toEqual([
      expect.objectContaining({
        group: `${storeLine.stnNumber} · ${day} · CPD Reports ${run}`,
        quantity: 5,
        amount: 23500,
        tax: 0,
        discount: 0,
        others: 0,
        net: 23500,
      }),
    ]);
    const inward = await report("indent-inward-register", { status: "EXECUTED", fullyExecuted: true });
    expect(inward.rows).toEqual([expect.objectContaining({ requested: 5, dispatched: 5, backOrder: 0 })]);
  });

  it("reports Mobis MITs, MRNs by vendor or invoice, shortages and receipts in bin order", async () => {
    const pending = await report("mit-register", { option: "PENDING" });
    expect(pending.rows).toEqual([expect.objectContaining({ invoiceNumber: `INV-B-${run}`, caseNumber: "C9", quantity: 3, pending: 3, value: 30000 })]);
    const all = await report("mit-register", { vendor: "MOBIS" });
    expect(all.rows).toHaveLength(3);
    expect(all.totals).toMatchObject({ quantity: 11, received: 6, damaged: 1, short: 1, pending: 3 });

    const vendorWise = await report("mrn-register");
    expect(vendorWise.grouped).toBe(true);
    expect(vendorWise.rows.map((row) => [row.group, row.partNumber, row.received, row.rate, row.value])).toEqual([
      ["MOBIS", `RPT-M-${run}`, 2, 10000, 20000],
      ["MOBIS", `RPT-O-${run}`, 4, 10000, 40000],
    ]);
    const summary = await report("mrn-register", { option: "SUMMARY" });
    expect(summary.columns.map((c) => c.key)).toContain("invoiceDate");
    expect(summary.rows).toEqual([expect.objectContaining({ invoiceNumber: `INV-A-${run}`, lines: 2, received: 6, damaged: 1, short: 1, value: 60000 })]);

    const shortage = await report("receipt-shortage");
    expect(shortage.rows).toEqual([expect.objectContaining({ partNumber: `RPT-O-${run}`, caseNumber: "C2", expected: 6, damaged: 1, short: 1, value: 20000 })]);
    // Legacy MIT and MRN Mismatch Report: found by the MIT number and vendor.
    const byMit = await report("receipt-shortage", { search: String(shortage.rows[0].mitNumber), vendor: "MOBIS" });
    expect(byMit.rows).toHaveLength(1);
    expect((await report("receipt-shortage", { vendor: "OTHER VENDOR" })).rows).toHaveLength(0);

    const checklist = await report("receipt-checklist");
    // The oil has no bin, so it sorts before the mirror in 53B3.
    expect(checklist.rows.map((row) => [row.bin, row.partNumber, row.quantity, row.from])).toEqual([
      ["", `RPT-O-${run}`, 4, "MOBIS"],
      ["53B3", `RPT-M-${run}`, 2, "MOBIS"],
    ]);
  });

  it("reports the branch's outward indents and what is in transit to it", async () => {
    const atBranch = (kind: string, extra: Record<string, unknown> = {}) => reports.run(kind, { from: today, to: today, branchId: branch.id, ...extra });
    const outward = await atBranch("indent-outward-register");
    expect(outward.rows).toEqual([expect.objectContaining({ toBranch: `CPD Reports ${run}`, requested: 5, dispatched: 5 })]);
    expect((await report("indent-outward-register")).rows).toHaveLength(0);

    const inTransit = await atBranch("branch-in-transit", { option: "PENDING" });
    expect(inTransit.rows).toEqual([expect.objectContaining({ fromBranch: `CPD Reports ${run}`, quantity: 5, pending: 5, value: 23500 })]);
  });

  it("lists transfer receipts (SRN) at the receiving branch and stock adjustments", async () => {
    // Documents are headed "number · dd/mm/yyyy · store", as legacy prints them.
    const day = today.split("-").reverse().join("/");
    const stnRegister = await report("stn-register");
    expect(stnRegister.grouped).toBe(true);
    const [stn] = stnRegister.rows;
    expect(stnRegister.columns.map((c) => c.label)).toEqual(["Bill Number", "Date", "Store", "Part No", "Flag", "Description", "Qty", "Rate", "Amount"]);
    expect(stn.group).toBe(`${stn.stnNumber} · ${day} · Kia Plaza Reports ${run}`);
    const stnRecord = await prisma.stockTransferNote.findUniqueOrThrow({ where: { stnNumber: String(stn.stnNumber) } });
    await transfers.receiveStn(stnRecord.id, user.id, { lines: [{ stnLineId: (await prisma.stockTransferNoteLine.findFirstOrThrow({ where: { stnId: stnRecord.id } })).id, receivedQuantity: 4, damagedQuantity: 1 }] });
    const srn = await reports.run("stn-register", { from: today, to: today, branchId: branch.id, option: "SRN" });
    expect(srn.columns.map((c) => c.key)).toEqual(["mrnNumber", "date", "fromBranch", "partNumber", "partFlag", "description", "quantity", "rate", "amount"]);
    // The SRN is valued on what was received (4 of 5; 1 damaged) at the STN rate.
    expect(srn.rows).toEqual([expect.objectContaining({ fromBranch: `CPD Reports ${run}`, quantity: 4, rate: 4700, amount: 18800 })]);
    expect(srn.rows[0].group).toBe(`${srn.rows[0].mrnNumber} · ${day} · CPD Reports ${run}`);
    const srnShortage = await reports.run("receipt-shortage", { from: today, to: today, branchId: branch.id, option: "SRN", otherBranchId: cpd.id });
    expect(srnShortage.rows).toEqual([expect.objectContaining({ stnNumber: stn.stnNumber, expected: 5, damaged: 1, short: 0, value: 4700 })]);
    expect((await reports.run("branch-in-transit", { from: today, to: today, branchId: branch.id, option: "PENDING" })).rows).toHaveLength(0);

    await prisma.stockTransaction.createMany({
      data: [
        { branchId: cpd.id, partId: oil.id, type: "ADJUSTMENT", quantity: 3, notes: "Found in physical count", recordedById: user.id },
        { branchId: cpd.id, partId: oil.id, type: "ADJUSTMENT", quantity: -1, notes: "Leaking tin", recordedById: user.id },
      ],
    });
    const additions = await report("stock-adjustments", { option: "ADDITION" });
    expect(additions.rows).toEqual([expect.objectContaining({ quantity: 3, value: 14100, notes: "Found in physical count" })]);
    expect((await report("stock-adjustments")).totals.quantity).toBe(2);
  });

  it("consolidates consumption and lists issues voucher wise", async () => {
    const consumption = await report("consumption");
    const stockOf = async (partId: string) => (await prisma.inventoryStock.findUniqueOrThrow({ where: { branchId_partId: { branchId: cpd.id, partId } } })).quantity;
    // Oil: 4 sold less 2 returned, and 5 on the STN, all at the ₦7,050 retail rate.
    expect(consumption.rows.find((row) => row.partNumber === `RPT-O-${run}`)).toMatchObject({
      dealerRate: 4700,
      retailRate: 7050,
      flag: "O",
      job: 0,
      jobAmount: 0,
      counterSale: 2,
      counterSaleAmount: 14100,
      stn: 5,
      quantity: 7,
      value: 49350,
      // Of the SANs above (3 found, 1 written off) only the write-off shows, outside the total issues.
      san: 1,
      closing: await stockOf(oil.id),
    });
    // Mirror: one billed at the bill line rate; the cancelled FOC bill is left out, not issued and returned.
    expect(consumption.rows.find((row) => row.partNumber === `RPT-M-${run}`)).toMatchObject({ counterSale: 1, quantity: 1, value: 273313.81 });
    const noReturns = await report("consumption", { includeReturns: false });
    expect(noReturns.rows.find((row) => row.partNumber === `RPT-O-${run}`)).toMatchObject({ counterSale: 4, stn: 5, quantity: 9, value: 63450 });
    expect(noReturns.rows.find((row) => row.partNumber === `RPT-M-${run}`)).toMatchObject({ counterSale: 1, quantity: 1 });

    // Voucher wise in sections; the cancelled FOC bill is left out (its stock went back).
    const checklist = await report("issue-checklist");
    expect(checklist.grouped).toBe(true);
    expect(checklist.rows.map((row) => [row.group, row.partNumber, row.issuedTo, row.quantity, row.amount])).toEqual([
      ["STN", `RPT-O-${run}`, `Kia Plaza Reports ${run}`, 5, 23500],
      ["Counter sales", `RPT-M-${run}`, `CAVEM ${run}`, 1, 227704.57],
      ["Counter sales", `RPT-O-${run}`, `CAVEM ${run}`, 4, 21855],
    ]);
    expect(checklist.totals).toEqual({ quantity: 10, amount: 273059.57 });
    // Required: the indent line for the STN, the CPO line (3 ordered, 1 billed) for the bill.
    expect(checklist.rows.map((row) => [row.code, row.partFlag, row.required])).toEqual([
      [null, "O", 5],
      [`R${run}`, "O", 3],
      [`R${run}`, "O", 4],
    ]);
    expect((await report("issue-checklist", { partId: mirror.id })).rows).toHaveLength(1);
  });

  it("lists workshop issues at the job card rate and other issues at retail rate", async () => {
    const job = await prisma.jobCard.create({ data: { branchId: cpd.id, jobNumber: `JC-${run}`, description: "Service", customerId: customer.id } });
    const toJob = await prisma.partIssuance.create({ data: { branchId: cpd.id, sparePartId: oil.id, jobCardId: job.id, issuedById: user.id, quantity: 2 } });
    await prisma.jobCardLine.create({ data: { jobCardId: job.id, kind: "PART", sparePartId: oil.id, partIssuanceId: toJob.id, description: "ENGINE OIL 4L", quantity: 2, rate: 7000, amount: 14000 } });
    await prisma.partIssuance.create({ data: { branchId: cpd.id, sparePartId: oil.id, issuedById: user.id, quantity: 1, notes: "Showroom top-up" } });

    const rows = (await report("issue-checklist", { partId: oil.id })).rows.filter((row) => String(row.group).endsWith("issues"));
    expect(rows.map((row) => [row.group, row.voucher, row.issuedTo, row.quantity, row.amount])).toEqual([
      ["Workshop issues", `JC-${run}`, `CAVEM ${run}`, 2, 14000],
      ["Other issues", "", "Showroom top-up", 1, 7050],
    ]);
  });

  it("splits workshop issues in the consumption report by who pays the job card line", async () => {
    const job = await prisma.jobCard.create({ data: { branchId: cpd.id, jobNumber: `JC-W-${run}`, description: "Warranty repair", customerId: customer.id } });
    const issue = async (quantity: number, jobCardId?: string) => {
      const issuance = await prisma.partIssuance.create({ data: { branchId: cpd.id, sparePartId: oil.id, jobCardId, issuedById: user.id, quantity } });
      await prisma.stockTransaction.create({ data: { branchId: cpd.id, partId: oil.id, type: "ISSUED", quantity: -quantity, referenceId: issuance.id, recordedById: user.id } });
      return issuance;
    };
    // Two to a warranty line at ₦7,000, one of them returned; one consumable issue at the part's retail rate.
    const warranty = await issue(2, job.id);
    await prisma.jobCardLine.create({
      data: { jobCardId: job.id, kind: "PART", sparePartId: oil.id, partIssuanceId: warranty.id, description: "ENGINE OIL 4L", quantity: 2, rate: 7000, amount: 14000, chargeType: "WARRANTY" },
    });
    await prisma.stockTransaction.create({ data: { branchId: cpd.id, partId: oil.id, type: "RETURNED", quantity: 1, referenceId: warranty.id, recordedById: user.id } });
    await issue(1);
    // A PDI job: one tin to the customer's account, one under warranty.
    const pdiType = await prisma.workshopMaster.create({ data: { kind: "SERVICE_TYPE", code: `P${run}`, description: "PDI SERVICE", preDelivery: true } });
    const pdi = await prisma.jobCard.create({ data: { branchId: cpd.id, jobNumber: `JC-P-${run}`, description: "PDI", serviceTypeId: pdiType.id } });
    for (const chargeType of ["CUSTOMER", "WARRANTY"] as const) {
      const issuance = await issue(1, pdi.id);
      await prisma.jobCardLine.create({
        data: { jobCardId: pdi.id, kind: "PART", sparePartId: oil.id, partIssuanceId: issuance.id, description: "ENGINE OIL 4L", quantity: 1, rate: 7050, amount: 7050, chargeType },
      });
    }

    const r = await report("consumption", { partId: oil.id });
    expect(r.rows).toEqual([
      expect.objectContaining({ pdi: 1, pdiWarranty: 1, job: 0, warranty: 1, consumable: 1, counterSale: 2, stn: 5, quantity: 11, value: 77500, san: 1 }),
    ]);
    expect(r.totals).toMatchObject({ pdi: 1, pdiWarranty: 1, warranty: 1, consumable: 1, quantity: 11, value: 77500, san: 1 });
  });

  it("lists sample parts (flag F) in their own column at no value", async () => {
    const sample = await prisma.sparePart.create({
      data: { partCode: `RPT-F-${run}`, partNumber: `RPT-F-${run}`, name: "FILTER ASSY-AIR", unitPrice: 31605.12, retailRate: 65422.6, partFlag: "F", priceCategoryCode: "A" },
    });
    const issuance = await prisma.partIssuance.create({ data: { branchId: cpd.id, sparePartId: sample.id, issuedById: user.id, quantity: 2 } });
    await prisma.stockTransaction.create({ data: { branchId: cpd.id, partId: sample.id, type: "ISSUED", quantity: -2, referenceId: issuance.id, recordedById: user.id } });

    const r = await report("consumption", { partId: sample.id });
    expect(r.rows).toEqual([expect.objectContaining({ flag: "F", samples: 2, consumable: 0, quantity: 2, value: 0 })]);
    // Purchase source (part flag) and part type filters: a spare part (the default), bought as an FOC item.
    expect((await report("consumption", { partId: sample.id, partFlag: "F", partType: "S" })).rows).toHaveLength(1);
    expect((await report("consumption", { partId: sample.id, partFlag: "O" })).rows).toHaveLength(0);
    expect((await report("consumption", { partId: sample.id, partType: "O" })).rows).toHaveLength(0);
  });
});

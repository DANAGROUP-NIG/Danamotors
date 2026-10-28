/**
 * Handheld documents against a real database: indent pick, CPO pick and MIT receiving.
 * Skipped unless TEST_DATABASE_URL points at a separate, migrated database.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/danamotors_test npx jest handheld.integration
 */
import type { PrismaClient } from "@prisma/client";
import type { HandheldService as ServiceType } from "./handheld.service";

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

jest.setTimeout(60_000);

describeDb("Handheld documents (database)", () => {
  let prisma: PrismaClient;
  let service: ServiceType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let transfers: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let partSale: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mobis: any;
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9);
  let cpd: { id: string };
  let kp: { id: string };
  let manager: { id: string };
  let requester: { id: string };
  let picker: { id: string };
  let retainer: { id: string };
  let horn: { id: string };
  let customer: { id: string };

  const stockOf = (partId: string) =>
    prisma.inventoryStock.findUniqueOrThrow({ where: { branchId_partId: { branchId: cpd.id, partId } } });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = require("../../prisma/client").default;
    service = new (require("./handheld.service").HandheldService)();
    transfers = new (require("../stock-transfer/stockTransfer.service").StockTransferService)();
    partSale = new (require("../part-sale/partSale.service").PartSaleService)();
    mobis = new (require("../mobis-purchase/mobisPurchase.service").MobisPurchaseService)();

    const role = await prisma.role.upsert({ where: { name: "BranchStoreManager" }, update: {}, create: { name: "BranchStoreManager" } });
    cpd = await prisma.branch.create({ data: { name: `CPD HH ${run}` } });
    kp = await prisma.branch.create({ data: { name: `Kia Plaza HH ${run}` } });
    const user = (label: string, branchId: string) =>
      prisma.user.create({ data: { email: `${label}.hh${run}@test.local`, passwordHash: "x", firstName: label, lastName: "Test", roleId: role.id, branchId } });
    manager = await user("cpd", cpd.id);
    requester = await user("kp", kp.id);
    picker = await prisma.employee.create({ data: { code: `P${run}`.slice(0, 10), name: "Picker 00015", branchId: cpd.id } });
    // Legacy BI 2026000009: 8659028000 "Retaine assy-bumper", bin 59A3, rate 1155.06.
    retainer = await prisma.sparePart.create({ data: { partNumber: `8659028000-${run}`, name: "RETAINE ASSY-BUMPER", unitPrice: 1155.06, retailRate: 1155.06 } });
    horn = await prisma.sparePart.create({ data: { partNumber: `96611P2700-${run}`, name: "HORN ASSY", unitPrice: 12000, retailRate: 18000 } });
    await prisma.inventoryStock.createMany({
      data: [
        { branchId: cpd.id, partId: retainer.id, quantity: 20, rackLocation: "59A3" },
        { branchId: cpd.id, partId: horn.id, quantity: 10, rackLocation: "1D3/1D2" },
      ],
    });
    customer = await prisma.customer.create({ data: { firstName: "CSIL", lastName: "Ibadan", companyName: `CSIL HH ${run}`, code: `H${run}`.slice(0, 12), branchId: cpd.id } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("sends an indent's picking list, releases a short pick to back order, and refuses a second upload", async () => {
    const indent = await transfers.createIndent(
      { requestingBranchId: kp.id, sourceBranchId: cpd.id, authorisedBy: "SM", lines: [{ partId: retainer.id, urgentQuantity: 10 }, { partId: horn.id, urgentQuantity: 1 }] },
      requester.id,
    );
    const approved = await transfers.approveIndent(indent.id, manager.id);
    const listId = approved.openPickingList.id;

    expect((await service.listPickers(cpd.id)).map((p) => p.id)).toContain(picker.id);

    const sources = await service.listSources("INDENT_PICK", cpd.id);
    expect(sources.map((s) => s.sourceId)).toContain(listId);

    const doc = await service.createDocument({ type: "INDENT_PICK", sourceId: listId, pickerId: picker.id, manual: true }, manager.id);
    expect(doc).toMatchObject({ status: "SENT", pickerName: "Picker 00015", lineCount: 2 });
    expect(doc.documentNumber).toMatch(/^\d{10}$/);
    // Bin order: 1D3/1D2 before 59A3.
    expect(doc.lines.map((l) => [l.binLocation, l.expectedQuantity])).toEqual([["1D3/1D2", 1], ["59A3", 10]]);
    await expect(service.createDocument({ type: "INDENT_PICK", sourceId: listId, pickerId: picker.id, manual: true }, manager.id)).rejects.toThrow(/Already sent to a handheld/);
    expect((await service.listSources("INDENT_PICK", cpd.id)).map((s) => s.sourceId)).not.toContain(listId);

    const [hornLine, retainerLine] = doc.lines;
    const result = await service.upload(
      doc.id,
      { lines: [{ lineId: retainerLine.id, quantity: 7, shortReason: "LESS_IN_BIN" }, { lineId: hornLine.id, quantity: 1 }] },
      manager.id,
    );
    expect(result.totals).toMatchObject({ expected: 11, quantity: 8, short: 3 });
    expect(result.document.status).toBe("UPLOADED");
    expect(result.document.uploadedAt).not.toBeNull();

    expect(await stockOf(retainer.id)).toMatchObject({ quantity: 20, reservedQuantity: 7 });
    const after = await transfers.getIndent(indent.id);
    expect(after.status).toBe("PICKED");
    const retainerIndentLine = after.lines.find((l: { partId: string }) => l.partId === retainer.id);
    expect(retainerIndentLine.backOrderQuantity).toBe(3);
    expect(after.openPickingList.pickerName).toBe("Picker 00015");

    await expect(service.upload(doc.id, { lines: [{ lineId: hornLine.id, quantity: 1 }] }, manager.id)).rejects.toThrow(/already posted/);

    // The indent page lists every document of the indent, with lines.
    const listed = await service.listDocuments({ types: ["INDENT_PICK"], indentId: indent.id });
    expect(listed.map((d) => [d.documentNumber, d.lines?.length])).toEqual([[doc.documentNumber, 2]]);

    // Dispatch ships what was picked; nothing more goes to back order.
    await transfers.dispatchIndent(indent.id, manager.id);
    expect(await stockOf(retainer.id)).toMatchObject({ quantity: 13, reservedQuantity: 0 });
  });

  it("cancels the picking list when nothing was picked, so the indent can be picked again", async () => {
    await prisma.inventoryStock.update({ where: { branchId_partId: { branchId: cpd.id, partId: horn.id } }, data: { reservedQuantity: 0 } });
    const indent = await transfers.createIndent(
      { requestingBranchId: kp.id, sourceBranchId: cpd.id, authorisedBy: "SM", lines: [{ partId: horn.id, urgentQuantity: 2 }] },
      requester.id,
    );
    const approved = await transfers.approveIndent(indent.id, manager.id);
    const doc = await service.createDocument({ type: "INDENT_PICK", sourceId: approved.openPickingList.id, pickerId: picker.id, manual: true }, manager.id);
    const before = await stockOf(horn.id);
    await expect(service.upload(doc.id, { lines: [] }, manager.id)).rejects.toThrow(/Nothing was recorded/);
    await service.upload(doc.id, { lines: [{ lineId: doc.lines[0].id, quantity: 0, shortReason: "NOT_FOUND" }] }, manager.id);
    expect((await stockOf(horn.id)).reservedQuantity).toBe(before.reservedQuantity - 2);
    const after = await transfers.getIndent(indent.id);
    expect(after.status).toBe("APPROVED");
    expect(after.openPickingList).toBeFalsy();
    expect(after.lines[0].backOrderQuantity).toBe(2);
  });

  it("cancels a document on the device when the picking list is dispatched first", async () => {
    const indent = await transfers.createIndent(
      { requestingBranchId: kp.id, sourceBranchId: cpd.id, authorisedBy: "SM", lines: [{ partId: horn.id, urgentQuantity: 1 }] },
      requester.id,
    );
    const approved = await transfers.approveIndent(indent.id, manager.id);
    const doc = await service.createDocument({ type: "INDENT_PICK", sourceId: approved.openPickingList.id, pickerId: picker.id, manual: true }, manager.id);
    await transfers.dispatchIndent(indent.id, manager.id);
    const stale = await service.getDocument(doc.id);
    expect(stale.status).toBe("CANCELLED");
    expect(stale.cancelRemark).toMatch(/Dispatched on STN/);
    await expect(service.upload(doc.id, { lines: [{ lineId: doc.lines[0].id, quantity: 1 }] }, manager.id)).rejects.toThrow(/cancelled: Dispatched/);
  });

  it("returns a CPO short pick to free stock and keeps a substitute as a note", async () => {
    const order = await partSale.createOrder(
      { branchId: cpd.id, customerId: customer.id, pick: true, lines: [{ partId: retainer.id, quantity: 4 }, { partId: horn.id, quantity: 1 }] },
      manager.id,
    );
    const reservedBefore = (await stockOf(retainer.id)).reservedQuantity;
    const doc = await service.createDocument({ type: "CPO_PICK", sourceId: order.id, pickerId: picker.id, manual: true }, manager.id);
    const retainerLine = doc.lines.find((l) => l.partId === retainer.id)!;
    const hornLine = doc.lines.find((l) => l.partId === horn.id)!;
    await service.upload(
      doc.id,
      {
        lines: [
          { lineId: retainerLine.id, quantity: 3, shortReason: "DAMAGED" },
          { lineId: hornLine.id, quantity: 0, shortReason: "OTHER", scannedPartNumber: "96611P2710" },
        ],
      },
      manager.id,
    );
    expect((await stockOf(retainer.id)).reservedQuantity).toBe(reservedBefore - 1);
    const after = await partSale.getOrder(order.id);
    expect(after.lines.map((l: { partId: string; pickedQuantity: number }) => [l.partId === retainer.id ? "retainer" : "horn", l.pickedQuantity]).sort()).toEqual([["horn", 0], ["retainer", 3]]);
    const uploaded = await service.getDocument(doc.id);
    expect(uploaded.lines.find((l) => l.partId === horn.id)).toMatchObject({ quantity: 0, scannedPartNumber: "96611P2710", shortReason: "OTHER" });
  });

  it("refuses an upload after the CPO changed on the web", async () => {
    const order = await partSale.createOrder(
      { branchId: cpd.id, customerId: customer.id, pick: true, lines: [{ partId: retainer.id, quantity: 1 }] },
      manager.id,
    );
    const doc = await service.createDocument({ type: "CPO_PICK", sourceId: order.id, pickerId: picker.id, manual: true }, manager.id);
    await partSale.releaseOrder(order.id);
    expect((await service.getDocument(doc.id)).status).toBe("CANCELLED");
  });

  it("verifies an MIT on the device, keeps extra parts as exceptions, and the store still posts the MRN", async () => {
    const mit = await prisma.materialInTransit.create({
      data: {
        mitNumber: `9${run}`.slice(0, 10),
        destinationBranchId: cpd.id,
        vendor: "MOBIS",
        invoiceNumber: `A6DA${run}`,
        conversionRate: 2700,
        totalCases: 1,
        totalQuantity: 3,
        lines: {
          create: [
            { partId: retainer.id, caseNumbers: "SPD2APD00183", quantity: 1, unitPrice: 9.73, amount: 9.73 },
            { partId: horn.id, caseNumbers: "SPD2APD00183", quantity: 2, unitPrice: 332.87, amount: 665.74 },
          ],
        },
      },
      include: { lines: true },
    });
    const doc = await service.createDocument({ type: "MIT_RECEIVE", sourceId: mit.id, pickerId: picker.id, manual: true }, manager.id);
    expect(doc.lines.map((l) => [l.caseNumber, l.expectedQuantity])).toEqual([["SPD2APD00183", 1], ["SPD2APD00183", 2]]);
    const hornLine = doc.lines.find((l) => l.partId === horn.id)!;
    await expect(service.upload(doc.id, { lines: [{ lineId: hornLine.id, quantity: 2, damagedQuantity: 1 }] }, manager.id)).rejects.toThrow(/invoice has 2/);

    const stockBefore = await stockOf(horn.id);
    const result = await service.upload(
      doc.id,
      { lines: [{ lineId: hornLine.id, quantity: 1, damagedQuantity: 1 }], extras: [{ partNumber: "97626H9000", quantity: 1, note: "loose in case" }] },
      manager.id,
    );
    expect(result.totals).toMatchObject({ quantity: 1, damaged: 1, unreported: 1 });
    const extra = result.document.lines.find((l) => l.extra)!;
    expect(extra).toMatchObject({ partNumber: "97626H9000", partId: null, quantity: 1, expectedQuantity: 0 });
    expect((await prisma.materialInTransit.findUniqueOrThrow({ where: { id: mit.id } })).status).toBe("VERIFIED");
    // Nothing moves into stock until the MRN.
    expect((await stockOf(horn.id)).quantity).toBe(stockBefore.quantity);

    const done = await mobis.createMrn(mit.id, manager.id, {
      lines: [{ mitLineId: mit.lines.find((l) => l.partId === horn.id)!.id, receivedQuantity: 1, damagedQuantity: 1 }],
    });
    expect(done.status).toBe("RECEIVED");
    expect((await stockOf(horn.id)).quantity).toBe(stockBefore.quantity + 1);
  });
});

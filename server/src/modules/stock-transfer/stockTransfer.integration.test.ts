/**
 * End-to-end tests for the stock transfer workflow against a real PostgreSQL
 * database. They are skipped unless TEST_DATABASE_URL is set, so CI without a
 * database still passes. Never point TEST_DATABASE_URL at a shared database:
 * the tests create their own branches, users and parts with unique names.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/danamotors_test npx jest stockTransfer.integration
 */
import type { PrismaClient } from "@prisma/client";
import type { StockTransferService as ServiceType } from "./stockTransfer.service";
import type { InventoryService as InventoryServiceType } from "../inventory/inventory.service";

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

jest.setTimeout(60_000);

describeDb("Stock transfer workflow (database)", () => {
  let prisma: PrismaClient;
  let service: ServiceType;
  let inventory: InventoryServiceType;

  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  let cpd: { id: string };
  let branch: { id: string };
  let requester: { id: string };
  let cpdManager: { id: string };
  let gsm: { id: string };
  let filter: { id: string };
  let horn: { id: string };
  let hornAlt: { id: string };
  let unrelated: { id: string };

  const stockOf = async (branchId: string, partId: string) =>
    prisma.inventoryStock.findUnique({ where: { branchId_partId: { branchId, partId } } });

  const setStock = (branchId: string, partId: string, quantity: number) =>
    prisma.inventoryStock.upsert({
      where: { branchId_partId: { branchId, partId } },
      update: { quantity, reservedQuantity: 0 },
      create: { branchId, partId, quantity },
    });

  const newIndent = (lines: { partId: string; urgentQuantity?: number; stockQuantity?: number }[]) =>
    service.createIndent(
      { requestingBranchId: branch.id, sourceBranchId: cpd.id, authorisedBy: "SM", lines },
      requester.id,
    );

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = require("../../prisma/client").default;
    const { StockTransferService } = require("./stockTransfer.service");
    const { InventoryService } = require("../inventory/inventory.service");
    service = new StockTransferService();
    inventory = new InventoryService();

    const role = async (name: string) =>
      prisma.role.upsert({ where: { name }, update: {}, create: { name } });
    const gsmRole = await role("GeneralStoreManager");
    const bsmRole = await role("BranchStoreManager");

    cpd = await prisma.branch.create({ data: { name: `CPD ${run}` } });
    branch = await prisma.branch.create({ data: { name: `Kia Plaza ${run}` } });

    const user = (label: string, roleId: string, branchId: string | null) =>
      prisma.user.create({
        data: {
          email: `${label}.${run}@test.local`,
          passwordHash: "x",
          firstName: label,
          lastName: "Test",
          roleId,
          branchId,
        },
      });
    requester = await user("requester", bsmRole.id, branch.id);
    cpdManager = await user("cpdmanager", bsmRole.id, cpd.id);
    gsm = await user("gsm", gsmRole.id, null);

    const part = (partNumber: string, name: string, unitPrice: number, mainPartId?: string) =>
      prisma.sparePart.create({
        data: {
          partNumber: `${partNumber}-${run}`,
          name,
          unitPrice,
          ...(mainPartId && { mainPartId, role: "ALTERNATE" as const }),
        },
      });
    filter = await part("2630035505", "FILTER ASSY-ENGINE OIL", 9056.34);
    horn = await part("96611P2700", "HORN ASSY", 12000);
    hornAlt = await part("96611P2710", "HORN ASSY (PARTNER)", 11500, horn.id);
    unrelated = await part("0001217203", "RING-SNAP", 1021.14);
  });

  beforeEach(async () => {
    await setStock(cpd.id, filter.id, 52);
    await setStock(cpd.id, horn.id, 0);
    await setStock(cpd.id, hornAlt.id, 10);
    await setStock(cpd.id, unrelated.id, 10);
    await prisma.inventoryStock.deleteMany({ where: { branchId: branch.id } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("runs the whole flow with four actions and moves stock exactly once", async () => {
    const created = await newIndent([{ partId: filter.id, urgentQuantity: 5 }]);
    expect(created.status).toBe("SUBMITTED");
    expect(created.indentNumber).toMatch(/^\d{10}$/);
    expect(created.lines[0].unitRate).toBe(9056.34);
    expect(created.lines[0].amount).toBe(45281.7);

    const approved = await service.approveIndent(created.id, cpdManager.id, { remarks: "ok" });
    expect(approved.status).toBe("PICKED");
    expect(approved.pickingList?.lines[0].pickedQuantity).toBe(5);
    let source = await stockOf(cpd.id, filter.id);
    expect(source).toMatchObject({ quantity: 52, reservedQuantity: 5 });

    const mitsBefore = await prisma.materialInTransit.count({ where: { destinationBranchId: branch.id } });
    const dispatched = await service.dispatchIndent(created.id, cpdManager.id, {
      transportMode: "ROAD",
      waybillNumber: "WB-1",
    });
    expect(dispatched.status).toBe("IN_TRANSIT");
    expect(dispatched.stn?.stockDeducted).toBe(true);
    expect(dispatched.stn?.cases).toHaveLength(1);
    expect(dispatched.stn?.packingList?.waybillNumber).toBe("WB-1");
    // Transfers travel on the STN; MIT is for Mobis invoices only.
    expect(await prisma.materialInTransit.count({ where: { destinationBranchId: branch.id } })).toBe(mitsBefore);
    source = await stockOf(cpd.id, filter.id);
    expect(source).toMatchObject({ quantity: 47, reservedQuantity: 0 });

    const out = await prisma.stockTransaction.findMany({ where: { referenceId: dispatched.stn!.id } });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "TRANSFER_OUT", quantity: -5 });

    const received = await service.receiveIndent(created.id, requester.id, {});
    expect(received.status).toBe("COMPLETED");
    // The receiving branch generated one MRN against the STN.
    expect(received.stn?.mrns).toHaveLength(1);
    expect(received.stn?.mrns[0]).toMatchObject({
      source: "BRANCH_TRANSFER",
      receivingBranchId: branch.id,
      sourceBranchId: cpd.id,
      mitId: null,
      totalReceived: 5,
      totalValue: 45281.7,
    });
    const transferIn = await prisma.stockTransaction.findMany({ where: { referenceId: received.stn!.mrns[0].id } });
    expect(transferIn).toEqual([expect.objectContaining({ type: "TRANSFER_IN", quantity: 5 })]);
    expect(received.stn?.status).toBe("RECEIVED");
    expect(await stockOf(branch.id, filter.id)).toMatchObject({ quantity: 5 });
    expect(received.lines[0].summary).toMatchObject({ dispatched: 5, received: 5, inTransit: 0 });
    expect(received.progress.every((step) => step.completed)).toBe(true);

    await expect(service.receiveIndent(created.id, requester.id, {})).rejects.toThrow(/Cannot receive/);
    expect(await stockOf(branch.id, filter.id)).toMatchObject({ quantity: 5 });

    // The requester is also the branch store manager but gets each alert once.
    const alerts = await prisma.notification.findMany({
      where: { userId: requester.id, message: { contains: created.indentNumber } },
      select: { type: true },
    });
    expect(alerts.map((a) => a.type).sort()).toEqual(["INDENT_APPROVED", "STN_DISPATCHED"]);
  });

  it("finds parts the requesting branch does not stock yet", async () => {
    const results = await service.searchParts({
      search: `2630035505-${run}`,
      requestingBranchId: branch.id,
      sourceBranchId: cpd.id,
    });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: filter.id, sourceAvailable: 52, requestingStock: 0, unitRate: 9056.34 });
  });

  it("records the three legacy quantities, Mobis order mode, part flag and supply code", async () => {
    await prisma.sparePart.update({ where: { id: filter.id }, data: { partFlag: "L" } });
    const indent = await service.createIndent(
      {
        requestingBranchId: branch.id,
        sourceBranchId: cpd.id,
        lines: [
          { partId: filter.id, urgentQuantity: 2, stockQuantity: 1, stockOrderQuantity: 3, mobisOrderMode: "AIR" },
          { partId: horn.id, urgentQuantity: 1 },
        ],
      },
      requester.id,
    );
    expect(indent.lines[0]).toMatchObject({
      urgentQuantity: 2,
      stockQuantity: 1,
      stockOrderQuantity: 3,
      requestedQuantity: 6,
      mobisOrderMode: "AIR",
      partFlag: "L",
      supplyCode: "EP",
    });
    const approved = await service.approveIndent(indent.id, cpdManager.id, {
      lines: [{ lineId: indent.lines[1].id, supplyPartId: hornAlt.id }],
    });
    expect(approved.lines.map((l) => l.supplyCode)).toEqual(["EP", "APN"]);
    await service.cancelIndent(indent.id, cpdManager.id);
    await prisma.sparePart.update({ where: { id: filter.id }, data: { partFlag: "O" } });
  });

  it("fills vehicle details from the job card", async () => {
    const customer = await prisma.customer.create({
      data: { firstName: "Ade", lastName: `Oye${run}`, email: `ade.${run}@test.local`, branchId: branch.id },
    });
    const vehicle = await prisma.vehicle.create({
      data: { customerId: customer.id, vin: `KN${run.slice(-15)}`, registrationNumber: `R${run.slice(-11)}`, model: "SOR", customModel: "SOR" },
    });
    const jobCard = await prisma.jobCard.create({
      data: { branchId: branch.id, vehicleId: vehicle.id, jobNumber: `JC-${run}`, description: "Service" },
    });
    const indent = await service.createIndent(
      {
        requestingBranchId: branch.id,
        sourceBranchId: cpd.id,
        lines: [{ partId: filter.id, urgentQuantity: 1, jobCardId: jobCard.id }],
      },
      requester.id,
    );
    expect(indent.lines[0]).toMatchObject({
      jobNumber: jobCard.jobNumber,
      vin: vehicle.vin,
      registrationNumber: vehicle.registrationNumber,
      vehicleModel: "SOR",
    });
    await service.cancelIndent(indent.id, requester.id, "test cleanup");
  });

  it("back-orders unavailable quantities and alerts the general store manager", async () => {
    const indent = await newIndent([
      { partId: filter.id, urgentQuantity: 50, stockQuantity: 10 },
      { partId: horn.id, urgentQuantity: 1 },
    ]);
    const approved = await service.approveIndent(indent.id, cpdManager.id);
    const [filterLine, hornLine] = approved.lines;
    expect(filterLine.summary).toMatchObject({ approved: 60, picked: 52, backOrder: 8 });
    expect(hornLine.summary).toMatchObject({ picked: 0, backOrder: 1 });

    const alert = await prisma.notification.findFirst({
      where: { userId: gsm.id, type: "INDENT_MISSING_PARTS", message: { contains: indent.indentNumber } },
    });
    expect(alert).not.toBeNull();
    await service.cancelIndent(indent.id, cpdManager.id);
    expect(await stockOf(cpd.id, filter.id)).toMatchObject({ quantity: 52, reservedQuantity: 0 });
  });

  it("supplies an alternate part and keeps the requested part for traceability", async () => {
    const indent = await newIndent([{ partId: horn.id, urgentQuantity: 2 }]);
    const lineId = indent.lines[0].id;

    await expect(
      service.approveIndent(indent.id, cpdManager.id, { lines: [{ lineId, supplyPartId: unrelated.id }] }),
    ).rejects.toThrow(/not an alternate/);

    const approved = await service.approveIndent(indent.id, cpdManager.id, {
      lines: [{ lineId, supplyPartId: hornAlt.id }],
    });
    const pick = approved.pickingList!.lines[0];
    expect(pick).toMatchObject({ requestedPartId: horn.id, partId: hornAlt.id, isAlternate: true, pickedQuantity: 2 });

    const dispatched = await service.dispatchIndent(indent.id, cpdManager.id);
    expect(dispatched.stn!.lines[0]).toMatchObject({ requestedPartId: horn.id, partId: hornAlt.id, unitRate: 11500 });
    await service.receiveIndent(indent.id, requester.id);
    expect(await stockOf(branch.id, hornAlt.id)).toMatchObject({ quantity: 2 });
    expect(await stockOf(branch.id, horn.id)).toBeNull();
    expect(await stockOf(cpd.id, hornAlt.id)).toMatchObject({ quantity: 8 });
  });

  it("prevents duplicate dispatch even when two requests race", async () => {
    const indent = await newIndent([{ partId: filter.id, stockQuantity: 10 }]);
    await service.approveIndent(indent.id, cpdManager.id);

    const results = await Promise.allSettled([
      service.dispatchIndent(indent.id, cpdManager.id),
      service.dispatchIndent(indent.id, cpdManager.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await stockOf(cpd.id, filter.id)).toMatchObject({ quantity: 42, reservedQuantity: 0 });
    expect(await prisma.stockTransferNote.count({ where: { indentId: indent.id } })).toBe(1);
    await service.receiveIndent(indent.id, requester.id);
  });

  it("packs one STN into several cases", async () => {
    const indent = await newIndent([
      { partId: filter.id, stockQuantity: 5 },
      { partId: unrelated.id, stockQuantity: 4 },
    ]);
    const approved = await service.approveIndent(indent.id, cpdManager.id);
    // Look lines up by part: the picking list does not guarantee line order.
    const p1 = approved.pickingList!.lines.find((l) => l.partId === filter.id)!;
    const p2 = approved.pickingList!.lines.find((l) => l.partId === unrelated.id)!;
    const dispatched = await service.dispatchIndent(indent.id, cpdManager.id, {
      cases: [
        { weight: 3, lines: [{ pickingLineId: p1.id, quantity: 3 }, { pickingLineId: p2.id, quantity: 4 }] },
        { weight: 1.5, lines: [{ pickingLineId: p1.id, quantity: 2 }] },
      ],
    });
    expect(dispatched.stn!.cases).toHaveLength(2);
    expect(dispatched.stn!.packingList!.consignmentWeight).toBe(4.5);
    const filterLine = dispatched.stn!.lines.find((l) => l.partId === filter.id)!;
    const casesWithFilter = dispatched.stn!.cases.filter((c) => c.lines.some((l) => l.stnLineId === filterLine.id));
    expect(casesWithFilter).toHaveLength(2);
    await service.receiveIndent(indent.id, requester.id);
  });

  it("ships less than picked and returns the difference to back order", async () => {
    const indent = await newIndent([{ partId: filter.id, stockQuantity: 5 }]);
    const approved = await service.approveIndent(indent.id, cpdManager.id);
    const pickLine = approved.pickingList!.lines[0];
    const dispatched = await service.dispatchIndent(indent.id, cpdManager.id, {
      lines: [{ pickingLineId: pickLine.id, quantity: 3 }],
    });
    expect(dispatched.lines[0].summary).toMatchObject({ dispatched: 3, backOrder: 2 });
    expect(await stockOf(cpd.id, filter.id)).toMatchObject({ quantity: 49, reservedQuantity: 0 });
    await service.receiveIndent(indent.id, requester.id);
  });

  it("supports partial, damaged and short receipts without double posting", async () => {
    const indent = await newIndent([{ partId: filter.id, stockQuantity: 6 }]);
    await service.approveIndent(indent.id, cpdManager.id);
    const dispatched = await service.dispatchIndent(indent.id, cpdManager.id);
    const stnLineId = dispatched.stn!.lines[0].id;

    const first = await service.receiveIndent(indent.id, requester.id, {
      lines: [{ stnLineId, receivedQuantity: 2, damagedQuantity: 1 }],
    });
    expect(first.status).toBe("PARTIALLY_RECEIVED");
    expect(await stockOf(branch.id, filter.id)).toMatchObject({ quantity: 2 });

    await expect(
      service.receiveIndent(indent.id, requester.id, { lines: [{ stnLineId, receivedQuantity: 4 }] }),
    ).rejects.toThrow(/3 outstanding/);

    const second = await service.receiveIndent(indent.id, requester.id, {
      lines: [{ stnLineId, receivedQuantity: 2 }],
      closeShort: true,
    });
    expect(second.status).toBe("COMPLETED");
    expect(second.lines[0].summary).toMatchObject({ received: 4, damaged: 1, short: 1, inTransit: 0 });
    // One MRN per receipt.
    expect(second.stn!.mrns.map((m) => [m.totalReceived, m.totalDamaged, m.totalShort])).toEqual([
      [2, 1, 0],
      [2, 0, 1],
    ]);
    expect(await stockOf(branch.id, filter.id)).toMatchObject({ quantity: 4 });

    const discrepancy = await prisma.notification.findFirst({
      where: { userId: gsm.id, type: "TRANSFER_DISCREPANCY", message: { contains: second.stn!.stnNumber } },
    });
    expect(discrepancy).not.toBeNull();
  });

  it("does not post a receipt twice when two receipts race", async () => {
    const indent = await newIndent([{ partId: filter.id, stockQuantity: 4 }]);
    await service.approveIndent(indent.id, cpdManager.id);
    await service.dispatchIndent(indent.id, cpdManager.id);
    const results = await Promise.allSettled([
      service.receiveIndent(indent.id, requester.id),
      service.receiveIndent(indent.id, requester.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await stockOf(branch.id, filter.id)).toMatchObject({ quantity: 4 });
  });

  it("protects reserved stock from part issuance", async () => {
    await setStock(cpd.id, filter.id, 5);
    const indent = await newIndent([{ partId: filter.id, stockQuantity: 5 }]);
    await service.approveIndent(indent.id, cpdManager.id);
    await expect(
      inventory.createPartIssuance({ sparePartId: filter.id, branchId: cpd.id, issuedById: cpdManager.id, quantity: 1 }),
    ).rejects.toThrow(/Insufficient available stock/);
    await service.cancelIndent(indent.id, cpdManager.id, "release");
    expect(await stockOf(cpd.id, filter.id)).toMatchObject({ quantity: 5, reservedQuantity: 0 });
  });

  it("rejects and cancels with the right state rules", async () => {
    const rejected = await newIndent([{ partId: filter.id, stockQuantity: 1 }]);
    const r = await service.rejectIndent(rejected.id, cpdManager.id, "Not stocked for this branch");
    expect(r.status).toBe("REJECTED");
    expect(r.rejectionReason).toBe("Not stocked for this branch");
    await expect(service.approveIndent(rejected.id, cpdManager.id)).rejects.toThrow(/Cannot approve/);

    const draft = await service.createIndent(
      { requestingBranchId: branch.id, sourceBranchId: cpd.id, submit: false, lines: [{ partId: filter.id, stockQuantity: 1 }] },
      requester.id,
    );
    expect(draft.status).toBe("DRAFT");
    const submitted = await service.submitIndent(draft.id, requester.id);
    expect(submitted.status).toBe("SUBMITTED");

    await service.approveIndent(draft.id, cpdManager.id);
    await service.dispatchIndent(draft.id, cpdManager.id);
    await expect(service.cancelIndent(draft.id, requester.id)).rejects.toThrow(/Cannot cancel/);
    await service.receiveIndent(draft.id, requester.id);
  });

  it("retries picking once stock arrives", async () => {
    const indent = await newIndent([{ partId: horn.id, urgentQuantity: 1 }]);
    const approved = await service.approveIndent(indent.id, cpdManager.id);
    expect(approved.status).toBe("APPROVED");
    await expect(service.pickIndent(indent.id, cpdManager.id)).rejects.toThrow(/Still no stock/);
    await setStock(cpd.id, horn.id, 3);
    const picked = await service.pickIndent(indent.id, cpdManager.id);
    expect(picked.status).toBe("PICKED");
    expect(picked.lines[0].backOrderQuantity).toBe(0);
    await service.cancelIndent(indent.id, cpdManager.id);
  });
});

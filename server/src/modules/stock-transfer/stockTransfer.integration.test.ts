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
    expect(approved.openPickingList?.lines[0].pickedQuantity).toBe(5);
    let source = await stockOf(cpd.id, filter.id);
    expect(source).toMatchObject({ quantity: 52, reservedQuantity: 5 });

    const mitsBefore = await prisma.materialInTransit.count({ where: { destinationBranchId: branch.id } });
    const dispatched = await service.dispatchIndent(created.id, cpdManager.id, {
      transportMode: "ROAD",
      waybillNumber: "WB-1",
    });
    expect(dispatched.status).toBe("IN_TRANSIT");
    expect(dispatched.stns[0]?.stockDeducted).toBe(true);
    expect(dispatched.stns[0]?.cases).toHaveLength(1);
    expect(dispatched.stns[0]?.packingList?.waybillNumber).toBe("WB-1");
    // Transfers travel on the STN; MIT is for Mobis invoices only.
    expect(await prisma.materialInTransit.count({ where: { destinationBranchId: branch.id } })).toBe(mitsBefore);
    source = await stockOf(cpd.id, filter.id);
    expect(source).toMatchObject({ quantity: 47, reservedQuantity: 0 });

    const out = await prisma.stockTransaction.findMany({ where: { referenceId: dispatched.stns[0].id } });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "TRANSFER_OUT", quantity: -5 });

    const received = await service.receiveIndent(created.id, requester.id, {});
    expect(received.status).toBe("COMPLETED");
    // The receiving branch generated one MRN against the STN.
    expect(received.stns[0]?.mrns).toHaveLength(1);
    expect(received.stns[0]?.mrns[0]).toMatchObject({
      source: "BRANCH_TRANSFER",
      receivingBranchId: branch.id,
      sourceBranchId: cpd.id,
      mitId: null,
      totalReceived: 5,
      totalValue: 45281.7,
    });
    const transferIn = await prisma.stockTransaction.findMany({ where: { referenceId: received.stns[0].mrns[0].id } });
    expect(transferIn).toEqual([expect.objectContaining({ type: "TRANSFER_IN", quantity: 5 })]);
    expect(received.stns[0]?.status).toBe("RECEIVED");
    expect(await stockOf(branch.id, filter.id)).toMatchObject({ quantity: 5 });
    expect(received.lines[0].summary).toMatchObject({ dispatched: 5, received: 5, inTransit: 0 });
    expect(received.progress.every((step) => step.completed)).toBe(true);

    await expect(service.receiveIndent(created.id, requester.id, {})).rejects.toThrow(/nothing in transit/);
    expect(received.stns[0].packingList?.gatePassNumber).toMatch(/^\d{10}$/);
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
    const pick = approved.openPickingList!.lines[0];
    expect(pick).toMatchObject({ requestedPartId: horn.id, partId: hornAlt.id, isAlternate: true, pickedQuantity: 2 });

    const dispatched = await service.dispatchIndent(indent.id, cpdManager.id);
    expect(dispatched.stns[0].lines[0]).toMatchObject({ requestedPartId: horn.id, partId: hornAlt.id, unitRate: 11500 });
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
    expect(await prisma.stockTransferNote.count({ where: { indents: { some: { id: indent.id } } } })).toBe(1);
    await service.receiveIndent(indent.id, requester.id);
  });

  it("packs one STN into several cases", async () => {
    const indent = await newIndent([
      { partId: filter.id, stockQuantity: 5 },
      { partId: unrelated.id, stockQuantity: 4 },
    ]);
    const approved = await service.approveIndent(indent.id, cpdManager.id);
    // Look lines up by part: the picking list does not guarantee line order.
    const p1 = approved.openPickingList!.lines.find((l) => l.partId === filter.id)!;
    const p2 = approved.openPickingList!.lines.find((l) => l.partId === unrelated.id)!;
    const dispatched = await service.dispatchIndent(indent.id, cpdManager.id, {
      cases: [
        { weight: 3, lines: [{ pickingLineId: p1.id, quantity: 3 }, { pickingLineId: p2.id, quantity: 4 }] },
        { weight: 1.5, lines: [{ pickingLineId: p1.id, quantity: 2 }] },
      ],
    });
    expect(dispatched.stns[0].cases).toHaveLength(2);
    expect(dispatched.stns[0].packingList!.consignmentWeight).toBe(4.5);
    const filterLine = dispatched.stns[0].lines.find((l) => l.partId === filter.id)!;
    const casesWithFilter = dispatched.stns[0].cases.filter((c) => c.lines.some((l) => l.stnLineId === filterLine.id));
    expect(casesWithFilter).toHaveLength(2);
    await service.receiveIndent(indent.id, requester.id);
  });

  it("ships less than picked, then ships the back order on a second STN", async () => {
    const indent = await newIndent([{ partId: filter.id, stockQuantity: 5 }]);
    const approved = await service.approveIndent(indent.id, cpdManager.id, { pickerName: "YAHAYA JAMIU" });
    expect(approved.openPickingList?.pickerName).toBe("YAHAYA JAMIU");
    const pickLine = approved.openPickingList!.lines[0];
    const first = await service.dispatchIndent(indent.id, cpdManager.id, {
      lines: [{ pickingLineId: pickLine.id, quantity: 3 }],
    });
    expect(first.status).toBe("PARTLY_DISPATCHED");
    expect(first.lines[0].summary).toMatchObject({ dispatched: 3, backOrder: 2 });
    expect(await stockOf(cpd.id, filter.id)).toMatchObject({ quantity: 49, reservedQuantity: 0 });

    // The branch receives the first STN while the back order is still open.
    const afterFirst = await service.receiveIndent(indent.id, requester.id);
    expect(afterFirst.status).toBe("PARTLY_DISPATCHED");

    const repicked = await service.pickIndent(indent.id, cpdManager.id);
    expect(repicked.status).toBe("PICKED");
    expect(repicked.openPickingList!.lines[0].pickedQuantity).toBe(2);
    const second = await service.dispatchIndent(indent.id, cpdManager.id);
    // All shipped; the first STN is already received.
    expect(second.status).toBe("PARTIALLY_RECEIVED");
    expect(second.stns).toHaveLength(2);
    expect(second.lines[0].summary).toMatchObject({ dispatched: 5, backOrder: 0, received: 3, inTransit: 2 });

    const done = await service.receiveIndent(indent.id, requester.id);
    expect(done.status).toBe("COMPLETED");
    expect(await stockOf(branch.id, filter.id)).toMatchObject({ quantity: 5 });
    // An indent with shipments can no longer be cancelled outright.
    await expect(service.cancelIndent(indent.id, cpdManager.id)).rejects.toThrow(/Cannot cancel/);
  });

  it("ships several indents of one branch on a single STN", async () => {
    const a = await newIndent([{ partId: filter.id, stockQuantity: 2 }]);
    const b = await newIndent([{ partId: filter.id, stockQuantity: 3 }, { partId: unrelated.id, stockQuantity: 1 }]);
    await service.approveIndent(a.id, cpdManager.id);
    await service.approveIndent(b.id, cpdManager.id);

    const stn = await service.dispatchIndents({ indentIds: [a.id, b.id], transportMode: "ROAD" }, cpdManager.id);
    expect(stn.indents.map((i) => i.id).sort()).toEqual([a.id, b.id].sort());
    expect(stn.lines).toHaveLength(3);
    expect(stn.totalQuantity).toBe(6);
    expect(stn.cases).toHaveLength(1);
    expect(await stockOf(cpd.id, filter.id)).toMatchObject({ quantity: 47, reservedQuantity: 0 });

    // One message names both indents.
    const alert = await prisma.notification.findFirst({
      where: { userId: requester.id, type: "STN_DISPATCHED", message: { contains: stn.stnNumber } },
    });
    expect(alert?.message).toContain(a.indentNumber);
    expect(alert?.message).toContain(b.indentNumber);

    await service.receiveStn(stn.id, requester.id);
    expect((await service.getIndent(a.id)).status).toBe("COMPLETED");
    expect((await service.getIndent(b.id)).status).toBe("COMPLETED");
  });

  it("refuses to put indents for different branches on one STN", async () => {
    const other = await prisma.branch.create({ data: { name: `Utako ${run}` } });
    const a = await newIndent([{ partId: filter.id, stockQuantity: 1 }]);
    const b = await service.createIndent(
      { requestingBranchId: other.id, sourceBranchId: cpd.id, lines: [{ partId: filter.id, stockQuantity: 1 }] },
      requester.id,
    );
    await expect(service.dispatchIndents({ indentIds: [a.id, b.id] }, cpdManager.id)).rejects.toThrow(/same branch/);
    await service.cancelIndent(a.id, cpdManager.id);
    await service.cancelIndent(b.id, cpdManager.id);
  });

  it("sends a direct STN without an indent and receives it at the branch", async () => {
    await expect(
      service.createDirectStn(
        { sourceBranchId: cpd.id, destinationBranchId: branch.id, remarks: "too many", lines: [{ partId: unrelated.id, quantity: 11 }] },
        cpdManager.id,
      ),
    ).rejects.toThrow(/Only 10 unit/);

    const stn = await service.createDirectStn(
      {
        sourceBranchId: cpd.id,
        destinationBranchId: branch.id,
        remarks: "Microcat Live for the month of May",
        packerName: "YAHAYA JAMIU",
        lines: [{ partId: unrelated.id, quantity: 2 }],
      },
      cpdManager.id,
    );
    expect(stn.indents).toEqual([]);
    expect(stn.lines[0]).toMatchObject({ indentLineId: null, pickingLineId: null, quantity: 2, unitRate: 1021.14 });
    expect(stn.packingList?.gatePassNumber).toMatch(/^\d{10}$/);
    expect(await stockOf(cpd.id, unrelated.id)).toMatchObject({ quantity: 8 });
    const alert = await prisma.notification.findFirst({
      where: { userId: requester.id, type: "DIRECT_STN_DISPATCHED", message: { contains: stn.stnNumber } },
    });
    expect(alert?.message).toContain("direct STN");

    const received = await service.receiveStn(stn.id, requester.id);
    expect(received.status).toBe("RECEIVED");
    expect(await stockOf(branch.id, unrelated.id)).toMatchObject({ quantity: 2 });
  });

  it("closes a back order and completes once the shipped STN is received", async () => {
    await setStock(cpd.id, filter.id, 4);
    const indent = await newIndent([{ partId: filter.id, stockQuantity: 6 }]);
    await service.approveIndent(indent.id, cpdManager.id);
    const partly = await service.dispatchIndent(indent.id, cpdManager.id);
    expect(partly.status).toBe("PARTLY_DISPATCHED");

    // Stock for the back order arrives at CPD: the supplier is told it can now pick.
    await setStock(cpd.id, filter.id, 10);
    await service.notifyBackOrdersPickable(cpd.id, [filter.id]);
    const pickable = await prisma.notification.findFirst({
      where: { userId: cpdManager.id, type: "INDENT_BACK_ORDER_PICKABLE", message: { contains: indent.indentNumber } },
    });
    expect(pickable).not.toBeNull();

    const closed = await service.closeBackOrder(indent.id, cpdManager.id, "Superseded part");
    expect(closed.status).toBe("IN_TRANSIT");
    expect(closed.lines[0]).toMatchObject({ approvedQuantity: 4, backOrderQuantity: 0, dispatchedQuantity: 4 });
    const done = await service.receiveIndent(indent.id, requester.id);
    expect(done.status).toBe("COMPLETED");
  });

  it("cancels ticked lines across indents, releasing only their pick", async () => {
    const picked = await newIndent([
      { partId: filter.id, stockQuantity: 5 },
      { partId: unrelated.id, stockQuantity: 3 },
    ]);
    await service.approveIndent(picked.id, cpdManager.id);
    const submitted = await newIndent([
      { partId: filter.id, stockQuantity: 2 },
      { partId: unrelated.id, stockQuantity: 1 },
    ]);
    const lineOf = (indent: { lines: { id: string; partId: string }[] }, partId: string) =>
      indent.lines.find((l) => l.partId === partId)!.id;

    // CPD sees both indents from the branch, line by line, with what is picked.
    const pending = await service.listPendingLines({ direction: "INWARD", branchId: cpd.id, otherBranchId: branch.id });
    const listed = pending.find((o) => o.id === picked.id)!;
    expect(listed.lines.map((l) => [l.pending, l.picked])).toEqual([
      [5, 5],
      [3, 3],
    ]);
    expect(pending.some((o) => o.id === submitted.id)).toBe(true);

    const result = await service.cancelPendingLines(
      [lineOf(picked, filter.id), lineOf(submitted, filter.id)],
      cpdManager.id,
      "Purchased under PL-1",
    );
    expect(result.units).toBe(7);

    const after = await service.getIndent(picked.id);
    expect(after.status).toBe("PICKED");
    expect(after.lines.find((l) => l.partId === filter.id)).toMatchObject({
      approvedQuantity: 0,
      cancelledQuantity: 5,
      backOrderQuantity: 0,
      cancelRemark: "Purchased under PL-1",
    });
    expect(after.openPickingList?.lines.map((l) => l.partId)).toEqual([unrelated.id]);
    expect(await stockOf(cpd.id, filter.id)).toMatchObject({ quantity: 52, reservedQuantity: 0 });
    expect(await stockOf(cpd.id, unrelated.id)).toMatchObject({ reservedQuantity: 3 });

    // The branch's own view (indents to other branches) shows only what is still to come.
    const outward = await service.listPendingLines({ direction: "OUTWARD", branchId: branch.id, search: picked.indentNumber });
    expect(outward[0].lines.map((l) => l.partNumber)).toEqual([after.lines.find((l) => l.partId === unrelated.id)!.part.partNumber]);

    // A line cancelled before approval cannot be approved; the rest is approved and picked.
    await expect(
      service.approveIndent(submitted.id, cpdManager.id, { lines: [{ lineId: lineOf(submitted, filter.id), approvedQuantity: 1 }] }),
    ).rejects.toThrow(/between 0 and 0/);
    const approved = await service.approveIndent(submitted.id, cpdManager.id);
    expect(approved.lines.find((l) => l.partId === filter.id)).toMatchObject({ approvedQuantity: 0, cancelledQuantity: 2 });
    expect(approved.lines.find((l) => l.partId === unrelated.id)).toMatchObject({ approvedQuantity: 1 });

    // Cancelling everything left on an indent with nothing shipped cancels the indent.
    await service.cancelPendingLines([lineOf(submitted, unrelated.id)], cpdManager.id, "Duplicate indent");
    const cancelled = await service.getIndent(submitted.id);
    expect(cancelled).toMatchObject({ status: "CANCELLED", cancellationReason: "Duplicate indent" });
    await expect(service.cancelPendingLines([lineOf(submitted, unrelated.id)], cpdManager.id, "Again")).rejects.toThrow(
      /nothing is left/,
    );

    await service.cancelIndent(picked.id, cpdManager.id, "test cleanup");
    expect(await stockOf(cpd.id, unrelated.id)).toMatchObject({ reservedQuantity: 0 });
  });

  it("supports partial, damaged and short receipts without double posting", async () => {
    const indent = await newIndent([{ partId: filter.id, stockQuantity: 6 }]);
    await service.approveIndent(indent.id, cpdManager.id);
    const dispatched = await service.dispatchIndent(indent.id, cpdManager.id);
    const stnLineId = dispatched.stns[0].lines[0].id;

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
    expect(second.stns[0].mrns.map((m) => [m.totalReceived, m.totalDamaged, m.totalShort])).toEqual([
      [2, 1, 0],
      [2, 0, 1],
    ]);
    expect(await stockOf(branch.id, filter.id)).toMatchObject({ quantity: 4 });

    const discrepancy = await prisma.notification.findFirst({
      where: { userId: gsm.id, type: "TRANSFER_DISCREPANCY", message: { contains: second.stns[0].stnNumber } },
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

/**
 * STN tax form VAT, cancel and edit before receipt, local parts on direct STNs, and the stock
 * adjustment guard, against a real PostgreSQL database. Skipped unless TEST_DATABASE_URL is set.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/danamotors_test npx jest stnChanges.integration
 */
import type { PrismaClient } from "@prisma/client";
import type { StockTransferService as ServiceType } from "./stockTransfer.service";
import type { InventoryService as InventoryServiceType } from "../inventory/inventory.service";

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

jest.setTimeout(60_000);

describeDb("STN changes (database)", () => {
  let prisma: PrismaClient;
  let service: ServiceType;
  let inventory: InventoryServiceType;

  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  let cpd: { id: string };
  let abuja: { id: string };
  let branch: { id: string };
  let requester: { id: string };
  let manager: { id: string };
  let filter: { id: string };
  let bumper: { id: string };
  let localOil: { id: string; partNumber: string };

  const stockOf = async (branchId: string, partId: string) =>
    prisma.inventoryStock.findUnique({ where: { branchId_partId: { branchId, partId } } });

  const setStock = (branchId: string, partId: string, quantity: number) =>
    prisma.inventoryStock.upsert({
      where: { branchId_partId: { branchId, partId } },
      update: { quantity, reservedQuantity: 0 },
      create: { branchId, partId, quantity },
    });

  /** An indent from the branch to CPD, approved (picked) and ready to dispatch. */
  const pickedIndent = async (lines: { partId: string; urgentQuantity: number }[]) => {
    const indent = await service.createIndent({ requestingBranchId: branch.id, sourceBranchId: cpd.id, lines }, requester.id);
    return service.approveIndent(indent.id, manager.id);
  };

  const movementsFor = (stnId: string) => prisma.stockTransaction.findMany({ where: { referenceId: stnId, type: "TRANSFER_OUT" } });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = require("../../prisma/client").default;
    const { StockTransferService } = require("./stockTransfer.service");
    const { InventoryService } = require("../inventory/inventory.service");
    const { ROLES } = require("../../shared/constants/roles");
    service = new StockTransferService();
    inventory = new InventoryService();

    const storeRole = await prisma.role.upsert({ where: { name: ROLES.BRANCH_STORE_MANAGER }, update: {}, create: { name: ROLES.BRANCH_STORE_MANAGER } });
    cpd = await prisma.branch.create({ data: { name: `CPD ${run}` } });
    abuja = await prisma.branch.create({ data: { name: `Utako ${run}` } });
    branch = await prisma.branch.create({ data: { name: `Kia Plaza ${run}` } });
    const user = (label: string, branchId: string) =>
      prisma.user.create({
        data: { email: `${label}.${run}@test.local`, passwordHash: "x", firstName: label, lastName: "Test", roleId: storeRole.id, branchId },
      });
    requester = await user("stnreq", branch.id);
    manager = await user("stnmgr", cpd.id);

    filter = await prisma.sparePart.create({ data: { partNumber: `2630035505-${run}`, name: "FILTER ASSY-ENGINE OIL", unitPrice: 9056.34 } });
    // ABJ STN 2025000027 to CPD (11/07/2025, form L): this part x 1 at the dealer rate.
    bumper = await prisma.sparePart.create({ data: { partNumber: `583022KA10-${run}`, name: "PAD KIT-RR DISC BRAKE", unitPrice: 78477.11 } });
    // Kia Plaza's local stock, sent to VI, QS and UG on direct STNs.
    localOil = await prisma.sparePart.create({
      data: { partNumber: `SAE 0W-20 MOTOR OIL-${run}`, name: "SAE 0W-20 MOTOR OIL", unitPrice: 5400, partFlag: "L" },
    });
  });

  beforeEach(async () => {
    await setStock(cpd.id, filter.id, 50);
    await setStock(abuja.id, bumper.id, 3);
    await setStock(branch.id, localOil.id, 40);
    await prisma.inventoryStock.deleteMany({ where: { branchId: branch.id, partId: { not: localOil.id } } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("charges VAT under form L like ABJ STN 2025000027, and the receiver books the goods without it", async () => {
    const stn = await service.createDirectStn(
      { sourceBranchId: abuja.id, destinationBranchId: cpd.id, remarks: "Requested by CPD", taxForm: "L", lines: [{ partId: bumper.id, quantity: 1 }] },
      manager.id,
    );
    expect(stn).toMatchObject({ taxForm: "L", totalValue: 78477.11, taxAmount: 5885.78 });
    expect(stn.lines[0]).toMatchObject({ amount: 78477.11, vatPercent: 7.5, taxAmount: 5885.78 });

    // CPD SRN 2025000112 "AGAINST UTAKO STN 027": ₦78,477.11, form X, no VAT.
    const received = await service.receiveStn(stn.id, manager.id);
    expect(received.mrns[0].totalValue).toBe(78477.11);
  });

  it("defaults to form X with no VAT", async () => {
    const stn = await service.createDirectStn(
      { sourceBranchId: abuja.id, destinationBranchId: cpd.id, remarks: "Stock return", lines: [{ partId: bumper.id, quantity: 1 }] },
      manager.id,
    );
    expect(stn).toMatchObject({ taxForm: "X", taxAmount: 0 });
  });

  it("sends local (L) parts on a direct STN and finds them in the direct-STN part search only", async () => {
    const stn = await service.createDirectStn(
      { sourceBranchId: branch.id, destinationBranchId: abuja.id, remarks: "Quick service bay oil", lines: [{ partId: localOil.id, quantity: 4 }] },
      requester.id,
    );
    expect(stn.lines[0]).toMatchObject({ partId: localOil.id, quantity: 4, unitRate: 5400 });
    expect(await stockOf(branch.id, localOil.id)).toMatchObject({ quantity: 36 });

    const search = (allSources?: boolean) => service.searchParts({ search: localOil.partNumber, sourceBranchId: branch.id, allSources });
    expect((await search(true)).map((p) => p.id)).toContain(localOil.id);
    expect((await search()).map((p) => p.id)).not.toContain(localOil.id);
    // Indents to CPD still refuse them: CPD supplies Mobis parts only.
    await expect(
      service.createIndent({ requestingBranchId: branch.id, sourceBranchId: cpd.id, lines: [{ partId: localOil.id, urgentQuantity: 1 }] }, requester.id),
    ).rejects.toThrow(/cannot be indented/);
  });

  it("cancels an STN before receipt: stock back, back order restored, documents void, picked again", async () => {
    const indent = await pickedIndent([{ partId: filter.id, urgentQuantity: 5 }]);
    const dispatched = await service.dispatchIndent(indent.id, manager.id, { transportMode: "ROAD" });
    const stnId = dispatched.stns[0].id;
    expect(await stockOf(cpd.id, filter.id)).toMatchObject({ quantity: 45, reservedQuantity: 0 });

    const cancelled = await service.cancelStn(stnId, manager.id, "Sent to the wrong branch");
    expect(cancelled).toMatchObject({ status: "CANCELLED", cancellationReason: "Sent to the wrong branch" });
    expect(cancelled.cancelledBy?.id).toBe(manager.id);
    expect(cancelled.cases.every((c) => c.status === "CANCELLED")).toBe(true);
    expect(cancelled.packingList?.status).toBe("CANCELLED");
    expect(await stockOf(cpd.id, filter.id)).toMatchObject({ quantity: 50 });
    // The dispatch and its offset net to zero in the stock and consumption reports.
    expect((await movementsFor(stnId)).reduce((s, m) => s + m.quantity, 0)).toBe(0);

    const after = await service.getIndent(indent.id);
    expect(after.status).toBe("APPROVED");
    expect(after.lines[0]).toMatchObject({ dispatchedQuantity: 0, backOrderQuantity: 5 });
    expect(after.statusHistory.at(-1)?.remarks).toContain("cancelled: Sent to the wrong branch");
    const alert = await prisma.notification.findFirst({ where: { userId: requester.id, type: "STN_CANCELLED" } });
    expect(alert?.message).toContain(dispatched.stns[0].stnNumber);

    // Nothing left to receive; the indent is picked and shipped again on a new STN.
    await expect(service.receiveStn(stnId, requester.id)).rejects.toThrow(/cancelled/);
    await expect(service.cancelStn(stnId, manager.id, "again")).rejects.toThrow(/only a dispatched STN/);
    const repicked = await service.pickIndent(indent.id, manager.id);
    expect(repicked.status).toBe("PICKED");
    const again = await service.dispatchIndent(indent.id, manager.id);
    expect(again.stns.find((s) => s.id !== stnId)?.status).toBe("DISPATCHED");
  });

  it("refuses to cancel or edit once an MRN is generated", async () => {
    const indent = await pickedIndent([{ partId: filter.id, urgentQuantity: 4 }]);
    const dispatched = await service.dispatchIndent(indent.id, manager.id);
    const stn = dispatched.stns[0];
    await service.receiveStn(stn.id, requester.id, { lines: [{ stnLineId: stn.lines[0].id, receivedQuantity: 1 }] });
    await expect(service.cancelStn(stn.id, manager.id, "late")).rejects.toThrow(/partially received/);
  });

  it("edits issued quantities across split cases and keeps the indent's back order in step", async () => {
    const indent = await pickedIndent([{ partId: filter.id, urgentQuantity: 6 }]);
    const pickLine = indent.openPickingList!.lines[0];
    const dispatched = await service.dispatchIndent(indent.id, manager.id, {
      lines: [{ pickingLineId: pickLine.id, quantity: 5 }],
      cases: [
        { lines: [{ pickingLineId: pickLine.id, quantity: 3 }] },
        { lines: [{ pickingLineId: pickLine.id, quantity: 2 }] },
      ],
    });
    const stn = dispatched.stns[0];
    expect((await service.getIndent(indent.id)).lines[0]).toMatchObject({ dispatchedQuantity: 5, backOrderQuantity: 1 });

    // One unit too many cannot come from a back order of 1 ...
    await expect(
      service.editStn(stn.id, manager.id, { reason: "typo", lines: [{ stnLineId: stn.lines[0].id, quantity: 7 }] }),
    ).rejects.toThrow(/at most/);

    // ... but down to 2 empties the second case and puts 3 back on back order.
    const smaller = await service.editStn(stn.id, manager.id, { reason: "Two damaged in the store", lines: [{ stnLineId: stn.lines[0].id, quantity: 2 }] });
    expect(smaller.lines[0]).toMatchObject({ quantity: 2, amount: 18112.68 });
    expect(smaller).toMatchObject({ totalQuantity: 2, totalValue: 18112.68 });
    expect(smaller.cases).toHaveLength(1);
    expect(smaller.cases[0]).toMatchObject({ totalQuantity: 2 });
    expect(smaller.edits[0]).toMatchObject({ oldQuantity: 5, newQuantity: 2, reason: "Two damaged in the store" });
    expect(await stockOf(cpd.id, filter.id)).toMatchObject({ quantity: 48 });
    expect((await service.getIndent(indent.id)).lines[0]).toMatchObject({ dispatchedQuantity: 2, backOrderQuantity: 4 });
    expect((await movementsFor(stn.id)).reduce((s, m) => s + m.quantity, 0)).toBe(-2);

    // Up to 6 takes the whole back order into the first case; the tax form change adds VAT.
    const bigger = await service.editStn(stn.id, manager.id, {
      reason: "Branch needs all six",
      taxForm: "L",
      lines: [{ stnLineId: stn.lines[0].id, quantity: 6 }],
    });
    expect(bigger).toMatchObject({ taxForm: "L", totalQuantity: 6, totalValue: 54338.04, taxAmount: 4075.35 });
    expect(bigger.cases[0]).toMatchObject({ totalQuantity: 6 });
    expect(bigger.edits.map((e) => [e.oldTaxForm, e.newTaxForm])).toContainEqual(["X", "L"]);
    expect(await stockOf(cpd.id, filter.id)).toMatchObject({ quantity: 44 });
    const updated = await service.getIndent(indent.id);
    expect(updated.lines[0]).toMatchObject({ dispatchedQuantity: 6, backOrderQuantity: 0 });
    expect(updated.status).toBe("IN_TRANSIT");

    const received = await service.receiveStn(stn.id, requester.id);
    expect(received.status).toBe("RECEIVED");
    expect(await stockOf(branch.id, filter.id)).toMatchObject({ quantity: 6 });
  });

  it("takes a line off a direct STN at 0 and limits an increase to free stock", async () => {
    await setStock(branch.id, filter.id, 1);
    const stn = await service.createDirectStn(
      {
        sourceBranchId: branch.id,
        destinationBranchId: abuja.id,
        remarks: "Workshop consumables",
        lines: [
          { partId: localOil.id, quantity: 10 },
          { partId: filter.id, quantity: 1 },
        ],
      },
      requester.id,
    );
    const oilLine = stn.lines.find((l) => l.partId === localOil.id)!;
    const filterLine = stn.lines.find((l) => l.partId === filter.id)!;

    await expect(
      service.editStn(stn.id, requester.id, { reason: "more", lines: [{ stnLineId: oilLine.id, quantity: 41 }] }),
    ).rejects.toThrow(/Only 30 more unit/);
    await expect(
      service.editStn(stn.id, requester.id, {
        reason: "none",
        lines: [
          { stnLineId: oilLine.id, quantity: 0 },
          { stnLineId: filterLine.id, quantity: 0 },
        ],
      }),
    ).rejects.toThrow(/cancel the STN instead/);

    const edited = await service.editStn(stn.id, requester.id, { reason: "Filter not needed", lines: [{ stnLineId: filterLine.id, quantity: 0 }] });
    expect(edited.lines).toHaveLength(1);
    expect(edited.cases[0].lines).toHaveLength(1);
    expect(edited).toMatchObject({ totalQuantity: 10, totalValue: 54000 });
    expect(await stockOf(branch.id, filter.id)).toMatchObject({ quantity: 1 });
  });

  it("packs a direct STN into several cases and records the courier date", async () => {
    await setStock(branch.id, filter.id, 2);
    const courierDate = new Date("2026-06-04T00:00:00Z");
    const stn = await service.createDirectStn(
      {
        sourceBranchId: branch.id,
        destinationBranchId: abuja.id,
        remarks: "Two cartons",
        courierName: "UPS",
        waybillNumber: "W5558563255",
        consignmentWeight: 7,
        courierDate,
        lines: [
          { partId: localOil.id, quantity: 6 },
          { partId: filter.id, quantity: 2 },
        ],
        cases: [
          { packerName: "AJEKIGBE WALE", lines: [{ partId: localOil.id, quantity: 4 }] },
          { packerName: "AJEKIGBE WALE", lines: [{ partId: localOil.id, quantity: 2 }, { partId: filter.id, quantity: 2 }] },
        ],
      },
      requester.id,
    );
    expect(stn.cases.map((c) => c.totalQuantity)).toEqual([4, 4]);
    expect(stn.packingList).toMatchObject({ consignmentWeight: 7, courierName: "UPS", courierDate });

    await expect(
      service.createDirectStn(
        {
          sourceBranchId: branch.id,
          destinationBranchId: abuja.id,
          remarks: "Bad split",
          lines: [{ partId: localOil.id, quantity: 3 }],
          cases: [{ lines: [{ partId: localOil.id, quantity: 2 }] }],
        },
        requester.id,
      ),
    ).rejects.toThrow(/the cases hold 2/);
  });

  it("cancelling after the back order was closed puts the shipped units back to supply; the closed part stays closed", async () => {
    const indent = await pickedIndent([{ partId: filter.id, urgentQuantity: 6 }]);
    const pickLine = indent.openPickingList!.lines[0];
    const dispatched = await service.dispatchIndent(indent.id, manager.id, { lines: [{ pickingLineId: pickLine.id, quantity: 4 }] });
    const closed = await service.closeBackOrder(indent.id, manager.id, "Superseded part");
    expect(closed.status).toBe("IN_TRANSIT");
    expect(closed.lines[0]).toMatchObject({ approvedQuantity: 4, dispatchedQuantity: 4, cancelledQuantity: 2, backOrderQuantity: 0 });

    await service.cancelStn(dispatched.stns[0].id, manager.id, "Truck did not leave");
    const after = await service.getIndent(indent.id);
    expect(after.status).toBe("APPROVED");
    expect(after.lines[0]).toMatchObject({ approvedQuantity: 4, dispatchedQuantity: 0, cancelledQuantity: 2, backOrderQuantity: 4 });
    expect(await stockOf(cpd.id, filter.id)).toMatchObject({ quantity: 50, reservedQuantity: 0 });

    // The four are picked and shipped again; the two closed units are not.
    const repicked = await service.pickIndent(indent.id, manager.id);
    expect(repicked.openPickingList?.lines[0].pickedQuantity).toBe(4);
    const again = await service.dispatchIndent(indent.id, manager.id);
    expect(again.status).toBe("IN_TRANSIT");
    expect(again.lines[0]).toMatchObject({ dispatchedQuantity: 4, backOrderQuantity: 0 });
  });

  it("an STN edit and a handheld pick on the same indent at once queue and leave the quantities consistent", async () => {
    await setStock(cpd.id, filter.id, 10);
    const indent = await pickedIndent([{ partId: filter.id, urgentQuantity: 8 }]);
    const first = indent.openPickingList!.lines[0];
    // Six ship now; two go back on back order and are picked again.
    const dispatched = await service.dispatchIndent(indent.id, manager.id, { lines: [{ pickingLineId: first.id, quantity: 6 }] });
    const stn = dispatched.stns[0];
    const picked = await service.pickIndent(indent.id, manager.id);
    const backPick = picked.openPickingList!;
    expect(backPick.lines[0].pickedQuantity).toBe(2);

    // At the same moment: the handheld finds only one of the two, and the store adds one unit to the STN.
    const results = await Promise.allSettled([
      prisma.$transaction((tx) => service.applyHandheldPickInTx(tx, backPick.id, [{ pickingLineId: backPick.lines[0].id, quantity: 1 }], "MUSA", manager.id)),
      service.editStn(stn.id, manager.id, { reason: "One more found", lines: [{ stnLineId: stn.lines[0].id, quantity: 7 }] }),
    ]);
    expect(results[0].status).toBe("fulfilled");
    // The edit wins only if the handheld released its unit to the back order first.
    if (results[1].status === "rejected") expect(String(results[1].reason)).toMatch(/at most/);

    const line = (await service.getIndent(indent.id)).lines[0];
    const open = await prisma.pickingListLine.aggregate({ where: { pickingListId: backPick.id }, _sum: { pickedQuantity: true } });
    const reserved = open._sum.pickedQuantity ?? 0;
    // Every approved unit is shipped, reserved on the open pick, or on back order: never twice, never lost.
    expect(line.dispatchedQuantity + reserved + line.backOrderQuantity).toBe(8);
    expect(reserved).toBe(1);
    const stock = await stockOf(cpd.id, filter.id);
    expect(stock).toMatchObject({ quantity: 10 - line.dispatchedQuantity, reservedQuantity: reserved });
    const stnNow = await service.getStn(stn.id);
    expect(stnNow.totalQuantity).toBe(line.dispatchedQuantity);
  });

  it("never drives stock below zero or below what is reserved on an adjustment", async () => {
    await setStock(cpd.id, filter.id, 3);
    await expect(
      inventory.adjustStock({ branchId: cpd.id, partId: filter.id, quantity: -4, type: "ADJUSTMENT", recordedById: manager.id }),
    ).rejects.toThrow(/Only 3 unit/);
    await prisma.inventoryStock.update({ where: { branchId_partId: { branchId: cpd.id, partId: filter.id } }, data: { reservedQuantity: 2 } });
    await expect(
      inventory.adjustStock({ branchId: cpd.id, partId: filter.id, quantity: -2, type: "ADJUSTMENT", recordedById: manager.id }),
    ).rejects.toThrow(/reserved for picking/);
    const ok = await inventory.adjustStock({ branchId: cpd.id, partId: filter.id, quantity: -1, type: "ADJUSTMENT", notes: "Damaged", recordedById: manager.id });
    expect(ok.quantity).toBe(2);
    const opening = await inventory.adjustStock({ branchId: abuja.id, partId: filter.id, quantity: 5, type: "STOCKED", recordedById: manager.id });
    expect(opening.quantity).toBe(5);
    await prisma.inventoryStock.update({ where: { branchId_partId: { branchId: cpd.id, partId: filter.id } }, data: { reservedQuantity: 0 } });
  });
});

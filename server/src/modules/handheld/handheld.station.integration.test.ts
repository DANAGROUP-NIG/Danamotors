/**
 * Web-driven handheld jobs against a real database: queue on the web, a station delivers to a docked
 * handheld and collects the result, the store posts it. All four job types, two stations racing,
 * idempotent results, cancel cleanup on the device, and the notifications.
 * Skipped unless TEST_DATABASE_URL points at a separate, migrated database.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/danamotors_test npx jest handheld.station
 */
import type { PrismaClient } from "@prisma/client";
import type { HandheldService as ServiceType } from "./handheld.service";
import type { AuthedStation, HandheldStationService as StationServiceType } from "./handheld.station.service";

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

jest.setTimeout(90_000);

describeDb("Handheld stations (database)", () => {
  let prisma: PrismaClient;
  let service: ServiceType;
  let stations: StationServiceType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let transfers: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let partSale: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stockTake: any;
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9);
  let cpd: { id: string };
  let kp: { id: string };
  let manager: { id: string };
  let storeOfficer: { id: string };
  let requester: { id: string };
  let picker: { id: string };
  let filter: { id: string; partNumber: string };
  let pad: { id: string; partNumber: string };
  let customer: { id: string };
  let pc1: AuthedStation;
  let pc2: AuthedStation;
  let pc1Key: string;
  let device1: string;
  let device2: string;

  const stockOf = (partId: string) => prisma.inventoryStock.findUniqueOrThrow({ where: { branchId_partId: { branchId: cpd.id, partId } } });
  const notices = (userId: string, type: string) => prisma.notification.findMany({ where: { userId, type }, orderBy: { createdAt: "asc" } });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = require("../../prisma/client").default;
    service = new (require("./handheld.service").HandheldService)();
    stations = new (require("./handheld.station.service").HandheldStationService)();
    transfers = new (require("../stock-transfer/stockTransfer.service").StockTransferService)();
    partSale = new (require("../part-sale/partSale.service").PartSaleService)();
    stockTake = new (require("../stock-take/stockTake.service").StockTakeService)();

    const role = await prisma.role.upsert({ where: { name: "BranchStoreManager" }, update: {}, create: { name: "BranchStoreManager" } });
    const officerRole = await prisma.role.upsert({ where: { name: "StoreOfficer" }, update: {}, create: { name: "StoreOfficer" } });
    cpd = await prisma.branch.create({ data: { name: `CPD ST ${run}` } });
    kp = await prisma.branch.create({ data: { name: `Kia Plaza ST ${run}` } });
    const user = (label: string, branchId: string, roleId = role.id) =>
      prisma.user.create({ data: { email: `${label}.st${run}@test.local`, passwordHash: "x", firstName: label, lastName: "Test", roleId, branchId } });
    manager = await user("cpd", cpd.id);
    storeOfficer = await user("so", cpd.id, officerRole.id);
    requester = await user("kp", kp.id);
    picker = await prisma.employee.create({ data: { code: `S${run}`.slice(0, 10), name: "Picker 00015", branchId: cpd.id } });
    filter = await prisma.sparePart.create({ data: { partNumber: `2630035505-${run}`, name: "FILTER ASSY-OIL", unitPrice: 2500, retailRate: 3500 } });
    pad = await prisma.sparePart.create({ data: { partNumber: `58101D7A00-${run}`, name: "PAD KIT-FRONT DISC BRAKE", unitPrice: 30000, retailRate: 42000 } });
    await prisma.inventoryStock.createMany({
      data: [
        { branchId: cpd.id, partId: filter.id, quantity: 40, rackLocation: "N-3A1" },
        { branchId: cpd.id, partId: pad.id, quantity: 12, rackLocation: "N-3B4" },
      ],
    });
    customer = await prisma.customer.create({ data: { firstName: "CSIL", lastName: "Ibadan", companyName: `CSIL ST ${run}`, code: `T${run}`.slice(0, 12), branchId: cpd.id } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("registers a station with a key stored hashed, and refuses a rotated or revoked key", async () => {
    const created = await stations.createStation({ branchId: cpd.id, name: "store-pc1" }, manager.id);
    expect(created.station.name).toBe("STORE-PC1");
    expect(created.key.startsWith(`${created.station.id}.`)).toBe(true);
    const row = await prisma.handheldStation.findUniqueOrThrow({ where: { id: created.station.id } });
    expect(row.keyHash).not.toContain(created.key.split(".")[1]);
    expect(created.key.split(".")[1].startsWith(row.keyPrefix)).toBe(true);

    pc1 = await stations.authenticate(`Station ${created.key}`);
    expect(pc1).toMatchObject({ branchId: cpd.id, name: "STORE-PC1" });
    await expect(stations.authenticate(`Station ${created.station.id}.wrongwrongwrongwrongwrong`)).rejects.toThrow(/not valid/);
    await expect(stations.authenticate("Bearer abc")).rejects.toThrow(/key required/);
    await expect(stations.createStation({ branchId: cpd.id, name: "STORE-PC1" }, manager.id)).rejects.toThrow(/already registered/);

    const rotated = await stations.rotateKey(created.station.id);
    await expect(stations.authenticate(`Station ${created.key}`)).rejects.toThrow(/not valid/);
    pc1Key = rotated.key;
    pc1 = await stations.authenticate(`Station ${pc1Key}`);

    const spare = await stations.createStation({ branchId: cpd.id, name: "STORE-PC9" }, manager.id);
    await stations.revoke(spare.station.id);
    await expect(stations.authenticate(`Station ${spare.key}`)).rejects.toThrow(/not valid/);

    const second = await stations.createStation({ branchId: cpd.id, name: "STORE-PC2" }, manager.id);
    pc2 = await stations.authenticate(`Station ${second.key}`);
  });

  it("queues a job while no station is online and tells the sender and the store", async () => {
    const indent = await transfers.createIndent(
      { requestingBranchId: kp.id, sourceBranchId: cpd.id, authorisedBy: "SM", lines: [{ partId: filter.id, urgentQuantity: 3 }] },
      requester.id,
    );
    const approved = await transfers.approveIndent(indent.id, manager.id);
    const job = await service.createDocument({ type: "INDENT_PICK", sourceId: approved.openPickingList.id, pickerId: picker.id }, manager.id);
    expect(job).toMatchObject({ status: "QUEUED", sentAt: null });
    expect((await service.stationState(cpd.id)).online).toBe(false);
    const [notice] = await notices(manager.id, "HANDHELD_WAITING_NO_STATION");
    expect(notice.message).toBe(`Indent ${indent.indentNumber} is waiting: no handheld station is online at CPD ST ${run}.`);
    expect(notice.link).toBe(`/transfers/indents/${indent.id}`);
    expect(await notices(storeOfficer.id, "HANDHELD_WAITING_NO_STATION")).toHaveLength(1);
    await service.cancel(job.id, "Test set-up", manager.id);
  });

  it("registers docked handhelds by name and shows the station state", async () => {
    const hb = await stations.heartbeat(pc1, { linkVersion: "2026.10.28", docked: { appVersion: "1.4", appStatus: "OK", files: [] } });
    expect(hb.device!.name).toBe("MC3190-1");
    device1 = hb.device!.id;
    const again = await stations.heartbeat(pc1, { docked: { deviceId: device1, files: [] } });
    expect(again.device).toEqual({ id: device1, name: "MC3190-1" });

    const hb2 = await stations.heartbeat(pc2, { docked: { files: [] } });
    expect(hb2.device!.name).toBe("MC3190-2");
    device2 = hb2.device!.id;

    const state = await service.stationState(cpd.id);
    expect(state.online).toBe(true);
    expect(state.docked.map((s) => [s.name, s.dockedDevice?.name]).sort()).toEqual([["STORE-PC1", "MC3190-1"], ["STORE-PC2", "MC3190-2"]]);
  });

  it("delivers an indent pick to one handheld only, stores the result once and posts it", async () => {
    const indent = await transfers.createIndent(
      { requestingBranchId: kp.id, sourceBranchId: cpd.id, authorisedBy: "SM", lines: [{ partId: filter.id, urgentQuantity: 10 }, { partId: pad.id, urgentQuantity: 2 }] },
      requester.id,
    );
    const approved = await transfers.approveIndent(indent.id, manager.id);
    const job = await service.createDocument({ type: "INDENT_PICK", sourceId: approved.openPickingList.id, pickerId: picker.id }, manager.id);
    expect(job.status).toBe("QUEUED");
    expect((await stations.heartbeat(pc1, { docked: { deviceId: device1, files: [] } })).deliver).toBe(1);

    // Two PCs dock two handhelds at the same moment: only one takes the job.
    const [a, b] = await Promise.all([stations.claim(pc1, device1), stations.claim(pc2, device2)]);
    const winners = [a, b].filter((c) => c.jobs.some((j) => j.id === job.id));
    expect(winners).toHaveLength(1);
    const winner = winners[0] === a ? { station: pc1, device: device1 } : { station: pc2, device: device2 };
    const loser = winner.station === pc1 ? { station: pc2, device: device2 } : { station: pc1, device: device1 };
    const payload = winners[0].jobs.find((j) => j.id === job.id)!;
    expect(payload.document!.lines.map((l) => [l.binLocation, l.expectedQuantity])).toEqual([["N-3A1", 10], ["N-3B4", 2]]);

    expect(await stations.confirm(loser.station, job.id, loser.device)).toEqual({ status: "QUEUED" });
    expect(await stations.confirm(winner.station, job.id, winner.device)).toEqual({ status: "SENT" });
    expect(await stations.confirm(winner.station, job.id, winner.device)).toEqual({ status: "SENT" });
    const sent = await service.getDocument(job.id);
    expect(sent).toMatchObject({ status: "SENT", deliveredDevice: { id: winner.device } });
    expect(sent.sentAt).not.toBeNull();
    const [delivered] = await notices(manager.id, "HANDHELD_DELIVERED");
    expect(delivered.message).toMatch(new RegExp(`^Indent ${indent.indentNumber} is on handheld MC3190-[12] \\(picker Picker 00015\\)\\.$`));

    // The picker finished: the station lists the file and is told to collect it.
    const hb = await stations.heartbeat(winner.station, { docked: { deviceId: winner.device, files: [{ kind: "DOC", id: job.id, started: true, finished: true }] } });
    expect(hb.files).toEqual([{ kind: "DOC", id: job.id, action: "COLLECT" }]);

    const [filterLine] = sent.lines;
    // The picker never saved the pad line: the reason is chosen when posting.
    const result = { lines: [{ lineId: filterLine.id, quantity: 7, shortReason: "LESS_IN_BIN" as const }] };
    expect(await stations.submitResult(winner.station, { deviceId: winner.device, kind: "DOC", id: job.id, result })).toMatchObject({ status: "RECEIVED", clear: true });
    // A repeat (the station crashed before deleting the file) changes nothing and may clear the device.
    expect(await stations.submitResult(winner.station, { deviceId: winner.device, kind: "DOC", id: job.id, result: { lines: [...result.lines] } })).toMatchObject({ status: "RECEIVED", clear: true });
    await expect(
      stations.submitResult(winner.station, { deviceId: winner.device, kind: "DOC", id: job.id, result: { lines: [{ lineId: filterLine.id, quantity: 8, shortReason: "LESS_IN_BIN" }] } }),
    ).rejects.toThrow(/different result/);

    const received = await service.getDocument(job.id);
    expect(received.status).toBe("RECEIVED");
    expect(received.review).toMatchObject({ totals: { expected: 12, quantity: 7, short: 5, unreported: 1 }, problem: null });
    expect(received.review!.lines!.map((l: { reported: boolean; quantity: number | null }) => [l.reported, l.quantity])).toEqual([[true, 7], [false, null]]);
    // Not applied yet: reservations unchanged.
    expect((await stockOf(filter.id)).reservedQuantity).toBeGreaterThanOrEqual(10);
    const [finished] = await notices(manager.id, "HANDHELD_RECEIVED");
    expect(finished.message).toBe(`Indent ${indent.indentNumber} was picked on the handheld: 2 line(s) short. Review and post.`);

    const filterReservedBefore = (await stockOf(filter.id)).reservedQuantity;
    const posted = await service.post(job.id, { unreportedReason: "NOT_FOUND" }, storeOfficer.id);
    expect(posted.document.status).toBe("UPLOADED");
    expect((await stockOf(filter.id)).reservedQuantity).toBe(filterReservedBefore - 3);
    const after = await transfers.getIndent(indent.id);
    expect(after.lines.map((l: { partId: string; backOrderQuantity: number }) => [l.partId === filter.id ? "filter" : "pad", l.backOrderQuantity]).sort()).toEqual([["filter", 3], ["pad", 2]]);
    expect(posted.document.lines.find((l) => l.partId === pad.id)).toMatchObject({ quantity: 0, shortReason: "NOT_FOUND" });
    await expect(service.post(job.id, {}, storeOfficer.id)).rejects.toThrow(/already posted/);
    expect(await notices(manager.id, "HANDHELD_POSTED")).toHaveLength(1);

    // Posted with the same result: the station may now clear the device copy.
    expect(await stations.submitResult(winner.station, { deviceId: winner.device, kind: "DOC", id: job.id, result })).toMatchObject({ status: "UPLOADED", clear: true });
  });

  it("removes an untouched cancelled job from the device, keeps one with entries, and tells the sender", async () => {
    const order = await partSale.createOrder({ branchId: cpd.id, customerId: customer.id, pick: true, lines: [{ partId: pad.id, quantity: 1 }] }, manager.id);
    const job = await service.createDocument({ type: "CPO_PICK", sourceId: order.id, pickerId: picker.id }, manager.id);
    const { jobs } = await stations.claim(pc1, device1);
    expect(jobs.map((j) => j.id)).toEqual([job.id]);
    await stations.confirm(pc1, job.id, device1);
    await expect(service.post(job.id, {}, manager.id)).rejects.toThrow(/has not returned/);

    // The web gets there first: the CPO is released.
    await partSale.releaseOrder(order.id);
    expect((await service.getDocument(job.id)).status).toBe("CANCELLED");
    const untouched = await stations.heartbeat(pc1, { docked: { deviceId: device1, files: [{ kind: "DOC", id: job.id, started: false, finished: false }] } });
    expect(untouched.files[0].action).toBe("REMOVE");
    await stations.cleared(pc1, device1, { removed: [job.id], kept: [] });
    expect((await prisma.handheldDocument.findUniqueOrThrow({ where: { id: job.id } })).deviceClearedAt).not.toBeNull();

    const order2 = await partSale.createOrder({ branchId: cpd.id, customerId: customer.id, pick: true, lines: [{ partId: pad.id, quantity: 1 }] }, manager.id);
    const job2 = await service.createDocument({ type: "CPO_PICK", sourceId: order2.id, pickerId: picker.id }, manager.id);
    await stations.claim(pc1, device1);
    await stations.confirm(pc1, job2.id, device1);
    await service.cancel(job2.id, "Picker sent to another job", storeOfficer.id);
    const started = await stations.heartbeat(pc1, { docked: { deviceId: device1, files: [{ kind: "DOC", id: job2.id, started: true, finished: false }] } });
    expect(started.files[0].action).toBe("KEEP");
    expect((await prisma.handheldDocument.findUniqueOrThrow({ where: { id: job2.id } })).deviceKeptEntries).toBe(true);
    const late = await stations.submitResult(pc1, { deviceId: device1, kind: "DOC", id: job2.id, result: { lines: [] } });
    expect(late).toMatchObject({ status: "CANCELLED", clear: false });

    await stations.sweep();
    const cancelled = await notices(manager.id, "HANDHELD_CANCELLED");
    expect(cancelled.map((n) => n.message).sort()).toEqual([
      `CPO ${order.cpoNumber} was taken off the handheld: Picked stock released on the web.`,
      `CPO ${order2.cpoNumber} was taken off the handheld: Picker sent to another job.`,
    ]);
    await stations.sweep();
    expect(await notices(manager.id, "HANDHELD_CANCELLED")).toHaveLength(2);
  });

  it("checks an MIT on the handheld: posting verifies it and nothing moves into stock", async () => {
    const mit = await prisma.materialInTransit.create({
      data: {
        mitNumber: `8${run}`.slice(0, 10),
        destinationBranchId: cpd.id,
        vendor: "MOBIS",
        invoiceNumber: `A6DB${run}`,
        conversionRate: 2700,
        totalCases: 1,
        totalQuantity: 4,
        lines: { create: [{ partId: filter.id, caseNumbers: "SPD2APD00191", quantity: 4, unitPrice: 9.73, amount: 38.92 }] },
      },
    });
    const job = await service.createDocument({ type: "MIT_RECEIVE", sourceId: mit.id, pickerId: picker.id }, manager.id);
    await stations.claim(pc2, device2);
    await stations.confirm(pc2, job.id, device2);
    const lineId = (await service.getDocument(job.id)).lines[0].id;
    await stations.submitResult(pc2, {
      deviceId: device2,
      kind: "DOC",
      id: job.id,
      result: { lines: [{ lineId, quantity: 3, damagedQuantity: 1 }], extras: [{ partNumber: "97626H9000", quantity: 1, note: "loose in case" }] },
    });
    const [finished] = (await notices(manager.id, "HANDHELD_RECEIVED")).filter((n) => n.message.startsWith("MIT"));
    expect(finished.message).toBe(`MIT ${mit.mitNumber} was checked on the handheld: 1 line(s) differ from the invoice, 1 part(s) not on the MIT. Review and post.`);
    const stockBefore = (await stockOf(filter.id)).quantity;
    await service.post(job.id, {}, manager.id);
    expect((await prisma.materialInTransit.findUniqueOrThrow({ where: { id: mit.id } })).status).toBe("VERIFIED");
    expect((await stockOf(filter.id)).quantity).toBe(stockBefore);
  });

  it("counts a sheet on the handheld and posts it with the uncounted parts as none on hand", async () => {
    const { stockTake: take } = await stockTake.createStockTake(
      { branchId: cpd.id, type: "PERPETUAL", selection: { from: `2630035505-${run}`, to: `58101D7A00-${run}` } },
      manager.id,
    );
    const sheet = await stockTake.createSheet(take.id, { checkerId: manager.id }, manager.id);
    expect(sheet.lineCount).toBe(2);
    const job = await service.createDocument({ type: "COUNT_SHEET", sourceId: sheet.id, checkerId: storeOfficer.id }, manager.id);
    expect(job).toMatchObject({ status: "QUEUED", pickerName: "so Test", lineCount: 2 });
    expect((await prisma.stockTakeSheet.findUniqueOrThrow({ where: { id: sheet.id } })).checkerId).toBe(storeOfficer.id);
    await expect(service.createDocument({ type: "COUNT_SHEET", sourceId: sheet.id }, manager.id)).rejects.toThrow(/Already sent/);

    const { jobs } = await stations.claim(pc1, device1);
    const payload = jobs.find((j) => j.id === job.id)!;
    expect(payload.sheet!.sheetNumber).toBe(sheet.sheetNumber);
    expect(payload.sheet!.lines.map((l: { partNumber: string }) => l.partNumber).sort()).toEqual([filter.partNumber, pad.partNumber]);
    await stations.confirm(pc1, job.id, device1);

    const hb = await stations.heartbeat(pc1, { docked: { deviceId: device1, files: [{ kind: "SHEET", id: sheet.id, started: true, finished: true }] } });
    expect(hb.files[0].action).toBe("COLLECT");
    const entries = [{ partNumber: filter.partNumber, binLocation: "N-3A1", quantity: 38, countedAt: "2026-10-28T09:15:00.000Z" }];
    expect(await stations.submitResult(pc1, { deviceId: device1, kind: "SHEET", id: sheet.id, result: { entries } })).toMatchObject({ status: "RECEIVED", clear: true, jobId: job.id });
    // The same counts again, stamped with a later receive time: a repeat, not a different result.
    const repeat = [{ ...entries[0], countedAt: "2026-10-28T09:45:00.000Z" }];
    expect(await stations.submitResult(pc1, { deviceId: device1, kind: "SHEET", id: sheet.id, result: { entries: repeat } })).toMatchObject({ status: "RECEIVED", clear: true });
    const received = await service.getDocument(job.id);
    expect(received.review).toMatchObject({ notCounted: [{ partNumber: pad.partNumber, binLocation: "N-3B4" }], totals: { entries: 1, quantity: 38, notCounted: 1 } });
    const [finished] = (await notices(manager.id, "HANDHELD_RECEIVED")).filter((n) => n.message.startsWith("Count sheet"));
    expect(finished.message).toBe(`Count sheet ${sheet.sheetNumber} was counted on the handheld: 1 of 2 part(s) counted. Review and post.`);
    expect(finished.link).toBe(`/inventory/stock-taking/${take.id}/sheets/${sheet.id}`);

    await expect(service.post(job.id, {}, manager.id)).rejects.toThrow(/not counted/);
    await service.post(job.id, { uncounted: "ZERO" }, manager.id);
    const lines = await prisma.stockTakeLine.findMany({ where: { stockTakeId: take.id }, orderBy: { partNumber: "asc" } });
    expect(lines.map((l) => [l.partNumber, l.countedQuantity])).toEqual([[filter.partNumber, 38], [pad.partNumber, 0]]);
    const count = await prisma.stockTakeCount.findFirstOrThrow({ where: { line: { partId: filter.id }, sheetId: sheet.id } });
    expect(count.countedAt.toISOString()).toBe("2026-10-28T09:15:00.000Z");
    expect((await prisma.stockTakeSheet.findUniqueOrThrow({ where: { id: sheet.id } })).uploadedAt).not.toBeNull();

    // A second sheet: cancelling it on the web cancels its job; a sheet the old HHDC Link wrote has no job.
    await prisma.stockTakeLine.updateMany({ where: { stockTakeId: take.id }, data: { countedQuantity: null } });
    const sheet2 = await stockTake.createSheet(take.id, { checkerId: manager.id }, manager.id);
    const job2 = await service.createDocument({ type: "COUNT_SHEET", sourceId: sheet2.id }, manager.id);
    await stockTake.cancelSheet(take.id, sheet2.id, "Recount next week", manager.id);
    expect(await service.getDocument(job2.id)).toMatchObject({ status: "CANCELLED", cancelRemark: "Sheet cancelled on the web: Recount next week" });

    const sheet3 = await stockTake.createSheet(take.id, { checkerId: manager.id }, manager.id);
    const legacy = await stations.submitResult(pc2, { deviceId: device2, kind: "SHEET", id: sheet3.id, result: { entries: [{ partId: pad.id, quantity: 12 }] } });
    expect(legacy).toMatchObject({ status: "RECEIVED", clear: true });
    expect(await service.getDocument(legacy.jobId!)).toMatchObject({ type: "COUNT_SHEET", status: "RECEIVED", deliveredDevice: { id: device2 } });
  });

  it("returns an unconfirmed delivery to the queue when the lease runs out", async () => {
    const order = await partSale.createOrder({ branchId: cpd.id, customerId: customer.id, pick: true, lines: [{ partId: filter.id, quantity: 1 }] }, manager.id);
    const job = await service.createDocument({ type: "CPO_PICK", sourceId: order.id, pickerId: picker.id }, manager.id);
    expect((await stations.claim(pc1, device1)).jobs.map((j) => j.id)).toEqual([job.id]);
    expect((await stations.claim(pc2, device2)).jobs).toEqual([]);
    await prisma.handheldDocument.update({ where: { id: job.id }, data: { claimExpiresAt: new Date("2026-01-01T00:00:00Z") } });
    expect((await stations.claim(pc2, device2)).jobs.map((j) => j.id)).toEqual([job.id]);
    expect(await stations.confirm(pc1, job.id, device1)).toEqual({ status: "QUEUED" });

    await stations.release(pc2, job.id, "Document is already on the device with results");
    expect((await stations.claim(pc1, device1)).jobs.map((j) => j.id)).toEqual([job.id]);
    await service.cancel(job.id, "Test done", manager.id);
  });

  it("reports a job still waiting after 2 h and a station that went offline while jobs wait, once each", async () => {
    const order = await partSale.createOrder({ branchId: cpd.id, customerId: customer.id, pick: true, lines: [{ partId: filter.id, quantity: 2 }] }, manager.id);
    const job = await service.createDocument({ type: "CPO_PICK", sourceId: order.id, pickerId: picker.id }, manager.id);
    await prisma.handheldDocument.update({ where: { id: job.id }, data: { queuedAt: new Date(Date.now() - 3 * 3600_000) } });
    await prisma.handheldStation.update({ where: { id: pc1.id }, data: { lastSeenAt: new Date(Date.now() - 5 * 60_000) } });
    await prisma.handheldStation.update({ where: { id: pc2.id }, data: { lastSeenAt: new Date(Date.now() - 5 * 60_000) } });

    await stations.sweep();
    await stations.sweep();
    expect((await notices(manager.id, "HANDHELD_WAITING_LONG")).map((n) => n.message)).toEqual([`CPO ${order.cpoNumber} has waited 2 h for a handheld.`]);
    const offline = await notices(storeOfficer.id, "HANDHELD_STATION_OFFLINE");
    expect(offline.map((n) => n.message).sort()).toEqual([
      `Handheld station STORE-PC1 at CPD ST ${run} is offline; 1 handheld job(s) are waiting.`,
      `Handheld station STORE-PC2 at CPD ST ${run} is offline; 1 handheld job(s) are waiting.`,
    ]);
    expect((await service.stationState(cpd.id)).online).toBe(false);

    // Back online: a later outage is reported again.
    await stations.heartbeat(pc1, {});
    expect((await prisma.handheldStation.findUniqueOrThrow({ where: { id: pc1.id } })).offlineNotifiedAt).toBeNull();
    await service.cancel(job.id, "Test done", manager.id);
  });

  it("reports a handheld the app could not be installed on", async () => {
    await stations.heartbeat(pc1, { docked: { deviceId: device1, appStatus: "INSTALL_FAILED", appError: "DanamotorsCount.exe is in use", files: [] } });
    await stations.heartbeat(pc1, { docked: { deviceId: device1, appStatus: "INSTALL_FAILED", appError: "DanamotorsCount.exe is in use", files: [] } });
    const failed = await notices(storeOfficer.id, "HANDHELD_INSTALL_FAILED");
    expect(failed.map((n) => n.message)).toEqual(["The Danamotors app could not be installed on handheld MC3190-1 at STORE-PC1: DanamotorsCount.exe is in use"]);
    expect(pc1Key).toBeTruthy();
  });
});

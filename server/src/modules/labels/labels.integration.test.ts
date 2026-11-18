/**
 * Barcode labels against a real database: queue on the web, a station with a ready printer claims and
 * prints, failures are retried, two stations never print the same job, and the heartbeat records the
 * printer. Skipped unless TEST_DATABASE_URL points at a separate, migrated database.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/danamotors_test npx jest labels.integration
 */
import type { PrismaClient } from "@prisma/client";
import type { LabelService as ServiceType } from "./labels.service";
import type { AuthedStation, HandheldStationService as StationServiceType } from "../handheld/handheld.station.service";

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

jest.setTimeout(60_000);

const READY = { model: "ZTC S4M-200dpi ZPL", status: "READY" as const };

describeDb("Barcode labels (database)", () => {
  let prisma: PrismaClient;
  let labels: ServiceType;
  let stations: StationServiceType;
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9);
  let cpd: { id: string };
  let kp: { id: string };
  let manager: { id: string };
  let horn: { id: string; partNumber: string };
  let bulb: { id: string; partNumber: string };
  let pc1: AuthedStation;
  let pc2: AuthedStation;
  let kpPc: AuthedStation;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = require("../../prisma/client").default;
    labels = new (require("./labels.service").LabelService)();
    stations = new (require("../handheld/handheld.station.service").HandheldStationService)();

    const role = await prisma.role.upsert({ where: { name: "BranchStoreManager" }, update: {}, create: { name: "BranchStoreManager" } });
    cpd = await prisma.branch.create({ data: { name: `CPD LB ${run}`, shortName: "CPD" } });
    kp = await prisma.branch.create({ data: { name: `Kia Plaza LB ${run}` } });
    manager = await prisma.user.create({ data: { email: `lb${run}@test.local`, passwordHash: "x", firstName: "Store", lastName: "Manager", roleId: role.id, branchId: cpd.id } });
    horn = await prisma.sparePart.create({ data: { partNumber: `96610H${run}`.slice(0, 15), name: "HORN ASSY-HIGH PITCH", unitPrice: 1 } });
    bulb = await prisma.sparePart.create({ data: { partNumber: `1864761566-${run}`, name: "BULB-HALOGEN", unitPrice: 1 } });
    await prisma.inventoryStock.create({ data: { branchId: cpd.id, partId: horn.id, quantity: 4, rackLocation: "A-12-03" } });

    const station = async (branchId: string, name: string) => stations.authenticate(`Station ${(await stations.createStation({ branchId, name }, manager.id)).key}`);
    pc1 = await station(cpd.id, "STORE-PC1");
    pc2 = await station(cpd.id, "STORE-PC2");
    kpPc = await station(kp.id, "KP-PC1");
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("finds parts with the branch's bin and stock", async () => {
    const found = await labels.searchParts(horn.partNumber.slice(0, 8), cpd.id);
    expect(found.find((p) => p.id === horn.id)).toMatchObject({ bin: "A-12-03", stock: 4 });
    expect((await labels.searchParts(horn.partNumber.slice(0, 8), kp.id)).find((p) => p.id === horn.id)).toMatchObject({ bin: null, stock: 0 });
  });

  it("records the printer from the heartbeat; an older HHDC Link leaves it as it was", async () => {
    await stations.heartbeat(pc1, { linkVersion: "t", docked: null, printer: READY });
    let printers = await labels.printers(cpd.id);
    expect(printers.find((p) => p.id === pc1.id)).toMatchObject({ online: true, printerModel: READY.model, printerStatus: "READY" });
    expect(printers.find((p) => p.id === pc2.id)).toMatchObject({ online: false, printerModel: null });

    await stations.heartbeat(pc1, { linkVersion: "t", docked: null });
    printers = await labels.printers(cpd.id);
    expect(printers.find((p) => p.id === pc1.id)?.printerModel).toBe(READY.model);

    await stations.heartbeat(pc1, { linkVersion: "t", docked: null, printer: null });
    expect((await labels.printers(cpd.id)).find((p) => p.id === pc1.id)?.printerModel).toBeNull();
  });

  it("renders the job when it is made, with the bin of the printing branch", async () => {
    const { job } = await labels.create({ branchId: cpd.id, labels: [{ partId: horn.id, copies: 2 }, { partId: bulb.id, copies: 1 }] }, manager.id);
    expect(job).toMatchObject({ status: "QUEUED", labelCount: 3 });
    const row = await prisma.labelPrintJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.zpl).toContain(`^FD>:${horn.partNumber}^FS`);
    expect(row.zpl).toContain("^FDBIN A-12-03^FS");
    expect(row.zpl).toContain("^FB378,1,0,R^FH_^FDCPD^FS");
    expect(row.zpl.match(/\^XA/g)).toHaveLength(2);
    // The other branch's station never sees it.
    expect((await labels.claim(kpPc, READY)).jobs).toHaveLength(0);
  });

  it("claims only while the printer is ready, and never gives one job to two stations", async () => {
    expect((await labels.claim(pc1, { ...READY, status: "PAPER_OUT" })).jobs).toHaveLength(0);
    const [a, b] = await Promise.all([labels.claim(pc1, READY), labels.claim(pc2, READY)]);
    const all = [...a.jobs, ...b.jobs];
    expect(all).toHaveLength(1);
    const winner = a.jobs.length ? pc1 : pc2;
    const loser = a.jobs.length ? pc2 : pc1;
    const id = all[0].id;

    await expect(labels.cancel(id)).rejects.toThrow(/already printing/);
    await expect(labels.done(loser, id, { ok: true })).rejects.toThrow(/not claimed by this station/);
    expect(await labels.done(winner, id, { ok: true })).toEqual({ status: "PRINTED" });
    // A repeat after a lost reply changes nothing.
    expect(await labels.done(winner, id, { ok: true })).toEqual({ status: "PRINTED" });
    const printed = await prisma.labelPrintJob.findUniqueOrThrow({ where: { id }, include: { printedStation: true } });
    expect(printed.printedStation?.name).toBe(winner.name);
    await expect(labels.done(kpPc, id, { ok: true })).rejects.toThrow(/not found at this branch/);
  });

  it("keeps a failure on the job until it is printed again", async () => {
    const { job } = await labels.create({ branchId: cpd.id, labels: [{ partId: bulb.id, copies: 1 }] }, manager.id);
    const claimed = await labels.claim(pc1, READY);
    expect(claimed.jobs.map((j) => j.id)).toEqual([job.id]);
    expect(await labels.done(pc1, job.id, { ok: false, error: "USB write failed" })).toEqual({ status: "FAILED" });
    expect((await labels.list(cpd.id)).find((j) => j.id === job.id)).toMatchObject({ status: "FAILED", error: "USB write failed" });

    expect((await labels.retry(job.id)).status).toBe("QUEUED");
    await expect(labels.retry(job.id)).rejects.toThrow(/Only a failed or cancelled/);
    expect((await labels.cancel(job.id)).status).toBe("CANCELLED");
    expect((await labels.claim(pc1, READY)).jobs).toHaveLength(0);
  });

  it("refuses a part number a barcode cannot carry", async () => {
    const odd = await prisma.sparePart.create({ data: { partNumber: `PART–${run}`, name: "EN DASH", unitPrice: 1 } });
    await expect(labels.create({ branchId: cpd.id, labels: [{ partId: odd.id, copies: 1 }] }, manager.id)).rejects.toThrow(/cannot carry/);
  });
});

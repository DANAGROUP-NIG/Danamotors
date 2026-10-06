/**
 * Mobis MIT import and MRN posting against a real database.
 * Skipped unless TEST_DATABASE_URL points at a separate, migrated database.
 */
import type { PrismaClient } from "@prisma/client";
import type { MobisPurchaseService as ServiceType } from "./mobisPurchase.service";

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

jest.setTimeout(60_000);

describeDb("Mobis purchase receiving (database)", () => {
  let prisma: PrismaClient;
  let service: ServiceType;
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-8);
  let cpd: { id: string };
  let user: { id: string };
  let existingPart: { id: string; partNumber: string };

  const invoice = (suffix = "") => ({
    destinationBranchId: cpd.id,
    invoiceNumber: `A6EA${run}${suffix}`,
    conversionRate: 2700,
    receivedMode: "AIR" as const,
    sourceFileName: "A6EA0567A.xls",
    lines: [
      { orderNumber: "AV10K6Q01R", lineNumber: "0001", partNumber: existingPart.partNumber, partName: "CRASH PAD ASSY-MAIN", quantity: 2, unitPrice: 165.08, amount: 330.16, caseNumber: "SPD2APE00210" },
      { orderNumber: "AV10K6Q01R", lineNumber: "0002", partNumber: `66311Q${run}`, partName: "PANEL-FENDER,LH", quantity: 1, unitPrice: 94.77, amount: 94.77, caseNumber: "SPD2APE00210" },
      { orderNumber: "AV10K6Q01R", lineNumber: "0003", partNumber: `92101Q${run}`, partName: "LAMP ASSY-HEAD,LH", quantity: 3, unitPrice: 326.59, amount: 979.77, caseNumber: "SPD2APE00211" },
    ],
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = require("../../prisma/client").default;
    service = new (require("./mobisPurchase.service").MobisPurchaseService)();
    const role = await prisma.role.upsert({ where: { name: "GeneralStoreManager" }, update: {}, create: { name: "GeneralStoreManager" } });
    cpd = await prisma.branch.create({ data: { name: `CPD Mobis ${run}` } });
    user = await prisma.user.create({
      data: { email: `mobis.${run}@test.local`, passwordHash: "x", firstName: "Store", lastName: "Test", roleId: role.id },
    });
    existingPart = await prisma.sparePart.create({
      data: { partCode: `84710Q${run}WK`, partNumber: `84710Q${run}WK`, name: "CRASH PAD ASSY-MAIN", unitPrice: 400000 },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("refuses parts missing from Part Master unless asked to create them", async () => {
    await expect(service.importMit(invoice("X"), user.id)).rejects.toThrow(/2 part\(s\) are not in Part Master/);
  });

  it("imports the invoice, creating missing parts at unit price x conversion rate", async () => {
    const mit = await service.importMit({ ...invoice(), createMissingParts: true }, user.id);
    expect(mit).toMatchObject({
      vendor: "MOBIS",
      status: "IN_TRANSIT",
      conversionRate: 2700,
      receivedMode: "AIR",
      totalQuantity: 6,
      totalCases: 2,
    });
    expect(mit.totalAmount).toBeCloseTo(1404.7, 2);
    expect(mit.lines.map((l) => [l.filePartNumber, l.newPart])).toEqual([
      [existingPart.partNumber, false],
      [`66311Q${run}`, true],
      [`92101Q${run}`, true],
    ]);
    const created = await prisma.sparePart.findUniqueOrThrow({ where: { partNumber: `92101Q${run}` } });
    expect(created).toMatchObject({ name: "LAMP ASSY-HEAD,LH", unitPrice: 881793, category: "Mobis import" });
    expect(created.partCode).not.toBe(created.partNumber);
  });

  it("does not import the same invoice twice", async () => {
    await expect(service.importMit({ ...invoice(), createMissingParts: true }, user.id)).rejects.toThrow(/already imported/);
  });

  it("generates one MRN, posts accepted stock to CPD and records damaged and short", async () => {
    const [mitRow] = await service.listMobisMits({ search: `A6EA${run}` });
    const mit = await service.getMobisMit(mitRow.id);
    const [crashPad, fender, lamp] = mit.lines;

    const done = await service.createMrn(mit.id, user.id, {
      lines: [
        { mitLineId: crashPad.id, receivedQuantity: 2 },
        { mitLineId: fender.id, receivedQuantity: 0, damagedQuantity: 1 },
        { mitLineId: lamp.id, receivedQuantity: 2 },
      ],
    });
    expect(done.status).toBe("RECEIVED");
    expect(done.mrn).toMatchObject({ taxForm: "P", conversionRate: 2700, totalReceived: 4, totalDamaged: 1, totalShort: 1 });
    // 2 x 165.08 x 2700 + 2 x 326.59 x 2700
    expect(done.mrn!.totalValue).toBeCloseTo(891432 + 1763586, 2);

    const stock = await prisma.inventoryStock.findMany({ where: { branchId: cpd.id }, include: { part: true } });
    const qty = Object.fromEntries(stock.map((s) => [s.part.partNumber, s.quantity]));
    expect(qty).toEqual({ [existingPart.partNumber]: 2, [`92101Q${run}`]: 2 });
    const txns = await prisma.stockTransaction.findMany({ where: { referenceId: done.mrn!.id } });
    expect(txns.map((t) => [t.type, t.quantity]).sort()).toEqual([["RECEIVED", 2], ["RECEIVED", 2]]);

    await expect(service.createMrn(mit.id, user.id)).rejects.toThrow(/Cannot generate an MRN/);
    await expect(service.cancelMit(mit.id, user.id)).rejects.toThrow(/already has MRN/);
  });

  it("posts stock only once when two MRN requests race", async () => {
    const mit = await service.importMit({ ...invoice("R"), createMissingParts: true }, user.id);
    const results = await Promise.allSettled([service.createMrn(mit.id, user.id), service.createMrn(mit.id, user.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lamp = await prisma.inventoryStock.findFirstOrThrow({ where: { branchId: cpd.id, part: { partNumber: `92101Q${run}` } } });
    expect(lamp.quantity).toBe(2 + 3);
  });

  it("cancels an MIT before its MRN, which allows re-importing the invoice", async () => {
    const mit = await service.importMit({ ...invoice("C"), createMissingParts: true }, user.id);
    const cancelled = await service.cancelMit(mit.id, user.id, "Wrong file");
    expect(cancelled.status).toBe("CANCELLED");
    const again = await service.importMit({ ...invoice("C"), createMissingParts: true }, user.id);
    expect(again.status).toBe("IN_TRANSIT");
  });
});

/**
 * Dispatch challans against a real database: issue -> partial return -> full return, and the reports.
 * Skipped unless TEST_DATABASE_URL points at a separate, migrated database.
 */
import type { PrismaClient } from "@prisma/client";
import type { DispatchChallanService as ServiceType } from "./dispatchChallan.service";

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

jest.setTimeout(60_000);

describeDb("Dispatch challans (database)", () => {
  let prisma: PrismaClient;
  let service: ServiceType;
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-8);
  let kp: { id: string };
  let user: { id: string };
  let allen: { id: string; code: string | null };
  let petrol: { id: string };
  let gloves: { id: string };
  let challanId = "";
  const today = new Date().toISOString().slice(0, 10);

  const stockOf = async (partId: string) =>
    prisma.inventoryStock.findUniqueOrThrow({ where: { branchId_partId: { branchId: kp.id, partId } } });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = require("../../prisma/client").default;
    service = new (require("./dispatchChallan.service").DispatchChallanService)();
    const role = await prisma.role.upsert({ where: { name: "GeneralStoreManager" }, update: {}, create: { name: "GeneralStoreManager" } });
    kp = await prisma.branch.create({ data: { name: `Kia Plaza Challan ${run}` } });
    user = await prisma.user.create({
      data: { email: `challan.${run}@test.local`, passwordHash: "x", firstName: "Store", lastName: "Test", roleId: role.id, branchId: kp.id },
    });
    allen = await prisma.customer.create({
      data: { firstName: "Allen", lastName: "Opebi", companyName: `ALLEN 5 - OPEBI ${run}`, code: `A${run}`, branchId: kp.id },
    });
    // Legacy Kia Plaza challans: petrol at 2,100 a litre, cotton gloves at 150.
    petrol = await prisma.sparePart.create({
      data: { partCode: `PETROL${run}`, partNumber: `PETROL${run}`, name: "PETROL", unitPrice: 1900, retailRate: 2100, partType: "O" },
    });
    gloves = await prisma.sparePart.create({
      data: { partCode: `GLOVES${run}`, partNumber: `GLOVES${run}`, name: "COTTON HAND GLOVES", unitPrice: 100, retailRate: 150 },
    });
    await prisma.inventoryStock.createMany({
      data: [
        { branchId: kp.id, partId: petrol.id, quantity: 100, reservedQuantity: 10 },
        { branchId: kp.id, partId: gloves.id, quantity: 20 },
      ],
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("issues a challan to a cost centre at retail rate, with a gate pass, and takes the stock out", async () => {
    const challan = await service.createChallan(
      { branchId: kp.id, customerId: allen.id, remarks: "Generator", lines: [{ partId: petrol.id, quantity: 40 }, { partId: gloves.id, quantity: 12 }] },
      user.id,
    );
    challanId = challan.id;
    expect(challan.challanNumber).toMatch(/^\d{10}$/);
    expect(challan.gatePassNumber).toMatch(/^\d{10}$/);
    expect(challan).toMatchObject({ totalQuantity: 52, totalAmount: 85800, customerId: allen.id });
    expect(challan.lines.map((l) => [l.quantity, l.rate, l.amount])).toEqual(
      expect.arrayContaining([[40, 2100, 84000], [12, 150, 1800]]),
    );
    expect((await stockOf(petrol.id)).quantity).toBe(60);
    expect((await stockOf(gloves.id)).quantity).toBe(8);
    const txns = await prisma.stockTransaction.findMany({ where: { referenceId: challan.id } });
    expect(txns.map((t) => [t.type, t.quantity]).sort()).toEqual([["ISSUED", -12], ["ISSUED", -40]]);
  });

  it("refuses to issue reserved or missing stock, and leaves stock untouched", async () => {
    // 60 on hand, 10 reserved for a job: 50 free.
    await expect(
      service.createChallan({ branchId: kp.id, customerId: allen.id, lines: [{ partId: gloves.id, quantity: 1 }, { partId: petrol.id, quantity: 51 }] }, user.id),
    ).rejects.toThrow(/Only 50 of/);
    expect((await stockOf(petrol.id)).quantity).toBe(60);
    expect((await stockOf(gloves.id)).quantity).toBe(8);
  });

  it("takes a partial return, then a full return of what is still out", async () => {
    const challan = await service.getChallan(challanId);
    const petrolLine = challan.lines.find((l) => l.partId === petrol.id)!;
    const after = await service.createReturn(challanId, { reason: "Not used", lines: [{ challanLineId: petrolLine.id, quantity: 5 }] }, user.id);
    expect(after.returns).toHaveLength(1);
    expect(after.returns[0]).toMatchObject({ fullReturn: false, totalQuantity: 5, totalAmount: 10500 });
    expect((await stockOf(petrol.id)).quantity).toBe(65);

    await expect(
      service.createReturn(challanId, { lines: [{ challanLineId: petrolLine.id, quantity: 36 }] }, user.id),
    ).rejects.toThrow(/Only 35/);

    const full = await service.createReturn(challanId, { fullReturn: true }, user.id);
    expect(full.returns[1]).toMatchObject({ fullReturn: true, totalQuantity: 47 });
    expect(full.lines.every((l) => l.returnedQuantity === l.quantity)).toBe(true);
    expect((await stockOf(petrol.id)).quantity).toBe(100);
    expect((await stockOf(gloves.id)).quantity).toBe(20);
    await expect(service.createReturn(challanId, { fullReturn: true }, user.id)).rejects.toThrow(/already been returned/);
  });

  it("shows on the Dispatch Challan Register, the Checklist for Issues and the Consumption Report", async () => {
    const { PartsReportService } = require("../parts-report/partsReport.service");
    const reports = new PartsReportService();
    const filters = { from: today, to: today, branchId: kp.id };

    const register = await reports.run("dispatch-challan-register", filters);
    const challan = await service.getChallan(challanId);
    expect(register.rows).toHaveLength(2);
    expect(register.rows[0].group).toContain(`Challan ${challan.challanNumber}`);
    expect(register.rows[0].group).toContain(`A${run}`);
    expect(register.rows[0].group).toContain(`Gate pass ${challan.gatePassNumber}`);
    expect(register.totals).toMatchObject({ quantity: 52, returned: 52, amount: 85800 });

    const oilOnly = await reports.run("dispatch-challan-register", { ...filters, partType: "O" });
    expect(oilOnly.rows.map((r: { partNumber: string }) => r.partNumber)).toEqual([`PETROL${run}`]);

    const checklist = await reports.run("issue-checklist", filters);
    const challanRows = checklist.rows.filter((r: { group: string }) => r.group === "Challans");
    expect(challanRows).toHaveLength(2);
    expect(challanRows[0]).toMatchObject({ voucher: challan.challanNumber, code: `A${run}` });

    // First challan: issued 52 and all came back, so it nets to nothing. A second challan of 3 litres
    // is valued at the 2,100 it was issued at, even after the retail rate goes up.
    await service.createChallan({ branchId: kp.id, customerId: allen.id, lines: [{ partId: petrol.id, quantity: 3 }] }, user.id);
    await prisma.sparePart.update({ where: { id: petrol.id }, data: { retailRate: 2500 } });
    const consumption = await reports.run("consumption", filters);
    const petrolRow = consumption.rows.find((r: { partNumber: string }) => r.partNumber === `PETROL${run}`);
    expect(petrolRow).toMatchObject({ consumable: 3, quantity: 3, value: 6300 });
    expect(consumption.rows.find((r: { partNumber: string }) => r.partNumber === `GLOVES${run}`)).toBeUndefined();
  });
});

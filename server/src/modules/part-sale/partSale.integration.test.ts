/**
 * CPD part sale against a real database: CPO -> pick -> counter sale -> return.
 * Skipped unless TEST_DATABASE_URL points at a separate, migrated database.
 */
import type { PrismaClient } from "@prisma/client";
import type { PartSaleService as ServiceType } from "./partSale.service";

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

jest.setTimeout(60_000);

describeDb("CPD part sale (database)", () => {
  let prisma: PrismaClient;
  let service: ServiceType;
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-8);
  let cpd: { id: string };
  let user: { id: string };
  let customer: { id: string };
  let mirror: { id: string };
  let oil: { id: string };

  const stockOf = async (partId: string) =>
    prisma.inventoryStock.findUniqueOrThrow({ where: { branchId_partId: { branchId: cpd.id, partId } } });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = require("../../prisma/client").default;
    service = new (require("./partSale.service").PartSaleService)();
    const role = await prisma.role.upsert({ where: { name: "GeneralStoreManager" }, update: {}, create: { name: "GeneralStoreManager" } });
    cpd = await prisma.branch.create({ data: { name: `CPD Sale ${run}` } });
    user = await prisma.user.create({
      data: { email: `sale.${run}@test.local`, passwordHash: "x", firstName: "Store", lastName: "Test", roleId: role.id, branchId: cpd.id },
    });
    customer = await prisma.customer.create({
      data: { firstName: "CSIL", lastName: "Ibadan", companyName: `CSIL IBADAN ${run}`, code: `C${run}`, branchId: cpd.id },
    });
    // Legacy bill 2026000010 priced this part at 273,313.81.
    mirror = await prisma.sparePart.create({
      data: { partCode: `97235D${run}`, partNumber: `97235D${run}`, name: "MIRROR ASSY", unitPrice: 132036.62, retailRate: 273313.81, taxable: true },
    });
    oil = await prisma.sparePart.create({
      data: { partCode: `OIL${run}`, partNumber: `OIL${run}`, name: "ENGINE OIL 4L", unitPrice: 4700, retailRate: 7050, taxable: false },
    });
    await prisma.inventoryStock.createMany({
      data: [
        { branchId: cpd.id, partId: mirror.id, quantity: 3 },
        { branchId: cpd.id, partId: oil.id, quantity: 10 },
      ],
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("creates a CPO at retail rates and picks what stock allows", async () => {
    const order = await service.createOrder(
      {
        branchId: cpd.id,
        customerId: customer.id,
        customerRefNo: "MAIL ORDER DT 15.04.2026",
        pick: true,
        lines: [
          { partId: mirror.id, quantity: 5 },
          { partId: oil.id, quantity: 4 },
        ],
      },
      user.id,
    );
    expect(order).toMatchObject({ status: "OPEN", totalQuantity: 9 });
    expect(order.cpoNumber).toMatch(/^\d{10}$/);
    expect(order.validTill).not.toBeNull();
    const [m, o] = order.lines;
    expect([m.pickedQuantity, o.pickedQuantity]).toEqual([3, 4]);
    expect((await stockOf(mirror.id)).reservedQuantity).toBe(3);
    expect((await stockOf(oil.id)).reservedQuantity).toBe(4);
  });

  it("bills picked lines at the legacy CPD price and rounding", async () => {
    const [row] = await service.listOrders({ customerId: customer.id });
    const order = await service.getOrder(row.id);
    const [m, o] = order.lines;

    const sale = await service.createCounterSale(
      {
        branchId: cpd.id,
        customerId: customer.id,
        cashDiscountPercent: 22.5,
        transportMode: "ROAD",
        lines: [
          { orderLineId: m.id, quantity: 1 },
          { orderLineId: o.id, quantity: 4 },
        ],
      },
      user.id,
    );
    // Mirror: 273,313.81 less 22.5%, plus 7.5% VAT = 227,704.57. Oil: 28,200 less 22.5%, no VAT = 21,855.
    expect(sale.invoice).toMatchObject({
      jobCardId: null,
      reportBranchId: cpd.id,
      partsTotal: 301513.81,
      partsDiscountPercent: 22.5,
      vatAmount: 15886.37,
      total: 249550,
      outstandingAmount: 249550,
      status: "Unpaid",
    });
    expect(sale.invoice.invoiceNumber).toMatch(/^CS\d{10}$/);
    expect(sale.invoice.lines.map((l) => [l.quantity, l.vatPercent])).toEqual([[1, 7.5], [4, 0]]);

    expect(await stockOf(mirror.id)).toMatchObject({ quantity: 2, reservedQuantity: 2 });
    expect(await stockOf(oil.id)).toMatchObject({ quantity: 6, reservedQuantity: 0 });
    const after = await service.getOrder(order.id);
    expect(after.status).toBe("PARTLY_BILLED");
    expect(after.lines.map((l) => [l.pickedQuantity, l.billedQuantity])).toEqual([[2, 1], [0, 4]]);

    // The bill goes to Tally as a sales voucher, like a job bill.
    const { TallyService } = require("../finance/tally.service");
    const pending = await new TallyService().listDocuments({ date: new Date().toISOString().slice(0, 10), type: "JOB_BILL", branchId: cpd.id });
    expect(pending.map((d: { documentNumber: string }) => d.documentNumber)).toEqual([sale.invoice.invoiceNumber]);
  });

  it("refuses to bill more than picked plus free stock", async () => {
    const [row] = await service.listOrders({ customerId: customer.id });
    const order = await service.getOrder(row.id);
    await expect(
      service.createCounterSale(
        { branchId: cpd.id, customerId: customer.id, lines: [{ orderLineId: order.lines[0].id, quantity: 4 }] },
        user.id,
      ),
    ).rejects.toThrow(/Only 2 unit/);
  });

  it("takes a return back into stock and sets the credit off against the bill", async () => {
    const [listed] = await service.listCounterSales({ customerId: customer.id });
    const sale = await service.getCounterSale(listed.id);
    const oilLine = sale.invoice.lines.find((l) => l.partId === oil.id)!;

    const after = await service.createReturn(sale.id, { reason: "Wrong grade", lines: [{ invoiceLineId: oilLine.id, quantity: 2 }] }, user.id);
    const [ret] = after.returns;
    // 2 x 7,050 = 14,100 less 22.5% = 10,927.50, no VAT, rounded down to 10,920.
    expect(ret).toMatchObject({ grossAmount: 14100, discountAmount: 3172.5, total: 10920 });
    expect(ret.creditNote).toMatchObject({ remainingAmount: 0 });
    expect(after.invoice.outstandingAmount).toBe(249550 - 10920);
    expect(after.invoice.lines.find((l) => l.id === oilLine.id)!.returnedQuantity).toBe(2);
    expect((await stockOf(oil.id)).quantity).toBe(8);

    await expect(
      service.createReturn(sale.id, { lines: [{ invoiceLineId: oilLine.id, quantity: 3 }] }, user.id),
    ).rejects.toThrow(/Only 2 unit/);
    await expect(service.cancelCounterSale(sale.id, "Wrong customer", user.id)).rejects.toThrow(/sale returns/);
  });

  it("cancels an unpaid bill, restoring stock and reopening the CPO", async () => {
    const [row] = await service.listOrders({ customerId: customer.id });
    const order = await service.getOrder(row.id);
    const sale = await service.createCounterSale(
      { branchId: cpd.id, customerId: customer.id, cashDiscountAmount: 0, lines: [{ orderLineId: order.lines[0].id, quantity: 2 }] },
      user.id,
    );
    expect(await stockOf(mirror.id)).toMatchObject({ quantity: 0, reservedQuantity: 0 });

    const cancelled = await service.cancelCounterSale(sale.id, "Customer cancelled", user.id);
    expect(cancelled.invoice).toMatchObject({ status: "Cancelled", cancelRemark: "Customer cancelled" });
    expect(await stockOf(mirror.id)).toMatchObject({ quantity: 2, reservedQuantity: 0 });
    const reopened = await service.getOrder(order.id);
    expect(reopened.lines[0]).toMatchObject({ billedQuantity: 1, pickedQuantity: 0 });
    expect(reopened.status).toBe("PARTLY_BILLED");
  });

  it("cancels the rest of a CPO and releases its picked stock", async () => {
    const [row] = await service.listOrders({ customerId: customer.id });
    await service.pickOrder(row.id);
    expect((await stockOf(mirror.id)).reservedQuantity).toBe(2);
    const order = await service.cancelOrder(row.id, "Customer bought elsewhere");
    expect(order.status).toBe("BILLED");
    expect(order.lines[0]).toMatchObject({ pickedQuantity: 0, billedQuantity: 1, cancelledQuantity: 4 });
    expect((await stockOf(mirror.id)).reservedQuantity).toBe(0);
    await expect(service.pickOrder(row.id)).rejects.toThrow(/can no longer change/);
  });
});

/**
 * Vendor MRN, correction and MRN return against the test database (TEST_DATABASE_URL).
 * Amounts reproduce legacy ABJ MRN 2025000002 (Blessed Sunny, 08/01/2025, form Z).
 */
import type { PrismaClient } from "@prisma/client";
import type { VendorReceiptService as ReceiptType } from "./vendorReceipt.service";
import type { VendorReturnService as ReturnType } from "./vendorReturn.service";

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

jest.setTimeout(120_000);

describeDb("Vendor MRNs and MRN returns (database)", () => {
  let prisma: PrismaClient;
  let receipts: ReceiptType;
  let returns: ReturnType;
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-8);

  beforeAll(() => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = require("../../prisma/client").default;
    receipts = new (require("./vendorReceipt.service").VendorReceiptService)();
    returns = new (require("./vendorReturn.service").VendorReturnService)();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("posts, corrects and returns a vendor MRN the legacy way", async () => {
    // Abuja rounds MRN totals (legacy control1.roundmrn = 1); its QS-style location follows it.
    const abj = await prisma.branch.create({ data: { name: `vr-abj-${run}`, roundMrnTotal: true } });
    const store = await prisma.branch.create({ data: { name: `vr-abj-store-${run}`, parentBranchId: abj.id } });
    const role = await prisma.role.upsert({ where: { name: "StoreOfficer" }, update: {}, create: { name: "StoreOfficer" } });
    const user = await prisma.user.create({
      data: { email: `vr.${run}@example.test`, firstName: "Store", lastName: "Officer", passwordHash: "x", roleId: role.id, branchId: abj.id },
    });
    const sunny = await prisma.customer.create({ data: { firstName: "Blessed", lastName: "Sunny", companyName: `BLESSED SUNNY ${run}`, type: "VENDOR", vendorType: "LOCAL", branchId: abj.id } });
    const seun = await prisma.customer.create({ data: { firstName: "Seun", lastName: "Nig", companyName: `SEUN NIGERIA ${run}`, type: "VENDOR", branchId: abj.id } });
    const cat = await prisma.partCategory.upsert({ where: { code: "L" }, update: {}, create: { code: "L", description: "Local", markupMultiplier: 1.5 } });
    const part = (no: string, flag: string, dealer: number) =>
      prisma.sparePart.create({ data: { partNumber: `${no}-${run}`, name: no, partFlag: flag, unitPrice: dealer, retailRate: dealer * 3.33, priceCategoryCode: flag === "L" ? cat.code : null } });
    // Mobis O parts at Finance's price, bought locally well below it; one local L record.
    const oil = await part("1884611070", "O", 23168);
    const pump = await part("253302E001", "O", 4000);
    const gasket = await part("273002E000", "O", 30000);
    const local = await part("58101L1A01", "L", 60000);

    // 1. Form Z, 7.5% VAT, rounded: ₦184,500 + ₦13,837.50 = ₦198,338 (round-off ₦0.50).
    const mrn = await receipts.createReceipt(
      {
        receivingBranchId: store.id,
        vendorId: sunny.id,
        invoiceNumber: `BS-${run}`,
        invoiceDate: new Date("2025-01-08"),
        taxForm: "Z",
        lines: [
          { partId: oil.id, quantity: 4, unitPrice: 8000 },
          { partId: pump.id, quantity: 1, unitPrice: 2500 },
          { partId: gasket.id, quantity: 4, unitPrice: 20000 },
          { partId: local.id, quantity: 1, unitPrice: 70000 },
        ],
      },
      user.id,
    );
    expect(mrn).toMatchObject({ taxForm: "Z", totalReceived: 10, totalValue: 184500, taxAmount: 13837.5, roundOff: 0.5, netAmount: 198338, conversionRate: 1 });

    // Mobis O parts keep Finance's price; the local L record takes the cost and retail x1.5.
    const after = async (id: string) => prisma.sparePart.findUniqueOrThrow({ where: { id }, select: { unitPrice: true, retailRate: true } });
    expect((await after(oil.id)).unitPrice).toBe(23168);
    expect(await after(local.id)).toEqual({ unitPrice: 70000, retailRate: 105000 });

    // The vendor's type sets the default form: LOCAL → Y (no VAT).
    const settings = await receipts.searchVendors(`BLESSED SUNNY ${run}`);
    expect(settings[0].defaultTaxForm).toBe("Y");

    // 2. The same invoice again needs a reason (e.g. delivered in two parts).
    const again = { receivingBranchId: store.id, vendorId: sunny.id, invoiceNumber: `bs-${run}`, invoiceDate: new Date(), lines: [{ partId: local.id, quantity: 1, unitPrice: 70000 }] };
    await expect(receipts.createReceipt(again, user.id)).rejects.toThrow("Give a reason to receive it again");
    const second = await receipts.createReceipt({ ...again, duplicateReason: "Second half of the delivery" }, user.id);
    expect(second).toMatchObject({ taxForm: "Y", taxAmount: 0, duplicateReason: "Second half of the delivery" });

    // 3. Correct the first MRN: one oil filter less, the pump removed, the gasket price fixed.
    const edited = await receipts.editReceipt(
      mrn.id,
      {
        reason: "Wrong quantity keyed",
        lines: [
          { partId: oil.id, quantity: 3, unitPrice: 8000 },
          { partId: gasket.id, quantity: 4, unitPrice: 19000 },
          { partId: local.id, quantity: 1, unitPrice: 70000 },
        ],
      },
      user.id,
    );
    // 24,000 + 76,000 + 70,000 = 170,000; VAT 12,750; no round-off needed.
    expect(edited).toMatchObject({ totalReceived: 8, totalValue: 170000, taxAmount: 12750, roundOff: 0, netAmount: 182750 });
    expect(edited.edits.map((e) => [e.field, e.partNumber?.split("-")[0], e.oldValue, e.newValue])).toEqual(
      expect.arrayContaining([
        ["quantity", "1884611070", "4", "3"],
        ["quantity", "253302E001", "1", "0"],
        ["price", "273002E000", "20000", "19000"],
      ]),
    );
    const stockOf = async (id: string) => (await prisma.inventoryStock.findUnique({ where: { branchId_partId: { branchId: store.id, partId: id } } }))?.quantity;
    expect([await stockOf(oil.id), await stockOf(pump.id)]).toEqual([3, 0]);

    // Units already used cannot come off: sell 2 of the 4 gaskets, then try to take 3 off.
    await prisma.inventoryStock.update({ where: { branchId_partId: { branchId: store.id, partId: gasket.id } }, data: { quantity: 2 } });
    await expect(
      receipts.editReceipt(mrn.id, { reason: "x", lines: [{ partId: oil.id, quantity: 3, unitPrice: 8000 }, { partId: gasket.id, quantity: 1, unitPrice: 19000 }, { partId: local.id, quantity: 1, unitPrice: 70000 }] }, user.id),
    ).rejects.toThrow("cannot come off this MRN");

    // 4. Return 2 oil filters to another vendor (legacy allowed it), at the MRN rate and VAT.
    const oilLine = edited.lines.find((l) => l.partId === oil.id)!;
    const ret = await returns.createReturn(mrn.id, { vendorId: seun.id, remarks: "Wrong part supplied", lines: [{ mrnLineId: oilLine.id, quantity: 2 }] }, user.id);
    expect(ret).toMatchObject({ taxForm: "Z", fullReturn: false, totalQuantity: 2, totalValue: 16000, taxAmount: 1200, netAmount: 17200, branchId: store.id, vendorId: seun.id });
    expect(await stockOf(oil.id)).toBe(1);
    const moves = await prisma.stockTransaction.findMany({ where: { referenceId: ret.id } });
    expect(moves.map((m) => [m.type, m.quantity])).toEqual([["VENDOR_RETURN", -2]]);

    // The MRN line now has 2 returned: no more than 1 can go back, and it cannot be cut below 2.
    await expect(returns.createReturn(mrn.id, { lines: [{ mrnLineId: oilLine.id, quantity: 2 }] }, user.id)).rejects.toThrow("only 1 can still be returned");
    await expect(
      receipts.editReceipt(mrn.id, { reason: "x", lines: [{ partId: oil.id, quantity: 1, unitPrice: 8000 }, { partId: gasket.id, quantity: 4, unitPrice: 19000 }, { partId: local.id, quantity: 1, unitPrice: 70000 }] }, user.id),
    ).rejects.toThrow("already went back");

    // 5. Full return of the second MRN.
    const full = await returns.createReturn(second.id, { fullReturn: true }, user.id);
    expect(full).toMatchObject({ fullReturn: true, totalQuantity: 1, netAmount: 70000, vendorId: sunny.id });
    await expect(returns.createReturn(second.id, { fullReturn: true }, user.id)).rejects.toThrow("already been returned");

    const listed = await returns.listReturns({ branchId: store.id });
    expect(listed.map((r) => r.returnNumber).sort()).toEqual([ret.returnNumber, full.returnNumber].sort());
  });
});

import {
  checkReceiptLines,
  defaultMrnTaxForm,
  diffReceiptLines,
  isMobisVendor,
  mrnLineVat,
  planReturn,
  receiptTotals,
  repricesOnReceipt,
  retailFromMultiplier,
} from "./vendorReceipt.logic";

describe("vendor receipt logic", () => {
  it("keeps Mobis invoices out of vendor receipts", () => {
    expect(isMobisVendor("MOBIS PARTS MIDDLE EAST")).toBe(true);
    expect(isMobisVendor("Hyundai Mobis")).toBe(true);
    expect(isMobisVendor("Midas Service Centre")).toBe(false);
    expect(isMobisVendor("Mobishop Ltd")).toBe(false);
  });

  it("checks lines and works out amounts in naira, rounded to kobo", () => {
    const lines = checkReceiptLines([
      { partId: "a", quantity: 2, unitPrice: 8000.004 },
      { partId: "b", quantity: 1, unitPrice: 1500 },
    ]);
    expect(lines.map((l) => [l.unitPrice, l.unitCost, l.amount])).toEqual([[8000, 8000, 16000], [1500, 1500, 1500]]);
    expect(receiptTotals(lines, false)).toEqual({ totalReceived: 3, totalValue: 17500, taxAmount: 0, roundOff: 0, netAmount: 17500 });
  });

  it("costs a foreign-currency invoice at the MRN's conversion rate (CPD Dongfeng, 2,700)", () => {
    // Legacy CPD MIT/MRN for China Dongfeng: FLY WHEEL BS3-1005010 at US$282.53, factor 2,700.
    const [line] = checkReceiptLines([{ partId: "a", quantity: 2, unitPrice: 282.53 }], 2700);
    expect([line.unitPrice, line.unitCost, line.amount]).toEqual([282.53, 762831, 1525662]);
    expect(() => checkReceiptLines([{ partId: "a", quantity: 1, unitPrice: 1 }], 0)).toThrow("conversion rate");
  });

  it("rejects duplicate parts, fractional or zero quantities and zero prices", () => {
    expect(() => checkReceiptLines([])).toThrow("at least one part");
    expect(() => checkReceiptLines([{ partId: "a", quantity: 1, unitPrice: 1 }, { partId: "a", quantity: 1, unitPrice: 1 }])).toThrow("only once");
    expect(() => checkReceiptLines([{ partId: "a", quantity: 1.5, unitPrice: 1 }])).toThrow("whole numbers");
    expect(() => checkReceiptLines([{ partId: "a", quantity: 1, unitPrice: 0 }])).toThrow("greater than zero");
  });

  it("defaults the tax form from the vendor type, as legacy MRNs did", () => {
    expect(defaultMrnTaxForm("IMP")).toBe("P");
    expect(defaultMrnTaxForm("LOCAL")).toBe("Y");
    expect(defaultMrnTaxForm(null)).toBe("Y");
  });

  it("reproduces ABJ MRN 2025000002: form Z, 7.5% VAT, rounded to the naira", () => {
    // Blessed Sunny, 08/01/2025: 1884611070 4 x 8,000; 253302E001 1 x 2,500; 273002E000 4 x 20,000; 58101L1A01 1 x 70,000.
    const lines = checkReceiptLines([
      { partId: "1884611070", quantity: 4, unitPrice: 8000 },
      { partId: "253302E001", quantity: 1, unitPrice: 2500 },
      { partId: "273002E000", quantity: 4, unitPrice: 20000 },
      { partId: "58101L1A01", quantity: 1, unitPrice: 70000 },
    ]).map((l) => ({ ...l, ...mrnLineVat("Z", true, l.amount, 7.5) }));
    expect(lines.map((l) => l.taxAmount)).toEqual([2400, 187.5, 6000, 5250]);
    expect(receiptTotals(lines, true)).toEqual({ totalReceived: 10, totalValue: 184500, taxAmount: 13837.5, roundOff: 0.5, netAmount: 198338 });
    // Kia Plaza does not round (legacy control1.roundmrn = 0).
    expect(receiptTotals(lines, false)).toMatchObject({ roundOff: 0, netAmount: 198337.5 });
  });

  it("charges VAT only under form Z and only on taxable parts", () => {
    expect(mrnLineVat("Y", true, 1000, 7.5)).toEqual({ vatPercent: 0, taxAmount: 0 });
    expect(mrnLineVat("P", true, 1000, 7.5)).toEqual({ vatPercent: 0, taxAmount: 0 });
    expect(mrnLineVat("X", true, 1000, 7.5)).toEqual({ vatPercent: 0, taxAmount: 0 });
    expect(mrnLineVat("Z", false, 1000, 7.5)).toEqual({ vatPercent: 0, taxAmount: 0 });
    expect(mrnLineVat("Z", true, 1000, 7.5)).toEqual({ vatPercent: 7.5, taxAmount: 75 });
  });

  it("re-prices branch-bought records only; Mobis records keep Finance's price", () => {
    expect(["L", "U", "R"].map(repricesOnReceipt)).toEqual([true, true, true]);
    expect(["O", "A", "F"].map(repricesOnReceipt)).toEqual([false, false, false]);
  });

  it("prices retail from the category multiplier, keeping the current retail when there is no category", () => {
    expect(retailFromMultiplier(8000, 1.5, 100)).toBe(12000);
    expect(retailFromMultiplier(333.33, 3.33, null)).toBe(1109.99);
    expect(retailFromMultiplier(8000, null, 9000)).toBe(9000);
  });

  it("works out what an MRN correction changes", () => {
    const existing = [
      { id: "l1", partId: "a", partNumber: "A", receivedQuantity: 3, unitPrice: 100, returnedQuantity: 0 },
      { id: "l2", partId: "b", partNumber: "B", receivedQuantity: 2, unitPrice: 50, returnedQuantity: 1 },
    ];
    const changes = diffReceiptLines(existing, [
      { partId: "a", quantity: 2, unitPrice: 100 },
      { partId: "b", quantity: 2, unitPrice: 60 },
      { partId: "c", quantity: 4, unitPrice: 10 },
    ]);
    expect(changes.map((c) => [c.partId, c.oldQuantity, c.newQuantity, c.newPrice, c.delta])).toEqual([
      ["a", 3, 2, 100, -1],
      ["b", 2, 2, 60, 0],
      ["c", 0, 4, 10, 4],
    ]);
    // B had 1 returned to the vendor: it cannot go below 1 or come off.
    expect(() => diffReceiptLines(existing, [{ partId: "a", quantity: 3, unitPrice: 100 }])).toThrow("already went back");
  });

  it("plans a return within what is left on each MRN line, or everything on a full return", () => {
    const lines = [
      { id: "l1", partId: "a", partNumber: "A", receivedQuantity: 4, returnedQuantity: 1, unitCost: 8000, vatPercent: 7.5 },
      { id: "l2", partId: "b", partNumber: "B", receivedQuantity: 1, returnedQuantity: 0, unitCost: 2500, vatPercent: 0 },
    ];
    expect(planReturn(lines, { lines: [{ mrnLineId: "l1", quantity: 2 }] })).toEqual([
      { mrnLineId: "l1", partId: "a", partNumber: "A", quantity: 2, unitCost: 8000, amount: 16000, vatPercent: 7.5, taxAmount: 1200 },
    ]);
    expect(planReturn(lines, { fullReturn: true }).map((l) => [l.partNumber, l.quantity])).toEqual([["A", 3], ["B", 1]]);
    expect(() => planReturn(lines, { lines: [{ mrnLineId: "l1", quantity: 4 }] })).toThrow("only 3 can still be returned");
    expect(() => planReturn(lines, { lines: [{ mrnLineId: "zz", quantity: 1 }] })).toThrow("not on this MRN");
    expect(() => planReturn(lines, { lines: [] })).toThrow("Enter a quantity");
  });
});

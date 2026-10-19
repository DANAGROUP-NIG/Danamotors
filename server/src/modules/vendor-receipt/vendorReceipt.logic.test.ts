import { checkReceiptLines, isMobisVendor, receiptTotals, retailFromMultiplier } from "./vendorReceipt.logic";

describe("vendor receipt logic", () => {
  it("keeps Mobis invoices out of vendor receipts", () => {
    expect(isMobisVendor("MOBIS PARTS MIDDLE EAST")).toBe(true);
    expect(isMobisVendor("Hyundai Mobis")).toBe(true);
    expect(isMobisVendor("Midas Service Centre")).toBe(false);
    expect(isMobisVendor("Mobishop Ltd")).toBe(false);
  });

  it("checks lines and works out amounts in naira, rounded to kobo", () => {
    const lines = checkReceiptLines([
      { partId: "a", quantity: 2, unitCost: 8000.004 },
      { partId: "b", quantity: 1, unitCost: 1500 },
    ]);
    expect(lines.map((l) => [l.unitCost, l.amount])).toEqual([[8000, 16000], [1500, 1500]]);
    expect(receiptTotals(lines)).toEqual({ totalReceived: 3, totalValue: 17500 });
  });

  it("rejects duplicate parts, fractional or zero quantities and zero costs", () => {
    expect(() => checkReceiptLines([])).toThrow("at least one part");
    expect(() => checkReceiptLines([{ partId: "a", quantity: 1, unitCost: 1 }, { partId: "a", quantity: 1, unitCost: 1 }])).toThrow("only once");
    expect(() => checkReceiptLines([{ partId: "a", quantity: 1.5, unitCost: 1 }])).toThrow("whole numbers");
    expect(() => checkReceiptLines([{ partId: "a", quantity: 1, unitCost: 0 }])).toThrow("greater than zero");
  });

  it("prices retail from the category multiplier, keeping the current retail when there is no category", () => {
    expect(retailFromMultiplier(8000, 1.5, 100)).toBe(12000);
    expect(retailFromMultiplier(333.33, 3.33, null)).toBe(1109.99);
    expect(retailFromMultiplier(8000, null, 9000)).toBe(9000);
  });
});

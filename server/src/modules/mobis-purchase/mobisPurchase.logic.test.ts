import { BadRequestError } from "../../shared/errors/appError";
import { cleanImportLines, importTotals, normalizePartNumber, unitCost } from "./mobisPurchase.logic";

// Lines from Mobis invoice A6EA0567A (MIT format).
const sample = [
  { orderNumber: "AV10K6Q01R", lineNumber: "0001", partNumber: "84710Q6020WK      ", partName: "CRASH PAD ASSY-MAIN   ", quantity: 1, unitPrice: 165.08, amount: 165.08, caseNumber: "SPD2APE00210        " },
  { orderNumber: "AV10K6Q01R", lineNumber: "0002", partNumber: "66311Q6000", partName: "PANEL-FENDER,LH", quantity: 1, unitPrice: 94.77, amount: 94.77, caseNumber: "SPD2APE00210" },
  { orderNumber: "AV10K6Q01R", lineNumber: "0003", partNumber: "66321Q6000", partName: "PANEL-FENDER,RH", quantity: 1, unitPrice: 94.77, amount: 94.77, caseNumber: "SPD2APE00210" },
  { orderNumber: "AV10K6Q01R", lineNumber: "0004", partNumber: "92101Q6060", partName: "LAMP ASSY-HEAD,LH", quantity: 1, unitPrice: 326.59, amount: 326.59, caseNumber: "SPD2APE00211" },
];

describe("cleanImportLines", () => {
  it("trims the padding Mobis files carry and keeps the line number", () => {
    const [first] = cleanImportLines(sample);
    expect(first).toMatchObject({
      partNumber: "84710Q6020WK",
      partName: "CRASH PAD ASSY-MAIN",
      caseNumber: "SPD2APE00210",
      lineNumber: 1,
      amount: 165.08,
    });
  });

  it("fills a missing amount from quantity x unit price", () => {
    const [line] = cleanImportLines([{ partNumber: "A1", quantity: 3, unitPrice: 10.5 }]);
    expect(line.amount).toBe(31.5);
  });

  it("rejects an amount that does not match quantity x unit price", () => {
    expect(() => cleanImportLines([{ partNumber: "A1", quantity: 2, unitPrice: 10, amount: 25 }])).toThrow(/does not equal/);
  });

  it("rejects bad quantities and missing part numbers, listing each problem", () => {
    expect(() =>
      cleanImportLines([
        { partNumber: " ", quantity: 1, unitPrice: 1 },
        { partNumber: "B2", quantity: 0, unitPrice: 1 },
      ]),
    ).toThrow(/2 problem/);
    expect(() => cleanImportLines([])).toThrow(BadRequestError);
  });
});

describe("importTotals", () => {
  it("counts quantity, amount and distinct cases", () => {
    expect(importTotals(cleanImportLines(sample))).toEqual({ totalQuantity: 4, totalAmount: 681.21, totalCases: 2 });
  });
});

describe("helpers", () => {
  it("normalises part numbers and converts prices at the conversion rate", () => {
    expect(normalizePartNumber("  66311q6000 ")).toBe("66311Q6000");
    expect(unitCost(165.08, 2700)).toBe(445716);
  });
});

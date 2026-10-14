import { adjustedStock, describeCriteria, discrepancy, groupCounts, inRange, mergeBins, mergeRemarks, summarise } from "./stockTake.logic";

describe("discrepancy", () => {
  it("is null until counted", () => {
    expect(discrepancy({ countedQuantity: null, damagedQuantity: 0, stockAtCount: null, systemStock: 5 })).toBeNull();
  });

  it("counts damaged stock as physical stock, as legacy QTY + DamageQty - CurrStock", () => {
    // Legacy 2024 annual count: 1881408062 counted 0 good + 17 damaged against 4 on the system.
    expect(discrepancy({ countedQuantity: 0, damagedQuantity: 17, stockAtCount: 4, systemStock: 4 })).toBe(13);
  });

  it("measures against stock when counted, not when the batch was created", () => {
    // Legacy 2024 annual count: 1864421058N counted 18 against 57.
    expect(discrepancy({ countedQuantity: 18, damagedQuantity: 0, stockAtCount: 57, systemStock: 60 })).toBe(-39);
    expect(discrepancy({ countedQuantity: 18, damagedQuantity: 0, stockAtCount: null, systemStock: 57 })).toBe(-39);
  });
});

describe("inRange", () => {
  it("is inclusive and ignores case", () => {
    expect(inRange("n-3d3", "N-3A1", "N-3D3")).toBe(true);
    expect(inRange("N-4A1", "N-3A1", "N-3Z9")).toBe(false);
  });

  it("leaves blank ends open", () => {
    expect(inRange("ZIZHIGONGJU211104", "0001217203", "")).toBe(true);
    expect(inRange("0001217202", "0001217203")).toBe(false);
    expect(inRange(null)).toBe(true);
  });
});

describe("mergeBins", () => {
  it("keeps every bin once, like legacy FinalBin", () => {
    expect(mergeBins("N-3D3", ["qsb", "N-3D3", " "])).toBe("N-3D3/QSB");
    expect(mergeBins(null, [])).toBeNull();
  });
});

describe("groupCounts", () => {
  it("adds up the same part scanned in several bins", () => {
    const [group, unknown] = groupCounts([
      { partNumber: "1864421058n", binLocation: "N-3D3", quantity: 30, remarks: "Box torn" },
      { partNumber: "1864421058N", binLocation: "QSB", quantity: 1, damagedQuantity: 2, remarks: "Box torn" },
      { partNumber: "263203A001", quantity: 30 },
    ]);
    expect(group).toMatchObject({ key: "1864421058N", quantity: 31, damagedQuantity: 2, bins: ["N-3D3", "QSB"], remarks: ["Box torn"] });
    expect(unknown.quantity).toBe(30);
  });

  it("refuses negative counts and entries without a part", () => {
    expect(() => groupCounts([{ partNumber: "X", quantity: -1 }])).toThrow("cannot be negative");
    expect(() => groupCounts([{ quantity: 1 }])).toThrow("needs a part");
  });
});

describe("mergeRemarks", () => {
  it("keeps earlier remarks first, each once", () => {
    expect(mergeRemarks("CHECKED", ["RECHECKED", "CHECKED"])).toBe("CHECKED; RECHECKED");
    expect(mergeRemarks(null, [])).toBeNull();
  });
});

describe("describeCriteria", () => {
  it("describes the sheet selection", () => {
    expect(describeCriteria({ basis: "BIN", from: "N-3A1", to: "N-3Z9" })).toBe("Bins N-3A1 to N-3Z9");
    expect(describeCriteria({ basis: "PART", from: "0001217203" })).toBe("Parts from 0001217203");
    expect(describeCriteria({})).toBe("All remaining parts");
    expect(describeCriteria({ picked: 4 })).toBe("4 part(s) picked by hand");
  });
});

describe("adjustedStock", () => {
  it("adds the discrepancy to today's stock", () => {
    expect(adjustedStock({ quantity: 50, reservedQuantity: 2 }, -39)).toEqual({ quantity: 11 });
  });

  it("refuses to go below zero or below reserved stock", () => {
    expect(adjustedStock({ quantity: 10, reservedQuantity: 0 }, -39).problem).toMatch("fall to -29");
    expect(adjustedStock({ quantity: 40, reservedQuantity: 5 }, -39).problem).toMatch("5 unit(s) are reserved");
  });
});

describe("summarise", () => {
  const base = { damagedQuantity: 0, notRequired: false, onOpenSheet: false, stockAtCount: null, rate: 100 };

  it("totals counts and values shortage and excess at dealer rate", () => {
    const s = summarise([
      { ...base, partId: "a", countedQuantity: 18, systemStock: 57 },
      { ...base, partId: "b", countedQuantity: 30, systemStock: 0, rate: 0 },
      { ...base, partId: "c", countedQuantity: 0, damagedQuantity: 17, systemStock: 4, rate: 6746.21 },
      { ...base, partId: "d", countedQuantity: 5, systemStock: 5 },
      { ...base, partId: "e", countedQuantity: null, systemStock: 3, onOpenSheet: true },
      { ...base, partId: null, countedQuantity: 2, systemStock: 0 },
      { ...base, partId: null, countedQuantity: 1, systemStock: 0, notRequired: true },
    ]);
    expect(s).toMatchObject({
      lines: 7,
      counted: 4,
      uncounted: 1,
      onOpenSheets: 1,
      unknown: 1,
      physicalQuantity: 53,
      damagedQuantity: 17,
      discrepancies: 3,
      excessQuantity: 43,
      excessValue: 87700.73,
      shortageQuantity: 39,
      shortageValue: 3900,
    });
  });
});

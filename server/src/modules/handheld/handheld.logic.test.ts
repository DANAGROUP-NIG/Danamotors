import { HandheldDocumentType, HandheldShortReason } from "@prisma/client";
import { planUpload } from "./handheld.logic";

const { INDENT_PICK, CPO_PICK, MIT_RECEIVE } = HandheldDocumentType;

// Legacy BI 2026000009 on the device: 8659028000 x10 and a second line x1.
const pick = [
  { id: "a", lineNumber: 1, partNumber: "8659028000", expectedQuantity: 10 },
  { id: "b", lineNumber: 2, partNumber: "86591D4000", expectedQuantity: 1 },
];

// Legacy MIT 2026000005, case SPD2APD00183.
const mit = [
  { id: "m1", lineNumber: 1, partNumber: "98360F2500", expectedQuantity: 1 },
  { id: "m2", lineNumber: 2, partNumber: "97701Q6300", expectedQuantity: 2 },
];

describe("planUpload: picking", () => {
  it("accepts a full pick with nothing to release", () => {
    const plan = planUpload(INDENT_PICK, pick, [
      { lineId: "a", quantity: 10 },
      { lineId: "b", quantity: 1 },
    ]);
    expect(plan.lines.map((l) => [l.quantity, l.short, l.shortReason])).toEqual([[10, 0, null], [1, 0, null]]);
    expect(plan.totals).toMatchObject({ expected: 11, quantity: 11, short: 0, unreported: 0 });
  });

  it("releases a short pick and keeps its reason", () => {
    const plan = planUpload(CPO_PICK, pick, [
      { lineId: "a", quantity: 7, shortReason: HandheldShortReason.LESS_IN_BIN },
      { lineId: "b", quantity: 1 },
    ]);
    expect(plan.lines[0]).toMatchObject({ quantity: 7, short: 3, shortReason: "LESS_IN_BIN" });
    expect(plan.totals.short).toBe(3);
  });

  it("refuses a short line without a reason", () => {
    expect(() => planUpload(INDENT_PICK, pick, [{ lineId: "a", quantity: 9 }])).toThrow(/reason for picking 9 of 10/);
  });

  it("refuses picking more than reserved (legacy hard limit)", () => {
    expect(() => planUpload(INDENT_PICK, pick, [{ lineId: "a", quantity: 11 }])).toThrow(/11 picked but only 10 reserved/);
  });

  it("counts a line never saved on the device as not picked", () => {
    const plan = planUpload(INDENT_PICK, pick, [{ lineId: "a", quantity: 10 }]);
    expect(plan.lines[1]).toMatchObject({ quantity: 0, short: 1, shortReason: "NOT_FOUND" });
    expect(plan.totals.unreported).toBe(1);
  });

  it("keeps a substitute scan as a note without counting it", () => {
    // Legacy 2025: 503103E101 ordered, 503103E102 picked.
    const plan = planUpload(INDENT_PICK, pick, [
      { lineId: "a", quantity: 0, shortReason: HandheldShortReason.OTHER, scannedPartNumber: " 503103E102 " },
      { lineId: "b", quantity: 1 },
    ]);
    expect(plan.lines[0]).toMatchObject({ quantity: 0, short: 10, scannedPartNumber: "503103E102" });
  });

  it("refuses damaged quantities and extra parts on a pick", () => {
    expect(() => planUpload(INDENT_PICK, pick, [{ lineId: "a", quantity: 10, damagedQuantity: 1 }])).toThrow(/only when receiving/);
    expect(() => planUpload(CPO_PICK, pick, [{ lineId: "a", quantity: 10 }], [{ partNumber: "X", quantity: 1 }])).toThrow(/Only an MIT/);
  });

  it("refuses unknown and repeated lines and an empty upload", () => {
    expect(() => planUpload(INDENT_PICK, pick, [{ lineId: "z", quantity: 1 }])).toThrow(/not on this document/);
    expect(() => planUpload(INDENT_PICK, pick, [{ lineId: "a", quantity: 10 }, { lineId: "a", quantity: 10 }])).toThrow(/more than once/);
    expect(() => planUpload(INDENT_PICK, pick, [])).toThrow(/Nothing was recorded/);
  });
});

describe("planUpload: MIT receiving", () => {
  it("records received and damaged and leaves an unreached line unverified", () => {
    const plan = planUpload(MIT_RECEIVE, mit, [{ lineId: "m2", quantity: 1, damagedQuantity: 1 }]);
    expect(plan.lines.map((l) => [l.quantity, l.damagedQuantity, l.short])).toEqual([[null, 0, 0], [1, 1, 0]]);
    expect(plan.totals).toMatchObject({ quantity: 1, damaged: 1, unreported: 1 });
  });

  it("refuses more than the invoice quantity, as the MRN does", () => {
    expect(() => planUpload(MIT_RECEIVE, mit, [{ lineId: "m1", quantity: 1, damagedQuantity: 1 }])).toThrow(/2 received but the invoice has 1/);
  });

  it("keeps parts not on the MIT as extras (legacy newpart)", () => {
    const plan = planUpload(MIT_RECEIVE, mit, [{ lineId: "m1", quantity: 1 }], [{ partNumber: " 96621P2600 ", quantity: 1, note: "case 183" }]);
    expect(plan.extras).toEqual([{ partNumber: "96621P2600", quantity: 1, note: "case 183" }]);
  });

  it("refuses an extra part with no quantity", () => {
    expect(() => planUpload(MIT_RECEIVE, mit, [], [{ partNumber: "X", quantity: 0 }])).toThrow(/above zero/);
  });
});

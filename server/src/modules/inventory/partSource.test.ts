import { requireSourceRate, resolveSource, sourceRate } from "./partSource";
import { reviewApprovedScope } from "../service/estimate-approval";

const part = {
  partNumber: "58101A6A00",
  partFlag: "O",
  retailRate: 41400,
  sourcePrices: [
    { source: "L", retailRate: 18000 },
    { source: "U", retailRate: 9000 },
  ],
};

describe("part source pricing", () => {
  it("prices the part's own source from its retail rate and other sources from their own price", () => {
    expect(sourceRate(part, undefined)).toBe(41400);
    expect(sourceRate(part, "O")).toBe(41400);
    expect(sourceRate(part, "L")).toBe(18000);
    expect(sourceRate(part, "U")).toBe(9000);
    expect(sourceRate(part, "R")).toBeNull();
  });

  it("defaults a missing source to the part flag", () => {
    expect(resolveSource(part, null)).toBe("O");
    expect(resolveSource({ partFlag: "L" }, undefined)).toBe("L");
    expect(resolveSource(part, "R")).toBe("R");
  });

  it("names the source and part when no price is set", () => {
    expect(() => requireSourceRate(part, "R")).toThrow("Repaired price is not set for 58101A6A00");
    expect(() => requireSourceRate({ ...part, retailRate: null }, "O")).toThrow("Mobis (original part) price is not set");
  });

  it("treats the same part from another source as different approved scope", () => {
    const estimate = {
      id: "e1",
      status: "Approved",
      currency: "NGN",
      amount: 9000,
      approvals: [{ approved: true, customerId: "c1" }],
      lines: [{ type: "PART", referenceId: "p1", partSource: "U", description: "Brake pad", quantity: 1, rate: 9000, amount: 9000 }],
    };
    const used = reviewApprovedScope(estimate, [{ type: "PART", referenceId: "p1", partSource: "U", description: "Brake pad", quantity: 1, rate: 9000, amount: 9000 }], "c1");
    expect(used.canBill).toBe(true);
    const mobis = reviewApprovedScope(estimate, [{ type: "PART", referenceId: "p1", partSource: "O", description: "Brake pad", quantity: 1, rate: 41400, amount: 41400 }], "c1");
    expect(mobis.canBill).toBe(false);
    expect(mobis.issues.join(" ")).toContain("Not in approved scope");
  });
});

import { defaultSourceCategory, indentProblem, sourceLabel, sourcePartNumber, sourceRecordProblem } from "./partSource";
import { reviewApprovedScope } from "../service/estimate-approval";

const main = { partNumber: "546512S000", partFlag: "O", sourceOfPartId: null, role: "MAIN" };

describe("part source records", () => {
  it("labels every source code and passes unknown codes through", () => {
    expect(sourceLabel("O")).toBe("Mobis (original part)");
    expect(sourceLabel("U")).toBe("Second-hand / used");
    expect(sourceLabel("R")).toBe("Repaired");
    expect(sourceLabel("Z")).toBe("Z");
  });

  it("suggests the main part number with the source code", () => {
    expect(sourcePartNumber(" 54651 ", "U")).toBe("54651-U");
  });

  it("prices local, used and repaired records like legacy local parts (category L) and others like the main part", () => {
    expect(defaultSourceCategory("L", "C")).toBe("L");
    expect(defaultSourceCategory("U", "C")).toBe("L");
    expect(defaultSourceCategory("R", null)).toBe("L");
    expect(defaultSourceCategory("A", "C")).toBe("C");
  });

  it("allows one record per source, never the main part's own source, and only one level deep", () => {
    expect(sourceRecordProblem(main, "U")).toBeNull();
    expect(sourceRecordProblem(main, "O")).toContain("already a Mobis (original part) part");
    expect(sourceRecordProblem(main, "U", ["L", "U"])).toContain("already has a Second-hand / used record");
    expect(sourceRecordProblem({ ...main, partNumber: "546512S000-U", partFlag: "U", sourceOfPartId: "m1" }, "R")).toContain(
      "itself a source record",
    );
    expect(sourceRecordProblem({ ...main, role: "ALTERNATE" }, "U")).toContain("alternate part");
  });

  it("keeps local, used and repaired records off CPD indents", () => {
    expect(indentProblem(main)).toBeNull();
    expect(indentProblem({ ...main, partFlag: "A" })).toBeNull();
    expect(indentProblem({ ...main, partFlag: "L" })).toContain("bought by the branch");
    expect(indentProblem({ partNumber: "546512S000-A", partFlag: "A", sourceOfPartId: "m1" })).toContain("cannot be indented");
  });

  it("treats each source record as its own approved scope", () => {
    const estimate = {
      id: "e1",
      status: "Approved",
      currency: "NGN",
      amount: 9000,
      approvals: [{ approved: true, customerId: "c1" }],
      lines: [{ type: "PART", referenceId: "used-record", partSource: "U", description: "Shock absorber", quantity: 1, rate: 9000, amount: 9000 }],
    };
    const used = reviewApprovedScope(estimate, [{ type: "PART", referenceId: "used-record", description: "Shock absorber", quantity: 1, rate: 9000, amount: 9000 }], "c1");
    expect(used.canBill).toBe(true);
    const mobis = reviewApprovedScope(estimate, [{ type: "PART", referenceId: "mobis-record", description: "Shock absorber", quantity: 1, rate: 41400, amount: 41400 }], "c1");
    expect(mobis.canBill).toBe(false);
    expect(mobis.issues.join(" ")).toContain("Not in approved scope");
  });
});

import { WarrantyCoverageStatus } from "@prisma/client";
import {
  checkPayer,
  decisionProblems,
  decisionsBody,
  decisionSummary,
  outsideRecordBody,
  PAYER_CHARGE,
  REASON_REQUIRED,
  reasonNeeded,
  recordDateProblem,
  serviceRuleBody,
  type DecisionItem,
  type PayerContext,
} from "./job-warranty.logic";

const irregular = { kind: "IRREGULAR" as const, missedCount: 1, years: [2], where: [{ year: 2, period: 2 }] };
const item = (payer: DecisionItem["payer"], id = "i1"): DecisionItem => ({ id, label: "AC compressor", kind: "PART", payer });
const ctx = (overrides: Partial<PayerContext> = {}): PayerContext => ({
  kind: "PART",
  label: "AC compressor",
  coverageAtCreation: WarrantyCoverageStatus.ACTIVE,
  hasWarrantyCase: false,
  partWarrantyApplicable: true,
  linkedCampaignIds: [],
  canChargeGoodwill: true,
  ...overrides,
});

describe("decisionProblems", () => {
  it("needs a payer on every item and names how many are left", () => {
    expect(decisionProblems({ items: [item("CUSTOMER"), item(null, "i2"), item(null, "i3")], verdict: { kind: "REGULAR" }, reason: null })).toEqual([
      "Choose who pays for every item (2 of 3 not decided yet).",
    ]);
  });

  it("needs a reason when the history is irregular and an item is warranty or goodwill", () => {
    expect(decisionProblems({ items: [item("WARRANTY")], verdict: irregular, reason: null })).toEqual([REASON_REQUIRED]);
    expect(decisionProblems({ items: [item("GOODWILL")], verdict: irregular, reason: "  " })).toEqual([REASON_REQUIRED]);
    expect(decisionProblems({ items: [item("WARRANTY")], verdict: irregular, reason: "Missed service is not related to the AC" })).toEqual([]);
  });

  it("needs no reason for a regular history, missing data, or only customer pay and campaign items", () => {
    expect(decisionProblems({ items: [item("WARRANTY")], verdict: { kind: "REGULAR" }, reason: null })).toEqual([]);
    expect(decisionProblems({ items: [item("WARRANTY")], verdict: { kind: "INSUFFICIENT_DATA", missing: ["NO_SALE_DATE"] }, reason: null })).toEqual([]);
    expect(decisionProblems({ items: [item("CUSTOMER"), item("CAMPAIGN", "i2")], verdict: irregular, reason: null })).toEqual([]);
    expect(reasonNeeded(irregular, [item("CUSTOMER")])).toBe(false);
  });

  it("lets a job with no diagnosed items through", () => {
    expect(decisionProblems({ items: [], verdict: irregular, reason: null })).toEqual([]);
  });
});

describe("checkPayer (job card line rules)", () => {
  it("allows customer pay always", () => {
    expect(checkPayer("CUSTOMER", null, ctx({ coverageAtCreation: null }))).toEqual({ ok: true, campaignId: null });
  });

  it("allows warranty on a covered vehicle and a warranty-applicable part", () => {
    expect(checkPayer("WARRANTY", null, ctx())).toEqual({ ok: true, campaignId: null });
    expect(checkPayer("WARRANTY", null, ctx({ kind: "LABOUR", partWarrantyApplicable: null }))).toEqual({ ok: true, campaignId: null });
  });

  it("refuses warranty on a part that cannot be claimed, naming the item", () => {
    expect(checkPayer("WARRANTY", null, ctx({ partWarrantyApplicable: false }))).toEqual({
      ok: false,
      problem: "AC compressor: This part is not warranty-applicable, so it cannot be charged to warranty.",
    });
  });

  it("refuses warranty on a vehicle not covered at opening unless a warranty case exists", () => {
    const refused = checkPayer("WARRANTY", null, ctx({ coverageAtCreation: WarrantyCoverageStatus.EXPIRED_DATE }));
    expect(refused).toMatchObject({ ok: false });
    expect(refused.ok ? "" : refused.problem).toContain("A warranty officer must open a warranty case first, or charge goodwill.");
    expect(checkPayer("WARRANTY", null, ctx({ coverageAtCreation: WarrantyCoverageStatus.EXPIRED_DATE, hasWarrantyCase: true }))).toMatchObject({ ok: true });
  });

  it("needs the goodwill permission for goodwill", () => {
    expect(checkPayer("GOODWILL", null, ctx({ canChargeGoodwill: false }))).toMatchObject({ ok: false });
    expect(checkPayer("GOODWILL", null, ctx({ coverageAtCreation: null }))).toEqual({ ok: true, campaignId: null });
  });

  it("charges a campaign item to the linked campaign", () => {
    expect(checkPayer("CAMPAIGN", null, ctx({ linkedCampaignIds: ["c1"] }))).toEqual({ ok: true, campaignId: "c1" });
    expect(checkPayer("CAMPAIGN", null, ctx())).toEqual({
      ok: false,
      problem: "AC compressor: Free lines must be charged to a campaign, and this job card has no linked campaign.",
    });
    expect(checkPayer("CAMPAIGN", null, ctx({ linkedCampaignIds: ["c1", "c2"] }))).toMatchObject({ ok: false, problem: "AC compressor: Choose which campaign pays for this free line." });
    expect(checkPayer("CAMPAIGN", "c2", ctx({ linkedCampaignIds: ["c1", "c2"] }))).toEqual({ ok: true, campaignId: "c2" });
  });

  it("maps a campaign decision to a free line", () => {
    expect(PAYER_CHARGE).toEqual({ WARRANTY: "WARRANTY", GOODWILL: "GOODWILL", CAMPAIGN: "FREE", CUSTOMER: "CUSTOMER" });
  });
});

describe("decisionSummary", () => {
  it("counts each payer in a fixed order", () => {
    expect(decisionSummary([item("CUSTOMER"), item("WARRANTY"), item("WARRANTY"), item("CUSTOMER"), item("GOODWILL")])).toBe(
      "2 items warranty, 1 item goodwill, 2 items customer pay.",
    );
    expect(decisionSummary([])).toBe("No diagnosed items to decide.");
  });
});

describe("validation", () => {
  it("names the field and the fix for a bad decision", () => {
    const result = decisionsBody.safeParse({ items: [{ itemId: "x", payer: "MAYBE" }] });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.map((issue) => issue.message)).toEqual(["Reload the page and try again", "Choose Warranty, Goodwill, Campaign or Customer pay"]);
  });

  it("requires the outside record's date, km, dealer and photo", () => {
    const result = outsideRecordBody.safeParse({ requestId: "11111111-1111-4111-8111-111111111111", serviceDate: "", mileage: -1, dealerName: "", image: "" });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(Object.fromEntries(result.error.issues.map((issue) => [issue.path.join("."), issue.message]))).toEqual({
        serviceDate: "Enter the service date",
        mileage: "Enter a km reading of 0 or more",
        dealerName: "Enter the dealer that did the service",
        image: "Add a photo of the stamped service book page",
      });
  });

  it("checks the service date against today and the sale", () => {
    expect(recordDateProblem("2026-02-30", "2026-11-26", null)).toBe("Enter the service date");
    expect(recordDateProblem("2026-11-27", "2026-11-26", null)).toBe("The service date cannot be in the future");
    expect(recordDateProblem("2024-01-01", "2026-11-26", "2024-03-14")).toBe("The service date is before the vehicle was sold");
    expect(recordDateProblem("2026-11-26", "2026-11-26", "2024-03-14")).toBeNull();
  });

  it("accepts only services per year that split the year into whole months", () => {
    const base = { serviceIntervalMonths: 3, serviceIntervalKm: 5000, serviceGraceKm: 0, serviceGraceDays: 0 };
    expect(serviceRuleBody.safeParse({ ...base, servicesPerYear: 4 }).success).toBe(true);
    const five = serviceRuleBody.safeParse({ ...base, servicesPerYear: 5 });
    expect(five.success ? null : five.error.issues[0].message).toBe("Choose 1, 2, 3, 4, 6 or 12 services per year");
  });
});

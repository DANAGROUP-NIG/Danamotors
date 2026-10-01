import { WarrantyCaseStatus } from "@prisma/client";
import {
  CASE_TRANSITIONS,
  CaseState,
  WarrantyCaseAction,
  allowedActions,
  assertMileage,
  computeCoverage,
  lagosDayNumber,
  lineAmounts,
  planTransition,
} from "./warranty.logic";

const policy = { warrantyDays: 1825, warrantyKm: 100_000, warrantyCovered: true };
// Noon Lagos time, so the calendar date is unambiguous.
const d = (iso: string) => new Date(`${iso}T11:00:00Z`);
const today = d("2026-09-30");

describe("computeCoverage", () => {
  it("is ACTIVE inside both limits and reports what is left", () => {
    const c = computeCoverage({ startDate: d("2023-03-12"), policy, override: null, mileage: 61_580, today });
    expect(c.status).toBe("ACTIVE");
    expect(c.reasons).toEqual([]);
    expect(c.source).toBe("MODEL");
    expect(c.startDate).toBe("2023-03-12");
    expect(c.expiresOn).toBe("2028-03-10"); // 12/03/2023 + 1,825 days (the span includes 29/02/2024 and 29/02/2028)
    expect(c.remainingKm).toBe(38_420);
    expect(c.remainingDays).toBe(lagosDayNumber(d("2028-03-10")) - lagosDayNumber(today));
    expect(c.kmUsedPercent).toBe(62);
  });

  it("expires on the date limit", () => {
    const c = computeCoverage({ startDate: d("2021-01-01"), policy, override: null, mileage: 40_000, today });
    expect(c.status).toBe("EXPIRED_DATE");
    expect(c.reasons).toEqual(["DATE_LIMIT_PASSED"]);
    expect(c.remainingDays).toBe(0);
  });

  it("expires on the km limit", () => {
    const c = computeCoverage({ startDate: d("2025-06-15"), policy, override: null, mileage: 103_250, today });
    expect(c.status).toBe("EXPIRED_MILEAGE");
    expect(c.reasons).toEqual(["KM_LIMIT_PASSED"]);
    expect(c.remainingKm).toBe(0);
  });

  it("reports EXPIRED_DATE and both reasons when both limits have passed", () => {
    const c = computeCoverage({ startDate: d("2019-01-01"), policy, override: null, mileage: 150_000, today });
    expect(c.status).toBe("EXPIRED_DATE");
    expect(c.reasons).toEqual(["DATE_LIMIT_PASSED", "KM_LIMIT_PASSED"]);
  });

  it("is still covered on the last day and at exactly the km limit", () => {
    const start = d("2021-10-01");
    const lastDay = new Date(start.getTime() + 1825 * 86_400_000);
    const c = computeCoverage({ startDate: start, policy, override: null, mileage: 100_000, today: lastDay });
    expect(c.status).toBe("ACTIVE");
    expect(c.remainingDays).toBe(0);
    const dayAfter = new Date(lastDay.getTime() + 86_400_000);
    expect(computeCoverage({ startDate: start, policy, override: null, mileage: 100_000, today: dayAfter }).status).toBe("EXPIRED_DATE");
    expect(computeCoverage({ startDate: start, policy, override: null, mileage: 100_001, today: lastDay }).status).toBe("EXPIRED_MILEAGE");
  });

  it("uses the Lagos calendar date, not UTC", () => {
    // 23:30 UTC on 10 March 2028 is 00:30 on 11 March in Lagos: one day past expiry.
    const c = computeCoverage({ startDate: d("2023-03-12"), policy, override: null, mileage: 1, today: new Date("2028-03-10T23:30:00Z") });
    expect(c.status).toBe("EXPIRED_DATE");
  });

  it("is UNKNOWN without a start date — never covered", () => {
    const c = computeCoverage({ startDate: null, policy, override: null, mileage: 20_000, today });
    expect(c.status).toBe("UNKNOWN");
    expect(c.reasons).toEqual(["NO_START_DATE"]);
  });

  it("is UNKNOWN without mileage", () => {
    const c = computeCoverage({ startDate: d("2025-01-01"), policy, override: null, mileage: null, today });
    expect(c.status).toBe("UNKNOWN");
    expect(c.reasons).toEqual(["NO_MILEAGE"]);
  });

  it("prefers a known expiry over missing data", () => {
    expect(computeCoverage({ startDate: null, policy, override: null, mileage: 120_000, today }).status).toBe("EXPIRED_MILEAGE");
    expect(computeCoverage({ startDate: d("2015-01-01"), policy, override: null, mileage: null, today }).status).toBe("EXPIRED_DATE");
  });

  it("is UNKNOWN without a model policy", () => {
    const c = computeCoverage({ startDate: d("2025-01-01"), policy: null, override: null, mileage: 10, today });
    expect(c).toMatchObject({ status: "UNKNOWN", reasons: ["NO_MODEL_POLICY"] });
  });

  it("is UNKNOWN when the policy has no limits at all", () => {
    const c = computeCoverage({
      startDate: d("2025-01-01"),
      policy: { warrantyDays: null, warrantyKm: null, warrantyCovered: true },
      override: null,
      mileage: 10,
      today,
    });
    expect(c).toMatchObject({ status: "UNKNOWN", reasons: ["NO_POLICY_LIMITS"] });
  });

  it("is NOT_COVERED for a model flagged not covered", () => {
    const c = computeCoverage({ startDate: d("2025-01-01"), policy: { ...policy, warrantyCovered: false }, override: null, mileage: 10, today });
    expect(c).toMatchObject({ status: "NOT_COVERED", reasons: ["MODEL_NOT_COVERED"] });
  });

  it("is UNKNOWN when the start date is in the future", () => {
    const c = computeCoverage({ startDate: d("2027-01-01"), policy, override: null, mileage: 10, today });
    expect(c.status).toBe("UNKNOWN");
    expect(c.reasons).toContain("START_DATE_IN_FUTURE");
  });

  it("applies an extended warranty's date and km limits", () => {
    const override = { type: "EXTENDED" as const, until: d("2030-12-31"), km: 150_000 };
    const c = computeCoverage({ startDate: d("2019-01-01"), policy, override, mileage: 120_000, today });
    expect(c).toMatchObject({ status: "ACTIVE", source: "EXTENDED", expiresOn: "2030-12-31", kmLimit: 150_000, remainingKm: 30_000 });
  });

  it("an extended warranty keeps the model km limit when it only extends the date", () => {
    const override = { type: "EXTENDED" as const, until: d("2030-12-31"), km: null };
    const c = computeCoverage({ startDate: d("2019-01-01"), policy, override, mileage: 120_000, today });
    expect(c.status).toBe("EXPIRED_MILEAGE");
  });

  it("an extended warranty covers a model that is not normally covered", () => {
    const override = { type: "EXTENDED" as const, until: d("2028-01-01"), km: 80_000 };
    const c = computeCoverage({ startDate: d("2024-01-01"), policy: { ...policy, warrantyCovered: false }, override, mileage: 10_000, today });
    expect(c.status).toBe("ACTIVE");
  });

  it("goodwill covers until its date regardless of the policy", () => {
    const override = { type: "GOODWILL" as const, until: d("2026-12-31"), km: null };
    const c = computeCoverage({ startDate: d("2015-01-01"), policy, override, mileage: 250_000, today });
    expect(c).toMatchObject({ status: "ACTIVE", source: "GOODWILL", expiresOn: "2026-12-31" });
  });

  it("expired goodwill falls back to the model policy", () => {
    const override = { type: "GOODWILL" as const, until: d("2026-01-31"), km: null };
    const c = computeCoverage({ startDate: d("2015-01-01"), policy, override, mileage: 250_000, today });
    expect(c.status).toBe("EXPIRED_DATE");
    expect(c.source).toBe("MODEL");
  });
});

describe("assertMileage", () => {
  it("accepts an increasing reading", () => expect(() => assertMileage(61_580, 58_210)).not.toThrow());
  it("accepts the first reading", () => expect(() => assertMileage(10, null)).not.toThrow());
  it("rejects a lower reading", () => expect(() => assertMileage(50_000, 58_210)).toThrow(/lower than the last recorded/));
  it("accepts a lower reading after an odometer replacement", () => expect(() => assertMileage(5, 58_210, true)).not.toThrow());
  it("rejects negative and fractional readings", () => {
    expect(() => assertMileage(-1, null)).toThrow();
    expect(() => assertMileage(10.5, null)).toThrow();
  });
});

describe("warranty case transitions", () => {
  const readyLines: CaseState["lines"] = [
    { id: "l1", kind: "PART", role: "CAUSAL", defectCodeId: "d1", claimedAmount: 48_500, approvalPercent: 100, partWarrantyApplicable: true },
    { id: "l2", kind: "PART", role: "CONSEQUENTIAL", defectCodeId: "d2", claimedAmount: 115_800, approvalPercent: 100, partWarrantyApplicable: true },
    { id: "l3", kind: "LABOUR", role: null, defectCodeId: null, claimedAmount: 22_500, approvalPercent: 100, partWarrantyApplicable: null },
  ];
  const state = (status: WarrantyCaseStatus, lines = readyLines): CaseState => ({ status, complaintCodeId: "c1", complaint: null, lines });

  const allStatuses = Object.values(WarrantyCaseStatus);
  const allActions = Object.keys(CASE_TRANSITIONS) as WarrantyCaseAction[];

  it.each(allActions.flatMap((a) => allStatuses.map((s) => [a, s] as const)))(
    "%s from %s is allowed only when listed",
    (action, status) => {
      const allowed = CASE_TRANSITIONS[action].from.includes(status);
      const input = { remarks: "because", rejectReasonId: "r1", settlementRef: "CN-1", lineApprovals: [{ lineId: "l2", approvalPercent: 60 }] };
      if (allowed) expect(planTransition(state(status), action, input).to).toBe(CASE_TRANSITIONS[action].to);
      else expect(() => planTransition(state(status), action, input)).toThrow(/cannot be/);
    },
  );

  it("follows the documented lifecycle", () => {
    expect(allowedActions("OPEN")).toEqual(["START_REVIEW", "CLOSE"]);
    expect(allowedActions("SUBMITTED")).toEqual(["APPROVE", "PARTIALLY_APPROVE", "REJECT", "RETURN"]);
    expect(allowedActions("RETURNED")).toEqual(["RESUME", "CLOSE"]);
    expect(allowedActions("CLOSED")).toEqual([]);
  });

  it("submit needs lines, a causal part, defect codes and a complaint", () => {
    expect(() => planTransition(state("IN_REVIEW", []), "SUBMIT", {})).toThrow(/at least one claim line/);
    expect(() => planTransition(state("IN_REVIEW", readyLines.filter((l) => l.role !== "CAUSAL")), "SUBMIT", {})).toThrow(/causal part/);
    expect(() =>
      planTransition(state("IN_REVIEW", [{ ...readyLines[0], defectCodeId: null }]), "SUBMIT", {}),
    ).toThrow(/defect code/);
    expect(() =>
      planTransition(state("IN_REVIEW", [{ ...readyLines[0], partWarrantyApplicable: false }]), "SUBMIT", {}),
    ).toThrow(/not warranty-applicable/);
    expect(() => planTransition({ ...state("IN_REVIEW"), complaintCodeId: null }, "SUBMIT", {})).toThrow(/complaint/);
  });

  it("approve sets every line to 100%", () => {
    const r = planTransition(state("SUBMITTED"), "APPROVE", {});
    expect([...r.approvals!.values()]).toEqual([100, 100, 100]);
  });

  it("partial approval needs a line below 100% and something approved", () => {
    const r = planTransition(state("SUBMITTED"), "PARTIALLY_APPROVE", { lineApprovals: [{ lineId: "l2", approvalPercent: 60 }] });
    expect(r.approvals!.get("l2")).toBe(60);
    expect(r.approvals!.get("l1")).toBe(100);
    expect(() => planTransition(state("SUBMITTED"), "PARTIALLY_APPROVE", { lineApprovals: [] })).toThrow(/below 100%/);
    expect(() =>
      planTransition(state("SUBMITTED"), "PARTIALLY_APPROVE", {
        lineApprovals: readyLines.map((l) => ({ lineId: l.id, approvalPercent: 0 })),
      }),
    ).toThrow(/Nothing is approved/);
    expect(() =>
      planTransition(state("SUBMITTED"), "PARTIALLY_APPROVE", { lineApprovals: [{ lineId: "l1", approvalPercent: 120 }] }),
    ).toThrow(/between 0 and 100/);
    expect(() =>
      planTransition(state("SUBMITTED"), "PARTIALLY_APPROVE", { lineApprovals: [{ lineId: "other", approvalPercent: 50 }] }),
    ).toThrow(/does not belong/);
  });

  it("reject needs a reason code and zeroes approvals", () => {
    expect(() => planTransition(state("SUBMITTED"), "REJECT", {})).toThrow(/reject reason/);
    const r = planTransition(state("SUBMITTED"), "REJECT", { rejectReasonId: "r1" });
    expect([...r.approvals!.values()]).toEqual([0, 0, 0]);
  });

  it("return needs remarks; settle needs a reference; withdrawing needs a reason", () => {
    expect(() => planTransition(state("SUBMITTED"), "RETURN", { remarks: " " })).toThrow(/corrected/);
    expect(() => planTransition(state("APPROVED"), "SETTLE", {})).toThrow(/settlement reference/);
    expect(() => planTransition(state("OPEN"), "CLOSE", {})).toThrow(/reason/);
    expect(planTransition(state("SETTLED"), "CLOSE", {}).to).toBe("CLOSED");
  });
});

describe("lineAmounts", () => {
  it("computes claimed and approved amounts in kobo precision", () => {
    expect(lineAmounts(1, 115_800, 60)).toEqual({ claimedAmount: 115_800, approvedAmount: 69_480 });
    expect(lineAmounts(1.5, 15_000, 100)).toEqual({ claimedAmount: 22_500, approvedAmount: 22_500 });
    expect(lineAmounts(3, 0.1, 33.33)).toEqual({ claimedAmount: 0.3, approvedAmount: 0.1 });
    expect(lineAmounts(2, 10, null)).toEqual({ claimedAmount: 20, approvedAmount: null });
  });
});

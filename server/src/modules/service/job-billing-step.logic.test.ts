import {
  chargeGroup,
  deliveryPaymentProblem,
  estimatedVsActual,
  formatNaira,
  paymentStatus,
  readyNoticeBody,
  storageCounter,
  storageDecision,
  storageStart,
  washedBody,
} from "./job-billing-step.logic";

const settings = { freeHours: 48, dailyRate: "2000" };
// 27 Nov 2026, 15:10 in Lagos (UTC+1).
const notified = new Date("2026-11-27T14:10:00.000Z");
const at = (iso: string) => new Date(iso);

describe("storageCounter (terms clause 3)", () => {
  it("is null until the customer is told the vehicle is ready", () => {
    expect(storageCounter(null, settings, at("2026-12-10T00:00:00Z"))).toBeNull();
  });

  it("is free for 48 hours from the first notice", () => {
    const counter = storageCounter(notified, settings, at("2026-11-29T14:09:59.999Z"))!;
    expect(counter.freeUntil.toISOString()).toBe("2026-11-29T14:10:00.000Z");
    expect(counter.days).toBe(0);
    expect(counter.proposedAmount).toBe("0.00");
  });

  it("charges nothing at the exact end of the free period or for a part day after it", () => {
    expect(storageCounter(notified, settings, at("2026-11-29T14:10:00.000Z"))!.days).toBe(0);
    expect(storageCounter(notified, settings, at("2026-11-30T14:09:59.999Z"))!.days).toBe(0);
  });

  it("proposes ₦2,000.00 per whole day after the free period", () => {
    const one = storageCounter(notified, settings, at("2026-11-30T14:10:00.000Z"))!;
    expect(one.days).toBe(1);
    expect(one.proposedAmount).toBe("2000.00");
    const three = storageCounter(notified, settings, at("2026-12-02T20:00:00.000Z"))!;
    expect(three.days).toBe(3);
    expect(three.proposedAmount).toBe("6000.00");
  });

  it("uses the branch hours and rate, in kobo", () => {
    const counter = storageCounter(notified, { freeHours: 24, dailyRate: "1500.50" }, at("2026-11-30T14:10:00.000Z"))!;
    expect(counter.days).toBe(2);
    expect(counter.proposedAmount).toBe("3001.00");
    expect(counter.dailyRate).toBe("1500.50");
  });

  it("counts elapsed hours, so a notice late in the Lagos evening across midnight UTC gives the same answer", () => {
    // 23:30 Lagos on 27 Nov is 22:30 UTC; free until 23:30 Lagos on 29 Nov.
    const late = at("2026-11-27T22:30:00.000Z");
    const counter = storageCounter(late, settings, at("2026-11-30T22:29:00.000Z"))!;
    expect(counter.freeUntil.toISOString()).toBe("2026-11-29T22:30:00.000Z");
    expect(counter.days).toBe(0);
    expect(storageCounter(late, settings, at("2026-11-30T22:30:00.000Z"))!.days).toBe(1);
  });
});

describe("storageStart", () => {
  it("uses the latest first notice of the jobs on one bill, and nothing when one was never notified", () => {
    expect(storageStart([at("2026-11-27T10:00:00Z"), at("2026-11-28T10:00:00Z")])!.toISOString()).toBe("2026-11-28T10:00:00.000Z");
    expect(storageStart([at("2026-11-27T10:00:00Z"), null])).toBeNull();
    expect(storageStart([])).toBeNull();
  });
});

describe("estimatedVsActual", () => {
  it("groups parts, oil, labour and service charge with a total and signed differences", () => {
    const rows = estimatedVsActual(
      [
        { group: "PARTS", amount: "57000" },
        { group: "OIL", amount: 38000 },
        { group: "LABOUR", amount: "40000.00" },
        { group: "SERVICE_CHARGE", amount: 6500 },
      ],
      [
        { group: "PARTS", amount: 57000 },
        { group: "PARTS", amount: 8500 },
        { group: "OIL", amount: 38000 },
        { group: "LABOUR", amount: 40000 },
        { group: "SERVICE_CHARGE", amount: 6500 },
      ],
    );
    expect(rows).toEqual([
      { group: "PARTS", estimated: "57000.00", actual: "65500.00", difference: "8500.00" },
      { group: "OIL", estimated: "38000.00", actual: "38000.00", difference: "0.00" },
      { group: "LABOUR", estimated: "40000.00", actual: "40000.00", difference: "0.00" },
      { group: "SERVICE_CHARGE", estimated: "6500.00", actual: "6500.00", difference: "0.00" },
      { group: "TOTAL", estimated: "141500.00", actual: "150000.00", difference: "8500.00" },
    ]);
  });

  it("adds money exactly (no float drift) and shows less than estimated as negative", () => {
    const rows = estimatedVsActual(
      [{ group: "PARTS", amount: 0.1 }, { group: "PARTS", amount: 0.2 }],
      [{ group: "PARTS", amount: 0.1 }],
    );
    expect(rows[0]).toEqual({ group: "PARTS", estimated: "0.30", actual: "0.10", difference: "-0.20" });
  });

  it("gives every row at zero when nothing was estimated or charged", () => {
    const rows = estimatedVsActual([], []);
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.estimated === "0.00" && row.actual === "0.00" && row.difference === "0.00")).toBe(true);
  });
});

describe("chargeGroup", () => {
  it("puts oil (part type O) in Oil, labour in Labour and any service line in Service charge", () => {
    expect(chargeGroup("PART", "O")).toBe("OIL");
    expect(chargeGroup("PART", "o")).toBe("OIL");
    expect(chargeGroup("PART", "S")).toBe("PARTS");
    expect(chargeGroup("PART", "A")).toBe("PARTS");
    expect(chargeGroup("PART", null)).toBe("PARTS");
    expect(chargeGroup("INCLUDED_PART", "O")).toBe("OIL");
    expect(chargeGroup("LABOUR")).toBe("LABOUR");
    expect(chargeGroup("SERVICE")).toBe("SERVICE_CHARGE");
  });
});

describe("deliveryPaymentProblem (payment before delivery)", () => {
  const base = { billed: true, balanceDue: "48350", creditApproved: false, nothingToPay: false };
  it("blocks an unpaid bill and names the balance with ₦", () => {
    expect(deliveryPaymentProblem(base)).toBe("Balance of ₦48,350.00 not yet paid.");
  });
  it("lets a paid bill through", () => {
    expect(deliveryPaymentProblem({ ...base, balanceDue: 0 })).toBeNull();
  });
  it("lets credit-approved jobs through unpaid, billed or not", () => {
    expect(deliveryPaymentProblem({ ...base, creditApproved: true })).toBeNull();
    expect(deliveryPaymentProblem({ billed: false, balanceDue: null, creditApproved: true, nothingToPay: false })).toBeNull();
  });
  it("lets a job with nothing to pay through without a bill", () => {
    expect(deliveryPaymentProblem({ billed: false, balanceDue: null, creditApproved: false, nothingToPay: true })).toBeNull();
  });
  it("asks for the invoice when there is a charge and no bill", () => {
    expect(deliveryPaymentProblem({ billed: false, balanceDue: null, creditApproved: false, nothingToPay: false })).toBe(
      "Create the invoice before sending the job to delivery.",
    );
  });
});

describe("paymentStatus", () => {
  it("follows the bill's balance", () => {
    expect(paymentStatus(null, false)).toBe("NOT_INVOICED");
    expect(paymentStatus(null, true)).toBe("NOTHING_TO_PAY");
    expect(paymentStatus({ total: "148350", balanceDue: "148350" }, false)).toBe("UNPAID");
    expect(paymentStatus({ total: "148350", balanceDue: "48350" }, false)).toBe("PART_PAID");
    expect(paymentStatus({ total: "148350", balanceDue: 0 }, false)).toBe("PAID");
    // An advance alone leaves the bill unpaid, as on the design (advance ₦100,000.00, balance ₦48,350.00, Unpaid).
    expect(paymentStatus({ total: "148350", balanceDue: "48350", advancePaid: "100000" }, false)).toBe("UNPAID");
    expect(paymentStatus({ total: "148350", balanceDue: "20000", advancePaid: "100000" }, false)).toBe("PART_PAID");
  });
});

describe("formatNaira", () => {
  it("uses the naira sign and two decimals", () => {
    expect(formatNaira("2000")).toBe("₦2,000.00");
    expect(formatNaira(0.005)).toBe("₦0.01");
  });
});

describe("input rules", () => {
  const requestId = "6f1f8a52-3d43-4c5e-9a39-1e7d2b0c9a11";
  it("needs a channel, names the fix, and trims the note", () => {
    const missing = readyNoticeBody.safeParse({ requestId });
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0].message).toBe("Choose how you told the customer: phone call or SMS");
    expect(readyNoticeBody.parse({ requestId, channel: "SMS", note: "  Told them  " }).note).toBe("Told them");
    expect(readyNoticeBody.safeParse({ requestId, channel: "EMAIL" }).success).toBe(false);
    expect(readyNoticeBody.safeParse({ requestId: "x", channel: "SMS" }).error?.issues[0].message).toBe("Reload the page and try again");
    expect(readyNoticeBody.safeParse({ requestId, channel: "SMS", note: "x".repeat(501) }).error?.issues[0].message).toBe(
      "Keep the note to 500 characters or fewer",
    );
  });

  it("needs a reason to remove the storage charge", () => {
    expect(storageDecision.safeParse({ decision: "ACCEPT" }).success).toBe(true);
    expect(storageDecision.safeParse({ decision: "REMOVE", reason: " " }).error?.issues[0].message).toBe(
      "Give the reason for removing the storage charge",
    );
    expect(storageDecision.safeParse({ decision: "REMOVE", reason: "Customer was abroad, agreed by manager" }).success).toBe(true);
    expect(storageDecision.safeParse({ decision: "MAYBE" }).success).toBe(false);
  });

  it("needs a true or false washed tick", () => {
    expect(washedBody.safeParse({ washed: "yes" }).error?.issues[0].message).toBe("Tick or clear Vehicle washed");
    expect(washedBody.parse({ washed: true }).washed).toBe(true);
  });
});

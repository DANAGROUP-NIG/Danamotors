import { readFileSync } from "fs";
import { join } from "path";
import {
  advanceRequirement,
  approveBody,
  estimateContentHashV2,
  estimateOutcome,
  estimateTotals,
  estimationCharge,
  exemptionBody,
  normalisePhone,
  phoneApprovalBody,
  resolveDecisions,
  saveDraftBody,
  suggestedAdvance,
  waiverDecisionBody,
  waiverRequestBody,
  withDecisions,
  type HashLine,
  type TotalsLine,
} from "./job-estimate.logic";
import { signatureState, stagedContentHash } from "./estimate-signature";

type Fixture = { name: string; vatRate: string; lines: (TotalsLine & { amount: string })[]; expected: ReturnType<typeof estimateTotals>; advance: { percent: string; amount: string } };
const fixtures: { cases: Fixture[] } = JSON.parse(readFileSync(join(__dirname, "estimate-totals.fixtures.json"), "utf8"));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("estimate totals (shared fixtures with the client)", () => {
  it.each(fixtures.cases.map((row) => [row.name, row] as const))("%s", (_name, row) => {
    expect(estimateTotals(row.lines, row.vatRate)).toEqual(row.expected);
    const payable = row.lines.some((line) => "customerDecision" in line) ? row.expected.approvedTotal : row.expected.customerTotal;
    expect(suggestedAdvance(payable, row.advance.percent)).toBe(row.advance.amount);
  });

  it("refuses an advance percentage outside 0 to 100", () => {
    expect(() => suggestedAdvance("100", "100.01")).toThrow("between 0 and 100");
    expect(() => suggestedAdvance("100", -1)).toThrow("between 0 and 100");
  });
});

describe("customer decisions", () => {
  const lines = [
    { id: id(1), description: "Oil filter", payer: "CUSTOMER" as const },
    { id: id(2), description: "Air filter", payer: "CUSTOMER" as const },
    { id: id(3), description: "AC compressor", payer: "WARRANTY" as const },
  ];

  it("needs an answer for every customer-pay line and none for other payers", () => {
    const result = resolveDecisions(lines, [{ lineId: id(1), decision: "APPROVED" }]);
    expect(result.problems).toEqual([{ lineId: id(2), message: "Choose Approve or Decline for Air filter." }]);
    const warranty = resolveDecisions(lines, [
      { lineId: id(1), decision: "APPROVED" },
      { lineId: id(2), decision: "DECLINED" },
      { lineId: id(3), decision: "DECLINED" },
    ]);
    expect(warranty.problems[0].message).toBe("AC compressor is not paid by the customer, so it has no approve or decline choice.");
  });

  it("refuses unknown and repeated answers, naming the line", () => {
    const result = resolveDecisions(lines, [
      { lineId: id(1), decision: "APPROVED" },
      { lineId: id(1), decision: "DECLINED" },
      { lineId: id(2), decision: "APPROVED" },
      { lineId: id(9), decision: "APPROVED" },
    ]);
    expect(result.problems.map((problem) => problem.message)).toEqual([
      "Oil filter was answered twice. Choose Approve or Decline once.",
      "An item is no longer on this estimate. Reload the estimate and try again.",
    ]);
  });

  it("returns the decision per line, null for other payers", () => {
    const result = resolveDecisions(lines, [
      { lineId: id(1), decision: "APPROVED" },
      { lineId: id(2), decision: "DECLINED" },
    ]);
    expect(result.problems).toEqual([]);
    expect([...result.decisions.entries()]).toEqual([
      [id(1), "APPROVED"],
      [id(2), "DECLINED"],
      [id(3), null],
    ]);
  });

  it("calls it all declined only when nothing at all will be done", () => {
    expect(estimateOutcome([{ payer: "CUSTOMER", customerDecision: "APPROVED" }])).toBe("APPROVED");
    expect(estimateOutcome([{ payer: "WARRANTY", customerDecision: null }])).toBe("APPROVED");
    expect(
      estimateOutcome([
        { payer: "CUSTOMER", customerDecision: "DECLINED" },
        { payer: "CUSTOMER", customerDecision: "APPROVED" },
      ]),
    ).toBe("PARTIAL");
    // Warranty work still goes ahead, so this is a partial approval and no estimation charge.
    expect(
      estimateOutcome([
        { payer: "CUSTOMER", customerDecision: "DECLINED" },
        { payer: "WARRANTY", customerDecision: null },
      ]),
    ).toBe("PARTIAL");
    expect(estimateOutcome([{ payer: "CUSTOMER", customerDecision: "DECLINED" }])).toBe("ALL_DECLINED");
  });
});

describe("signed content hash (version 2)", () => {
  const base: HashLine[] = [
    { type: "PART", referenceId: id(10), description: "Oil filter", quantity: "1.00", rate: "6500.00", amount: "6500.00", payer: "CUSTOMER", customerDecision: null },
    { type: "PART", referenceId: id(11), description: "Air filter", quantity: "1", rate: "12000", amount: "12000", payer: "CUSTOMER", customerDecision: null },
    { type: "LABOUR", referenceId: id(12), description: "AC compressor labour", quantity: 1, rate: 30000, amount: 30000, payer: "WARRANTY", customerDecision: null },
  ];
  const estimate = { version: 1, currency: "NGN", vatRate: "7.5", upfrontPaymentPercent: "60", lines: base };
  const hash = estimateContentHashV2(estimate);

  it("is stable across number formats and line order", () => {
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(estimateContentHashV2({ ...estimate, vatRate: 7.5, upfrontPaymentPercent: 60, lines: [...base].reverse() })).toBe(hash);
  });

  it("changes with a decision, a payer, a price, the VAT rate or the advance percentage", () => {
    const declined = withDecisions(
      base.map((line, index) => ({ ...line, id: id(index + 1) })),
      new Map([[id(2), "DECLINED" as const]]),
    );
    expect(estimateContentHashV2({ ...estimate, lines: declined })).not.toBe(hash);
    expect(estimateContentHashV2({ ...estimate, lines: base.map((line, index) => (index === 2 ? { ...line, payer: "CUSTOMER" as const } : line)) })).not.toBe(hash);
    expect(estimateContentHashV2({ ...estimate, lines: base.map((line, index) => (index === 0 ? { ...line, amount: "6500.01" } : line)) })).not.toBe(hash);
    expect(estimateContentHashV2({ ...estimate, vatRate: "8" })).not.toBe(hash);
    expect(estimateContentHashV2({ ...estimate, upfrontPaymentPercent: "30" })).not.toBe(hash);
  });

  it("verifies a version 2 signature only while the signed content and total are unchanged", () => {
    const signed = { ...estimate, amount: 48500, lines: base.map((line) => ({ ...line, customerDecision: line.payer === "CUSTOMER" ? ("APPROVED" as const) : null })) };
    const contentHash = stagedContentHash(signed);
    const signature = { estimateVersion: 1, totalSigned: "19887.50", contentHash, hashVersion: 2 };
    expect(signatureState(signed, { signatureRequired: true, signature })).toBe("valid");
    expect(signatureState(signed, { signatureRequired: true, signature: { ...signature, totalSigned: "19887.49" } })).toBe("invalid");
    const changed = { ...signed, lines: signed.lines.map((line, index) => (index === 1 ? { ...line, customerDecision: "DECLINED" as const } : line)) };
    expect(signatureState(changed, { signatureRequired: true, signature })).toBe("invalid");
  });

  it("treats a phone approval as pending a signature while the content matches", () => {
    const decided = { ...estimate, amount: 48500, lines: base.map((line) => ({ ...line, customerDecision: line.payer === "CUSTOMER" ? ("APPROVED" as const) : null })) };
    const approval = { signatureRequired: true, channel: "PHONE", contentHash: stagedContentHash(decided) };
    expect(signatureState(decided, approval)).toBe("phone");
    expect(signatureState({ ...decided, vatRate: "10" }, approval)).toBe("invalid");
  });
});

describe("estimation charge (terms clause 4)", () => {
  const settings = { minimum: "25000", percent: "10" };
  it("is the larger of the minimum and the percentage of the customer total", () => {
    expect(estimationCharge("152112.50", settings)).toBe("25000.00");
    expect(estimationCharge("250000.00", settings)).toBe("25000.00");
    expect(estimationCharge("250000.10", settings)).toBe("25000.01");
    expect(estimationCharge("1000000.00", settings)).toBe("100000.00");
    expect(estimationCharge("0", settings)).toBe("25000.00");
  });
  it("follows the branch settings", () => {
    expect(estimationCharge("300000", { minimum: "0", percent: "12.5" })).toBe("37500.00");
    expect(estimationCharge("300000", { minimum: "50000", percent: "0" })).toBe("50000.00");
  });
});

describe("advance before work", () => {
  it("is needed when the customer has something to pay", () => {
    expect(advanceRequirement({ approvedTotal: "139212.50", approvedPayers: ["CUSTOMER", "WARRANTY"], recorded: null })).toEqual({ required: true });
  });
  it("is not needed for warranty or goodwill only work", () => {
    expect(advanceRequirement({ approvedTotal: "0.00", approvedPayers: ["WARRANTY", "GOODWILL"], recorded: null })).toEqual({
      required: false,
      exemption: "WARRANTY_ONLY",
      reason: "Warranty covers all approved work. The customer has nothing to pay.",
      automatic: true,
    });
  });
  it("names a campaign when a campaign pays", () => {
    expect(advanceRequirement({ approvedTotal: "0", approvedPayers: ["CAMPAIGN", "WARRANTY"], recorded: null })).toMatchObject({ required: false, exemption: "CAMPAIGN" });
  });
  it("is not needed when the approved work costs the customer nothing, such as a free service", () => {
    expect(advanceRequirement({ approvedTotal: "0.00", approvedPayers: ["CUSTOMER"], recorded: null, freeService: true })).toEqual({
      required: false,
      exemption: "FREE_SERVICE",
      reason: "Free service: the company pays the service charge. The customer has nothing to pay.",
      automatic: true,
    });
  });
  it("is needed while nothing is approved yet", () => {
    expect(advanceRequirement({ approvedTotal: "0", approvedPayers: [], recorded: null })).toEqual({ required: true });
  });
  it("follows a recorded exemption with its reason", () => {
    expect(
      advanceRequirement({ approvedTotal: "50000", approvedPayers: ["CUSTOMER"], recorded: { exemption: "CREDIT_APPROVED", reason: "Fleet account on 30-day credit" } }),
    ).toEqual({ required: false, exemption: "CREDIT_APPROVED", reason: "Fleet account on 30-day credit", automatic: false });
  });
});

describe("input rules", () => {
  const draft = { estimateId: id(1), updatedAt: new Date().toISOString(), upfrontPaymentPercent: 60, lines: [{ type: "PART", referenceId: id(2), quantity: 1, payer: "CUSTOMER" }] };

  it("accepts a draft and names each mistake", () => {
    expect(saveDraftBody.safeParse(draft).success).toBe(true);
    const errors = (value: unknown) => {
      const result = saveDraftBody.safeParse(value);
      return result.success ? [] : result.error.issues.map((issue) => issue.message);
    };
    expect(errors({ ...draft, lines: [] })).toEqual(["Add at least one line to the estimate"]);
    expect(errors({ ...draft, upfrontPaymentPercent: 101 })).toEqual(["The advance percentage must be between 0 and 100"]);
    expect(errors({ ...draft, lines: [{ ...draft.lines[0], quantity: 0 }] })).toEqual(["Quantity must be more than 0"]);
    expect(errors({ ...draft, lines: [{ ...draft.lines[0], quantity: 1.005 }] })).toEqual(["Use at most 2 decimal places for the quantity"]);
  });

  const approval = {
    estimateId: id(1),
    expectedHash: "a".repeat(64),
    decisions: [{ lineId: id(2), decision: "APPROVED" }],
    signer: "OWNER",
    signerName: "Adaeze Okafor",
    signatureImage: "data:image/png;base64,AAAA",
    consentAccepted: true,
    requestId: id(3),
  };
  it("needs the representative's phone number", () => {
    expect(approveBody.safeParse(approval).success).toBe(true);
    const result = approveBody.safeParse({ ...approval, signer: "REPRESENTATIVE", signerName: "Emeka Okafor" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]).toMatchObject({ path: ["signerPhone"], message: "Enter the representative's phone number" });
    expect(approveBody.safeParse({ ...approval, signer: "REPRESENTATIVE", signerPhone: "0803 555 0142" }).success).toBe(true);
    expect(approveBody.safeParse({ ...approval, consentAccepted: false }).success).toBe(false);
  });

  it("checks the phone approval fields", () => {
    const phone = { estimateId: id(1), expectedHash: "b".repeat(64), approverName: "Adaeze Okafor", approverPhone: "08035550142", approvedAt: "2026-11-25T10:36:00+01:00", approvedLineIds: [id(2)], requestId: id(4) };
    expect(phoneApprovalBody.safeParse(phone).success).toBe(true);
    const bad = phoneApprovalBody.safeParse({ ...phone, approverPhone: "12345", approverName: " " });
    expect(bad.success).toBe(false);
    if (!bad.success)
      expect(bad.error.issues.map((issue) => issue.message).sort()).toEqual(["Enter a Nigerian mobile number, for example 0803 555 0142", "Enter who approved on the phone"]);
  });

  it("needs a reason for a waiver, and a note to decline one", () => {
    expect(waiverRequestBody.safeParse({ reason: "Long-standing fleet customer", requestId: id(5) }).success).toBe(true);
    expect(waiverRequestBody.safeParse({ reason: "ok", requestId: id(5) }).success).toBe(false);
    expect(waiverDecisionBody.safeParse({ approve: true, requestId: id(5) }).success).toBe(true);
    const decline = waiverDecisionBody.safeParse({ approve: false, requestId: id(5) });
    expect(decline.success).toBe(false);
    if (!decline.success) expect(decline.error.issues[0].message).toBe("Write why the waiver is declined (at least 5 characters)");
  });

  it("needs a reason with a manual exemption", () => {
    expect(exemptionBody.safeParse({ exemption: null }).success).toBe(true);
    expect(exemptionBody.safeParse({ exemption: "INTERNAL", reason: "Company pool car" }).success).toBe(true);
    expect(exemptionBody.safeParse({ exemption: "WARRANTY_ONLY", reason: "Not manual" }).success).toBe(false);
    expect(exemptionBody.safeParse({ exemption: "INTERNAL" }).success).toBe(false);
  });

  it("stores phone numbers in one form", () => {
    expect(normalisePhone("0803 555 0142")).toBe("08035550142");
    expect(normalisePhone("+234 803 555 0142")).toBe("08035550142");
  });
});

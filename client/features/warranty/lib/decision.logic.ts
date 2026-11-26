// Pure helpers for recording the manufacturer's decision. Money is handled in kobo
// (integers) so totals never drift; the server repeats every check with decimals.

export type Decision = "APPROVE" | "PARTIALLY_APPROVE" | "REJECT";

export type DecisionLine = { id: string; claimedAmount: number; approvedAmount: number | null };

export type DecisionRow = {
  lineId: string;
  claimedAmount: number;
  /** The approved amount for the line, as typed from the Kia portal. */
  approvedAmount: number;
  /** Derived for display, two decimals. */
  approvalPercent: number;
  /** Field-level problem, or null when the row is valid. */
  error: string | null;
};

const kobo = (value: number) => Math.round(value * 100);
const naira = (value: number) => value / 100;

/** Parses a typed amount such as "69,480.50". Empty or invalid input returns null. */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, "").replace(/^₦/, "");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** Starting value of each amount field: the earlier decision, or the claimed amount. */
export function initialAmounts(lines: DecisionLine[]): Record<string, string> {
  return Object.fromEntries(lines.map((l) => [l.id, (l.approvedAmount ?? l.claimedAmount).toFixed(2)]));
}

export function decisionRows(lines: DecisionLine[], decision: Decision, amounts: Record<string, string>): DecisionRow[] {
  return lines.map((line, index) => {
    const claimed = kobo(line.claimedAmount);
    let approved: number;
    let error: string | null = null;
    if (decision === "APPROVE") approved = claimed;
    else if (decision === "REJECT") approved = 0;
    else {
      const parsed = parseAmount(amounts[line.id] ?? "");
      if (parsed == null) {
        error = `Line ${index + 1}: enter the approved amount in naira, for example 69480.50`;
        approved = 0;
      } else if (kobo(parsed) > claimed) {
        error = `Line ${index + 1}: the approved amount cannot be more than the claimed amount`;
        approved = kobo(parsed);
      } else approved = kobo(parsed);
    }
    const percent = claimed === 0 ? 100 : Math.round((approved / claimed) * 10_000) / 100;
    return { lineId: line.id, claimedAmount: naira(claimed), approvedAmount: naira(approved), approvalPercent: percent, error };
  });
}

export type DecisionSummary = {
  claimedTotal: number;
  approvedTotal: number;
  approvedPercent: number;
  /** Problem with the decision as a whole (partial approvals only). */
  error: string | null;
};

export function summarizeDecision(rows: DecisionRow[], decision: Decision): DecisionSummary {
  const claimed = rows.reduce((s, r) => s + kobo(r.claimedAmount), 0);
  const approved = rows.reduce((s, r) => s + kobo(r.approvedAmount), 0);
  let error: string | null = null;
  if (decision === "PARTIALLY_APPROVE" && rows.every((r) => !r.error)) {
    if (!rows.some((r) => kobo(r.approvedAmount) < kobo(r.claimedAmount))) {
      error = "Every line is approved in full. Choose Approved instead.";
    } else if (approved === 0) {
      error = "Nothing is approved. Choose Rejected instead.";
    }
  }
  return {
    claimedTotal: naira(claimed),
    approvedTotal: naira(approved),
    approvedPercent: claimed === 0 ? 0 : Math.round((approved / claimed) * 1000) / 10,
    error,
  };
}

/** Request body lines for a partial approval: the exact amounts from the portal. */
export function lineApprovalsPayload(rows: DecisionRow[]) {
  return rows.map((r) => ({ lineId: r.lineId, approvedAmount: r.approvedAmount }));
}

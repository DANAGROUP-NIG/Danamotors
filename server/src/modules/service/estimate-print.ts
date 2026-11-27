import {
  approvedCustomerTotal,
  signatureState,
  type SignedContent,
  type SignatureEvidence,
} from "./estimate-signature";
import { upfrontAmount } from "./estimate-advance";
import { estimateTotals } from "./job-estimate.logic";

const num = (value: number | { toString(): string }) => Number(String(value));
type PrintEstimate = SignedContent & {
  id: string;
  estimateNumber: string | null;
  estimateDate: Date | null;
  createdAt: Date;
  description: string;
  customerRemarks?: string | null;
  status: string;
  successor: { version: number } | null;
  approvals: {
    approved: boolean | null;
    signatureRequired: boolean;
    overrideReason: string | null;
    channel?: string;
    approverName?: string | null;
    approverPhone?: string | null;
    approvedAt?: Date | null;
    signatureDueAtDelivery?: boolean;
    contentHash?: string | null;
    signature:
      | (SignatureEvidence & {
          consentStatement?: string | null;
          imageReference: string;
          signerName: string;
          signedAt: Date;
          relationship: string | null;
        })
      | null;
  }[];
};
/** Explicit customer-facing projection: never serialize the repository object into a print response. */
export function projectEstimatePrint(
  estimate: PrintEstimate,
  codes: Map<string, string>,
) {
  const approval =
    estimate.approvals.find((a) => a.signature) ?? estimate.approvals[0];
  const state = approval ? signatureState(estimate, approval) : null;
  const signature = approval?.signature;
  const lines = estimate.lines.map((line) => ({ ...line, payer: line.payer ?? "CUSTOMER", customerDecision: line.customerDecision ?? null }));
  const totals = estimateTotals(
    lines.map((line) => ({ payer: line.payer, amount: String(line.amount), customerDecision: line.customerDecision })),
    String(estimate.vatRate ?? 7.5),
  );
  return {
    id: estimate.id,
    version: estimate.version ?? 1,
    estimateNumber: estimate.estimateNumber,
    estimateDate: estimate.estimateDate ?? estimate.createdAt,
    currency: estimate.currency ?? "NGN",
    total: num(estimate.amount),
    vatRate: num(estimate.vatRate ?? 7.5),
    totals: {
      customerSubtotal: Number(totals.customerSubtotal),
      vat: Number(totals.vat),
      customerTotal: Number(totals.customerTotal),
      otherPayerTotal: Number(totals.otherPayerTotal),
      approvedTotal: Number(totals.approvedTotal),
    },
    supersededBy: estimate.successor?.version ?? null,
    customerRemarks: estimate.customerRemarks ?? null,
    upfrontPaymentPercent: Number(estimate.upfrontPaymentPercent ?? 60),
    upfrontAmount: upfrontAmount(
      Number(approvedCustomerTotal(estimate)),
      Number(String(estimate.upfrontPaymentPercent ?? 60)),
    ),
    lines: lines
      .filter((line) => line.type !== "COMPLAINT")
      .map((line) => ({
        type: line.type.replace("INCLUDED_", ""),
        code: codes.get(line.referenceId ?? "") ?? "",
        description: line.description,
        quantity: num(line.quantity),
        rate: num(line.rate),
        amount: num(line.amount),
        payer: line.payer,
        customerDecision: line.customerDecision,
      })),
    phoneApproval:
      approval?.channel === "PHONE"
        ? { approverName: approval.approverName ?? null, approverPhone: approval.approverPhone ?? null, approvedAt: approval.approvedAt ?? null, signatureDueAtDelivery: !!approval.signatureDueAtDelivery }
        : null,
    signatureState: state,
    signature: signature
      ? {
          imageReference: signature.imageReference,
          signerName: signature.signerName,
          relationship: signature.relationship,
          consentStatement: signature.consentStatement,
          signedAt: signature.signedAt,
          estimateVersion: signature.estimateVersion,
          totalSigned: num(signature.totalSigned),
        }
      : null,
  };
}

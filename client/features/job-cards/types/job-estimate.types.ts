/** The staged estimate step (GET /service/job-cards/:id/estimate). Money is a 2-decimal string. */
export type EstimatePayer = "CUSTOMER" | "WARRANTY" | "GOODWILL" | "CAMPAIGN";
export type LineDecision = "APPROVED" | "DECLINED";
export type EstimateOutcome = "APPROVED" | "PARTIAL" | "ALL_DECLINED";
export type LineKind = "PART" | "OIL" | "LABOUR" | "SERVICE" | "REQUEST";
export type AdvanceExemption = "WARRANTY_ONLY" | "FREE_SERVICE" | "CAMPAIGN" | "INTERNAL" | "CREDIT_APPROVED";
export type ManualExemption = "FREE_SERVICE" | "INTERNAL" | "CREDIT_APPROVED";
export type SignatureState = "valid" | "invalid" | "legacy" | "override" | "phone";

export interface EstimateLine {
  id: string;
  type: string;
  kind: LineKind;
  includedInService: boolean;
  referenceId: string | null;
  description: string;
  quantity: string;
  rate: string;
  amount: string;
  payer: EstimatePayer;
  customerDecision: LineDecision | null;
  findingItemId: string | null;
  complaintId: string | null;
  /** Supplementary revisions: copied from the revision before with its decision; the customer decides only the other lines. */
  carriedOver: boolean;
}

export interface EstimateTotals {
  customerSubtotal: string;
  vat: string;
  customerTotal: string;
  otherPayerTotal: string;
  approvedSubtotal: string;
  approvedVat: string;
  approvedTotal: string;
  customerLineCount: number;
  declinedCount: number;
}

export interface EstimateApproval {
  channel: "COUNTER" | "PHONE";
  decidedAt: string;
  approvedCount: number;
  declinedCount: number;
  signatureState: SignatureState;
  signerName: string | null;
  relationship: string | null;
  signerPhone: string | null;
  signedAt: string | null;
  approverName: string | null;
  approverPhone: string | null;
  approvedAt: string | null;
  recordedBy: string | null;
  note: string | null;
  signatureDueAtDelivery: boolean;
}

export interface EstimateRevision {
  id: string;
  number: string | null;
  version: number;
  /** Prepared during repair for new findings (phase 6). */
  supplementary: boolean;
  status: string;
  outcome: EstimateOutcome | null;
  createdAt: string;
  updatedAt: string;
  presentedAt: string | null;
  vatRate: string;
  upfrontPaymentPercent: string;
  contentHash: string;
  lines: EstimateLine[];
  totals: EstimateTotals;
  approval: EstimateApproval | null;
}

export interface EstimationChargeRecord {
  status: "ADDED" | "WAIVER_REQUESTED" | "WAIVED";
  amount: string;
  createdBy: string | null;
  createdAt: string;
  waiverReason: string | null;
  waiverRequestedBy: string | null;
  waiverRequestedAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface JobEstimateStep {
  jobCardId: string;
  jobNumber: string;
  stage: string;
  access: { canEdit: boolean; canSign: boolean; canDecideWaiver: boolean; canExempt: boolean; canReceive: boolean };
  findingsCount: number;
  canPrepare: boolean;
  requests: { id: string; number: number; description: string }[];
  estimate: EstimateRevision | null;
  estimationCharge: { proposedAmount: string | null; minimum: string; percent: string; record: EstimationChargeRecord | null } | null;
  advance: {
    required: boolean;
    exemption: AdvanceExemption | null;
    exemptionLabel: string | null;
    exemptionReason: string | null;
    automatic: boolean;
    exemptedBy: string | null;
    exemptedAt: string | null;
    payable: string;
    suggestedPercent: string;
    suggestedAmount: string;
    received: string;
    balance: string;
    receipts: { id: string; number: string; amount: string; mode: string; at: string; recordedBy: string | null }[];
    cashiers: string[];
  };
  partsRequest: { needed: boolean; status: "SENT" | "FAILED" | null; itemCount: number; failure: string | null; sentAt: string | null; storeManagers: string[] };
  technician: string | null;
  customerName: string | null;
  registration: string | null;
}

export interface DraftLinePayload {
  type: "PART" | "LABOUR" | "SERVICE";
  referenceId: string;
  quantity: number;
  payer: EstimatePayer;
  findingItemId?: string | null;
  complaintId?: string | null;
}

export interface SaveDraftPayload {
  estimateId: string;
  updatedAt: string;
  upfrontPaymentPercent: number;
  lines: DraftLinePayload[];
}

export interface ApprovePayload {
  estimateId: string;
  expectedHash: string;
  decisions: { lineId: string; decision: LineDecision }[];
  signer: "OWNER" | "REPRESENTATIVE";
  signerName: string;
  signerPhone?: string;
  signatureImage: string;
  consentAccepted: true;
  requestId: string;
}

export interface PhoneApprovalPayload {
  estimateId: string;
  expectedHash: string;
  approverName: string;
  approverPhone: string;
  approvedAt: string;
  approvedLineIds: string[];
  note?: string;
  requestId: string;
}

export interface DeclinedItem {
  id: string;
  description: string;
  amount: string;
  declinedAt: string | null;
  jobCardId: string;
  jobNumber: string;
}

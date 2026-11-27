import type { JobStage } from "./job-workspace.types";

/** The Delivery step (job card revamp phase 9), as GET /service/job-cards/:id/delivery returns it. */

export type CollectorType = "OWNER" | "CHECK_IN_SIGNER" | "OTHER";

export interface DeliveryPerson {
  name: string;
  phone: string | null;
}

export interface Belonging {
  code: string;
  label: string;
}

export interface WorkDoneLine {
  text: string;
  /** Plain words for the customer, for example "Added with your approval". */
  note: string | null;
}

export interface ReleaseApproval {
  id: string;
  collectorName: string;
  collectorPhone: string;
  reason: string;
  approvedAt: string;
  approvedBy: string | null;
  approvedByRole: string;
}

export interface PhoneApprovalDue {
  approvalId: string;
  version: number;
  approverName: string | null;
  approverPhone: string | null;
  approvedAt: string | null;
  /** With VAT, as a 2-decimal string. */
  approvedTotal: string;
  items: { description: string; amount: string }[];
  /** False when the revision changed after the call: it cannot be signed here. */
  matches: boolean;
}

export interface DeliveredFacts {
  at: string;
  by: string | null;
  gatePassNumber: string | null;
  psfFollowUpDueAt: string | null;
  lateReasons: string[];
  lateRemarks: string | null;
  /** Null for jobs delivered before the delivery signature (phase 9). */
  collector: { type: CollectorType; name: string; phone: string | null; signedAt: string } | null;
  belongingsReturned: (Belonging & { returned: boolean })[];
}

export interface JobDeliveryStep {
  jobCardId: string;
  jobNumber: string;
  stage: JobStage;
  status: string | null;
  promisedAt: string | null;
  late: boolean;
  workDone: WorkDoneLine[];
  declined: string[];
  belongings: Belonging[];
  owner: DeliveryPerson;
  checkInSigner: DeliveryPerson | null;
  releaseApproval: ReleaseApproval | null;
  phoneApprovals: PhoneApprovalDue[];
  paymentProblem: string | null;
  invoiceId: string | null;
  delivered: DeliveredFacts | null;
  access: {
    canDeliver: boolean;
    canSignEstimate: boolean;
    canApproveRelease: boolean;
    canRequestRelease: boolean;
  };
}

export interface DeliveryPayload {
  requestId: string;
  collectorType: CollectorType;
  returnedCodes: string[];
  lateReasonIds: string[];
  lateRemarks?: string;
  accepted: true;
  signatureImage: string;
}

export interface PhoneSignaturePayload {
  requestId: string;
  signerName: string;
  accepted: true;
  signatureImage: string;
}

export interface ReleaseApprovalPayload {
  requestId: string;
  collectorName: string;
  collectorPhone: string;
  reason: string;
}

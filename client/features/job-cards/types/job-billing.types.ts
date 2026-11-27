import type { JobStage } from "./job-workspace.types";

/** The Billing step (job card revamp phase 8), as GET /service/job-cards/:id/billing returns it. */

export type ReadyChannel = "PHONE_CALL" | "SMS";
export type ChargeGroup = "PARTS" | "OIL" | "LABOUR" | "SERVICE_CHARGE";
export type PaymentStatus = "NOT_INVOICED" | "NOTHING_TO_PAY" | "UNPAID" | "PART_PAID" | "PAID";

export interface ReadyNotice {
  id: string;
  channel: ReadyChannel;
  phone: string | null;
  note: string | null;
  at: string;
  by: string | null;
}

/** Before the first notice: the branch terms. After it: the running (or invoiced) counter. */
export type StorageView =
  | { notifiedAt: null; freeHours: number; dailyRate: string }
  | { notifiedAt: string; freeUntil: string; freeHours: number; dailyRate: string; days: number; proposedAmount: string; running: boolean };

export interface ComparisonRow {
  group: ChargeGroup | "TOTAL";
  estimated: string;
  actual: string;
  difference: string;
}

export interface JobBillingStep {
  jobCardId: string;
  stage: JobStage;
  status: string | null;
  readyAt: string | null;
  customerPhone: string | null;
  /** Newest first. */
  notices: ReadyNotice[];
  storage: StorageView | null;
  washed: { at: string; by: string | null } | null;
  comparison: { rows: ComparisonRow[] | null; problem: string | null };
  warrantyClaim: { amount: string; officer: string | null } | null;
  invoice: {
    id: string;
    number: string;
    issuedAt: string;
    total: string;
    advancePaid: string;
    paymentsReceived: string;
    balanceDue: string;
    jobs: { id: string; jobNumber: string }[];
  } | null;
  paymentStatus: PaymentStatus;
  draft: {
    total: string | null;
    advancePaid: string;
    balanceDue: string | null;
    blockers: string[];
    storage: { days: number; proposedAmount: string; dailyRate: string; freeUntil: string } | null;
  } | null;
  otherVehicleJobs: { id: string; jobNumber: string; stage: JobStage; ready: boolean }[];
  cancelledBill: { number: string; at: string | null; reason: string | null; by: string | null } | null;
  credit: { by: string | null; role: string | null; at: string | null } | null;
  nothingToPay: boolean;
  deliveryProblem: string | null;
  access: {
    canMarkReady: boolean;
    canNotify: boolean;
    canMarkWashed: boolean;
    canCreateInvoice: boolean;
    canRecordPayment: boolean;
    canApproveCredit: boolean;
  };
}

export interface ReadyNoticePayload {
  requestId: string;
  channel: ReadyChannel;
  note: string | null;
}

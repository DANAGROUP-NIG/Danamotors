export type LateKind = "DATE" | "TIME";
export type ReasonFilter = "all" | "missing" | "recorded";

export interface LateReasonOption {
  id: string;
  code: string;
  description: string;
  active: boolean;
}

export interface Lateness {
  kind: LateKind | null;
  daysLate: number;
  minutesLate: number;
}

export interface LateListItem {
  id: string;
  jobNumber: string;
  jobType: "SERVICE" | "PDI";
  promisedAt: string;
  deliveredAt: string;
  registration: string | null;
  model: string | null;
  variant: string | null;
  serviceType: string | null;
  serviceAdvisor: string | null;
  branchName: string;
  daysLate: number;
  minutesLate: number;
  reasonCount: number;
  lateRemarks: string | null;
}

export interface LateListResult {
  items: LateListItem[];
  counts: Record<ReasonFilter, number>;
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface LateHistoryEntry {
  id: string;
  at: string;
  by: string | null;
  kind: LateKind;
  before: { reasonIds: string[]; remarks: string | null };
  after: { reasonIds: string[]; remarks: string | null };
}

export interface LateDetail {
  id: string;
  jobNumber: string;
  jobType: "SERVICE" | "PDI";
  jobDate: string;
  branch: { id: string; name: string };
  registration: string | null;
  vin: string | null;
  model: string | null;
  variant: string | null;
  customer: string | null;
  serviceType: string | null;
  serviceAdvisor: string | null;
  deliveryAdvisor: string | null;
  gatePassNumber: string | null;
  promisedAt: string;
  deliveredAt: string;
  billedAt: string | null;
  lateness: Lateness;
  reasonIds: string[];
  remarks: string | null;
  history: LateHistoryEntry[];
}

export interface LateSavePayload {
  kind: LateKind;
  reasonIds: string[];
  remarks: string | null;
}

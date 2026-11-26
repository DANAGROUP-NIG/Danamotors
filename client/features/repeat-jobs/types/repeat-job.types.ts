export type RepeatStatus = "PENDING_REVIEW" | "CONFIRMED" | "NOT_REPEAT";
export type RepeatSource = "AUTOMATIC" | "MANUAL";
export type RepeatStatusFilter = RepeatStatus | "ALL";

export interface RepeatReason {
  id: string;
  code: string;
  description: string;
  isNotRepeat: boolean;
}

export interface RepeatReasonOption extends RepeatReason {
  active: boolean;
}

export interface RepeatWindow {
  days: number | null;
  km: number | null;
}

export interface RepeatListItem {
  id: string;
  status: RepeatStatus;
  source: RepeatSource;
  daysDifference: number;
  kmDifference: number | null;
  window: RepeatWindow;
  flaggedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  remarks: string | null;
  job: { id: string; jobNumber: string; date: string; mileage: number | null; status: string; branch: string; serviceAdvisor: string | null; registration: string | null; vin: string | null; variant: string | null };
  previousJob: { id: string; jobNumber: string; date: string; mileage: number | null };
  previousEngineer: string | null;
  previousServiceAdvisor: string | null;
  reasons: RepeatReason[];
}

export interface RepeatListResult {
  items: RepeatListItem[];
  statusCounts: Record<RepeatStatusFilter, number>;
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface ComparedJob {
  id: string;
  jobNumber: string;
  date: string;
  mileage: number | null;
  status: string;
  branch: string;
  serviceType: string | null;
  serviceAdvisor: string | null;
  engineer: string | null;
  technician: string | null;
  registration: string | null;
  vin: string | null;
  model: string | null;
  variant: string | null;
  description: string;
  customerRequests: { id: string; code: string | null; description: string }[];
  workDone: string | null;
  /** The technician's findings (cause and nature of defect). */
  findings: string[];
  labour: { id: string; code: string | null; description: string }[];
  billedAt: string | null;
}

export interface RepeatDetail {
  id: string;
  status: RepeatStatus;
  source: RepeatSource;
  daysDifference: number;
  kmDifference: number | null;
  window: RepeatWindow;
  openingNote: string | null;
  remarks: string | null;
  reasons: RepeatReason[];
  flaggedAt: string;
  reviewedAt: string | null;
  reviewedBy: { id: string; name: string | null } | null;
  canReview: boolean;
  job: ComparedJob;
  previousJob: ComparedJob & { technicians: (string | null)[] };
  olderPendingId: string | null;
  newerPendingId: string | null;
}

export interface JobRepeatSummary {
  printRepeatBlock: boolean;
  repeat: null | {
    id: string;
    status: RepeatStatus;
    source: RepeatSource;
    daysDifference: number;
    kmDifference: number | null;
    window: RepeatWindow;
    openingNote: string | null;
    remarks: string | null;
    reasons: RepeatReason[];
    reviewedAt: string | null;
    reviewedBy: string | null;
    previousEngineer: string | null;
    previousJob: { id: string; jobNumber: string; date: string; mileage: number | null };
  };
}

/** The opening form's repeat check (GET /service/vehicles/:id/recent-jobs). */
export interface RepeatPreview {
  window: { days: number; km: number | null };
  candidate: null | {
    byDays: boolean;
    byKm: boolean;
    daysDifference: number;
    kmDifference: number | null;
    previousJob: {
      id: string;
      jobNumber: string;
      date: string;
      mileage: number | null;
      status: string;
      serviceType: string | null;
      engineer: string | null;
      serviceAdvisor: string | null;
      technician: string | null;
      description: string;
      workDone: string | null;
    };
  };
  jobs: { id: string; jobNumber: string; createdAt: string; mileage: number | null; status: string; billedAt: string | null; technician: { firstName: string; lastName: string } | null }[];
}

export interface RepeatReviewPayload {
  reasonIds: string[];
  remarks: string;
}

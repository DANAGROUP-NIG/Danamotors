/** The warranty check (job card revamp phase 4), as GET /service/job-cards/:id/warranty returns it. */

export type FindingPayer = "WARRANTY" | "GOODWILL" | "CAMPAIGN" | "CUSTOMER";
export type PeriodStatus = "ON_TIME" | "MISSED" | "UPCOMING" | "NOT_DUE";
export type InsufficientReason = "NO_SALE_DATE" | "SALE_DATE_IN_FUTURE" | "NO_MILEAGE";
export type CoverageStatus = "ACTIVE" | "EXPIRED_DATE" | "EXPIRED_MILEAGE" | "NOT_COVERED" | "UNKNOWN";

export interface Span {
  days: number;
  months: number;
  extraDays: number;
}

export interface ServiceOnGrid {
  id: string;
  /** YYYY-MM-DD (Lagos calendar day). */
  date: string;
  mileage: number | null;
  source: "JOB" | "OUTSIDE";
  /** Job number, or the dealer for an outside record. */
  label: string;
  sinceLast: Span;
  kmSinceLast: number | null;
}

export interface MissedService {
  year: number;
  period: number;
  dueOn: string;
  reason: "TIME" | "DISTANCE" | "BOTH";
  fromDate: string;
  fromSale: boolean;
  toDate: string | null;
  gap: Span;
  kmGap: number | null;
}

export interface PeriodRow {
  period: number;
  start: string;
  end: string;
  status: PeriodStatus;
  services: ServiceOnGrid[];
  missed: MissedService[];
  dueOn: string | null;
}

export interface YearRow {
  year: number;
  start: string;
  end: string;
  current: boolean;
  missedCount: number;
  periods: PeriodRow[];
}

export type ServiceVerdict =
  | { kind: "REGULAR" }
  | { kind: "IRREGULAR"; missedCount: number; years: number[]; where: { year: number; period: number }[] }
  | { kind: "INSUFFICIENT_DATA"; missing: InsufficientReason[] };

export interface ServiceRule {
  intervalMonths: number;
  intervalKm: number;
  servicesPerYear: number;
  graceKm: number;
  graceDays: number;
}

export interface ServiceHistory {
  rule: ServiceRule;
  saleDate: string | null;
  asOf: string;
  currentMileage: number | null;
  verdict: ServiceVerdict;
  sentence: string;
  insufficient: { reason: InsufficientReason; text: string; fix: string }[];
  years: YearRow[];
  missed: MissedService[];
  nextDue: { date: string; mileage: number | null } | null;
  services: ServiceOnGrid[];
}

export interface WarrantyCoverage {
  status: CoverageStatus;
  source: "MODEL" | "EXTENDED" | "GOODWILL" | null;
  startDate: string | null;
  expiresOn: string | null;
  warrantyDays: number | null;
  kmLimit: number | null;
  mileage: number | null;
  remainingDays: number | null;
  remainingKm: number | null;
  daysUsedPercent: number | null;
  kmUsedPercent: number | null;
  reasonText: string[];
  atOpening: CoverageStatus | null;
}

export interface OutsideServiceRecord {
  id: string;
  serviceDate: string;
  mileage: number;
  dealerName: string;
  note: string | null;
  photo: { id: string; jobCardId: string } | null;
  addedBy: string | null;
  createdAt: string;
  canRemove: boolean;
}

export interface LinkedCampaign {
  id: string;
  code: string;
  title: string;
  type: "RECALL" | "FREE_FIX" | "SERVICE_CAMPAIGN" | "FPC";
  attended: boolean | null;
}

export interface DecisionItem {
  id: string;
  kind: "LABOUR" | "PART" | "OIL";
  description: string;
  quantity: number;
  /** The customer request the finding answers; null for a finding the customer did not mention. */
  request: string | null;
  technicianNote: string;
  possibleWarranty: boolean;
  partWarrantyApplicable: boolean | null;
  payer: FindingPayer | null;
  campaignId: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
}

export interface JobWarrantyCheck {
  jobCardId: string;
  jobNumber: string;
  stage: string;
  editable: boolean;
  readOnlyReason: string | null;
  canAddRecords: boolean;
  vehicle: { id: string; vin: string; registrationNumber: string | null; model: string | null; saleDate: string | null };
  coverage: WarrantyCoverage;
  history: ServiceHistory | null;
  outsideRecords: OutsideServiceRecord[];
  campaigns: LinkedCampaign[];
  items: DecisionItem[];
  reason: string | null;
  reasonNeeded: boolean;
  problems: string[];
  summary: string;
  warrantyCase: { id: string; caseNumber: string; status: string } | null;
}

export interface DecisionsPayload {
  items: { itemId: string; payer: FindingPayer; campaignId?: string | null }[];
  reason?: string | null;
}

export interface OutsideRecordPayload {
  requestId: string;
  serviceDate: string;
  mileage: number;
  dealerName: string;
  note?: string;
  image: string;
}

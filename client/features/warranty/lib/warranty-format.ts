import type { StatusTone } from "@/components/ui/table-components/StatusBadge";
import type {
  CampaignType,
  CampaignVehicleStatus,
  CaseStatus,
  CoverageStatus,
  IssuedPartOutcome,
  Person,
  ReimbursementStatus,
} from "../types/warranty.types";

// ── Formatting (Nigerian locale: ₦, DD/MM/YYYY, km) ─────────────────────────

/** Shown wherever a value is missing, across warranty and campaign screens. */
export const NOT_AVAILABLE = "N/A";

const nairaFormatters = new Map<number, Intl.NumberFormat>();

export function fmtNaira(value: number | null | undefined, decimals = 2) {
  if (value == null || !Number.isFinite(value)) return NOT_AVAILABLE;
  let formatter = nairaFormatters.get(decimals);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    nairaFormatters.set(decimals, formatter);
  }
  return formatter.format(value);
}

/** Signed naira for variances: +₦1,000.00 or -₦1,000.00. */
export function fmtNairaSigned(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return NOT_AVAILABLE;
  if (value === 0) return fmtNaira(0);
  return `${value > 0 ? "+" : "-"}${fmtNaira(Math.abs(value))}`;
}

/** File sizes: 820 KB, 4.2 MB. */
export function fmtFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Compact naira for KPI sub-text: ₦4.2M, ₦380K. */
export function fmtNairaShort(value: number) {
  if (value >= 1_000_000) return `₦${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `₦${Math.round(value / 1_000)}K`;
  return `₦${value.toLocaleString("en-NG")}`;
}

const LAGOS = "Africa/Lagos";

/** Today's date in Lagos as YYYY-MM-DD, for date inputs. */
export function todayInLagos() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: LAGOS }).format(new Date());
}

/** DD/MM/YYYY. Date-only strings (YYYY-MM-DD) are shown as-is, without timezone shifts. */
export function fmtDate(value: string | null | undefined) {
  if (!value) return NOT_AVAILABLE;
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  return new Date(value).toLocaleDateString("en-GB", { timeZone: LAGOS });
}

export function fmtDateTime(value: string | null | undefined) {
  if (!value) return NOT_AVAILABLE;
  const d = new Date(value);
  return `${d.toLocaleDateString("en-GB", { timeZone: LAGOS })} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: LAGOS })}`;
}

export function fmtKm(value: number | null | undefined) {
  return value == null ? NOT_AVAILABLE : `${value.toLocaleString("en-NG")} km`;
}

export function personName(p: Person | null | undefined) {
  return p ? `${p.firstName} ${p.lastName}` : NOT_AVAILABLE;
}

/** "1 year 7 months" style span for remaining warranty days. */
export function fmtDuration(days: number | null | undefined) {
  if (days == null) return NOT_AVAILABLE;
  if (days < 31) return `${days} day${days === 1 ? "" : "s"}`;
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30.44);
  const parts = [years && `${years} year${years === 1 ? "" : "s"}`, months && `${months} month${months === 1 ? "" : "s"}`].filter(Boolean);
  return parts.join(" ") || `${days} days`;
}

export function daysAgo(value: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  return days === 0 ? "Today" : days === 1 ? "1 day" : `${days} days`;
}

/** yyyy-mm-dd for date inputs, from ISO or date strings. */
export function toDateInput(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

// ── Coverage ─────────────────────────────────────────────────────────────────

export const COVERAGE_LABELS: Record<CoverageStatus, string> = {
  ACTIVE: "Active",
  EXPIRED_DATE: "Expired",
  EXPIRED_MILEAGE: "Expired (km)",
  NOT_COVERED: "Not covered",
  UNKNOWN: "Unknown",
};

export const COVERAGE_TONES: Record<CoverageStatus, StatusTone> = {
  ACTIVE: "emerald",
  EXPIRED_DATE: "red",
  EXPIRED_MILEAGE: "red",
  NOT_COVERED: "gray",
  UNKNOWN: "amber",
};

export const COVERAGE_SOURCE_LABELS = { MODEL: "Manufacturer", EXTENDED: "Extended warranty", GOODWILL: "Goodwill" } as const;

// ── Cases ────────────────────────────────────────────────────────────────────

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  OPEN: "Open",
  IN_REVIEW: "In review",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  PARTIALLY_APPROVED: "Partially approved",
  REJECTED: "Rejected",
  RETURNED: "Returned",
  SETTLED: "Settled",
  CLOSED: "Closed",
};

export const CASE_STATUS_TONES: Record<CaseStatus, StatusTone> = {
  OPEN: "gray",
  IN_REVIEW: "blue",
  SUBMITTED: "purple",
  APPROVED: "emerald",
  PARTIALLY_APPROVED: "amber",
  REJECTED: "red",
  RETURNED: "orange",
  SETTLED: "emerald",
  CLOSED: "gray",
};

export const CASE_STATUSES = Object.keys(CASE_STATUS_LABELS) as CaseStatus[];

export const REIMBURSEMENT_LABELS: Record<ReimbursementStatus, string> = {
  PENDING: "Reimbursement pending",
  RECEIVED: "Reimbursement received",
};

export const REIMBURSEMENT_TONES: Record<ReimbursementStatus, StatusTone> = {
  PENDING: "amber",
  RECEIVED: "emerald",
};

export const ISSUED_PART_OUTCOME_LABELS: Record<IssuedPartOutcome, string> = {
  NOT_CLAIMED: "Not on claim",
  NOT_ISSUED: "Not issued on job card",
  AWAITING_DECISION: "Awaiting decision",
  RECOVERED: "Recovered",
  SHORTFALL: "Shortfall",
};

export const ISSUED_PART_OUTCOME_TONES: Record<IssuedPartOutcome, StatusTone> = {
  NOT_CLAIMED: "orange",
  NOT_ISSUED: "gray",
  AWAITING_DECISION: "blue",
  RECOVERED: "emerald",
  SHORTFALL: "red",
};

// ── Campaigns ────────────────────────────────────────────────────────────────

export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  RECALL: "Recall",
  FREE_FIX: "Field fix",
  SERVICE_CAMPAIGN: "Service campaign",
  FPC: "FPC bulletin",
};

/** What the adviser should do when a vehicle is affected by a campaign of this type. */
export const CAMPAIGN_TYPE_HINTS: Record<CampaignType, string> = {
  RECALL: "Include the recall work in this job. It is a safety matter and must not be skipped.",
  FREE_FIX: "Carry out the field fix at no charge to the customer.",
  SERVICE_CAMPAIGN: "Offer this service to the customer.",
  FPC: "Check the vehicle under this bulletin and record on the job card whether it was done.",
};

export const CAMPAIGN_TYPE_TONES: Record<CampaignType, StatusTone> = {
  RECALL: "red",
  FREE_FIX: "blue",
  SERVICE_CAMPAIGN: "purple",
  FPC: "orange",
};

export const CAMPAIGN_VEHICLE_LABELS: Record<CampaignVehicleStatus, string> = {
  PENDING: "Pending",
  CONTACTED: "Contacted",
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  NOT_REACHABLE: "Not reachable",
  NOT_APPLICABLE: "Not applicable",
};

export const CAMPAIGN_VEHICLE_TONES: Record<CampaignVehicleStatus, StatusTone> = {
  PENDING: "gray",
  CONTACTED: "amber",
  SCHEDULED: "blue",
  COMPLETED: "emerald",
  NOT_REACHABLE: "red",
  NOT_APPLICABLE: "gray",
};

export function apiErrorMessage(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: { message?: string; errors?: { message: string }[] } } })?.response?.data;
  return data?.errors?.[0]?.message ?? data?.message ?? fallback;
}

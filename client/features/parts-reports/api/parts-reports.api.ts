import { apiGet } from "@/lib/api/apiClient";

// Mirrors server/src/modules/parts-report.

export type ColumnType = "text" | "date" | "datetime" | "qty" | "money" | "percent";
/**
 * total "last": a running balance; the subtotal is the group's last value.
 * ratio: a percent whose subtotal and total are `of` over the sum of `over`.
 */
export type ReportColumn = {
  key: string;
  label: string;
  type: ColumnType;
  total?: boolean | "last";
  ratio?: { of: string; over: string[] };
};
export type ReportFilterKey =
  | "customer"
  | "vendor"
  | "executive"
  | "branch"
  | "part"
  | "partFlag"
  | "priceCategory"
  | "search"
  | "status"
  | "option"
  | "fullyExecuted"
  | "includeReturns"
  | "includeCancelled"
  | "includeAlternates"
  | "onlyTransacted"
  | "days"
  | "ageLimits"
  | "mileageLimits"
  | "topN"
  | "summary"
  | "countType"
  | "onlyRemarks"
  | "includeNotRequired";

export type ReportDefinition = {
  kind: string;
  title: string;
  group: string;
  description: string;
  permission: string;
  filters: ReportFilterKey[];
  /** range (default): from and to dates; asOn: one date, sent as from = to; none: today's stock. */
  period?: "range" | "asOn" | "none";
  /** Covers every branch; no branch is chosen. */
  allBranches?: boolean;
  labels?: { branch?: string; search?: string; option?: string; days?: string; countType?: string };
  options?: { value: string; label: string }[];
  statuses?: { value: string; label: string }[];
  /** Stock taking type, or audit type. */
  countTypes?: { value: string; label: string }[];
  grouped?: boolean;
  /** Printed and exported in pages that end with the running grand total (legacy "Carried Forward"). */
  carriedForward?: boolean;
  columns: ReportColumn[] | Record<string, ReportColumn[]>;
  summaryColumns?: ReportColumn[];
};

export type ReportRow = Record<string, string | number | null>;

export type ReportResult = {
  kind: string;
  title: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: Record<string, number>;
  grouped: boolean;
  truncated: boolean;
};

export type ReportLookups = {
  executives: { id: string; name: string }[];
  vendors: string[];
  categories: { code: string; description: string }[];
  partFlags: string[];
};

export type ReportParams = {
  from: string;
  to: string;
  branchId?: string;
  customerId?: string;
  vendor?: string;
  executiveId?: string;
  otherBranchId?: string;
  partId?: string;
  partFlag?: string;
  priceCategory?: string;
  search?: string;
  status?: string;
  option?: string;
  fullyExecuted?: boolean;
  includeReturns?: boolean;
  includeCancelled?: boolean;
  includeAlternates?: boolean;
  onlyTransacted?: boolean;
  days?: number;
  /** Five increasing day limits, comma separated. */
  ageLimits?: string;
  /** Five increasing mileage limits in km, comma separated. */
  mileageLimits?: string;
  topN?: number;
  summary?: boolean;
  countType?: string;
  onlyRemarks?: boolean;
  includeNotRequired?: boolean;
};

const BASE = "/parts-reports";

export const partsReportKeys = {
  all: ["parts-reports"] as const,
  catalog: () => [...partsReportKeys.all, "catalog"] as const,
  lookups: () => [...partsReportKeys.all, "lookups"] as const,
  run: (kind: string, params: ReportParams) => [...partsReportKeys.all, "run", kind, params] as const,
};

export async function getReportCatalogRequest() {
  return (await apiGet<{ reports: ReportDefinition[] }>(BASE)).reports;
}

export async function getReportLookupsRequest() {
  return apiGet<ReportLookups>(`${BASE}/lookups`);
}

export async function runReportRequest(kind: string, params: ReportParams) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return (await apiGet<{ report: ReportResult }>(`${BASE}/${kind}?${query.toString()}`)).report;
}

import { apiGet } from "@/lib/api/apiClient";

// Mirrors server/src/modules/parts-report.

export type ColumnType = "text" | "date" | "qty" | "money" | "percent";
export type ReportColumn = { key: string; label: string; type: ColumnType; total?: boolean };
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
  | "includeCancelled";

export type ReportDefinition = {
  kind: string;
  title: string;
  group: string;
  description: string;
  permission: string;
  filters: ReportFilterKey[];
  labels?: { branch?: string; search?: string };
  options?: { value: string; label: string }[];
  statuses?: { value: string; label: string }[];
  grouped?: boolean;
  columns: ReportColumn[] | Record<string, ReportColumn[]>;
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

import { AlertTriangle, Route } from "lucide-react";
import { REPORT_PERMISSIONS } from "@/features/auth/roles";
import { cn } from "@/lib/utils";
import { fmtNumber } from "../lib/report-format";
import type { ReportConfig, ReportResponse } from "../types";
import { addressColumns, count, jobColumn, modelColumn, RANGE_PRESETS, registrationColumn, str } from "./shared";

// ── 15. Vehicles reported before first service ──────────────────────────────

export const beforeFirstServiceConfig: ReportConfig = {
  slug: "before-first-service",
  title: "Vehicles reported before first service",
  description: "New vehicles that came in with faults before their first free service.",
  category: "Vehicle analysis",
  permission: REPORT_PERMISSIONS.BEFORE_FIRST_SERVICE,
  width: 80,
  icon: AlertTriangle,
  period: { kind: "range", label: "Sale date", presets: ["thisMonth", "lastMonth"], defaultPreset: "lastMonth" },
  filters: ["model", "variant", "complaint"],
  hasMode: true,
  noun: ["visit", "visits"],
  columns: [
    jobColumn(),
    { key: "jobDate", label: "Job date", format: "date" },
    { key: "mileage", label: "Mileage (km)", format: "integer" },
    {
      key: "daysSinceSale",
      label: "Days since sale",
      format: "integer",
      render: (row) => (
        <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums", Number(row.daysSinceSale) < 30 ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-700")}>
          {fmtNumber(row.daysSinceSale, "integer")} days
        </span>
      ),
    },
    { key: "requests", label: "Customer requests", className: "min-w-48 text-xs" },
  ],
  summaryCards: (data) => {
    const s = data.summary ?? {};
    return [
      { label: "Vehicles", value: fmtNumber(Number(s.vehicles ?? 0), "integer") },
      { label: "Visits", value: fmtNumber(Number(s.visits ?? 0), "integer"), tone: "blue" },
      { label: "Avg days after sale", value: s.averageDaysSinceSale === null || s.averageDaysSinceSale === undefined ? "—" : fmtNumber(Number(s.averageDaysSinceSale), "integer"), tone: "amber" },
      { label: "Top request", value: s.topRequest ? String(s.topRequest) : "—", sub: s.topRequest ? `${s.topRequestCount} visits` : undefined, tone: "red" },
    ];
  },
  subtotalLabel: (group) => `${group.count} ${group.count === 1 ? "visit" : "visits"}`,
  totalLabel: (data) => `Grand total · ${fmtNumber(Number(data.summary?.vehicles ?? 0), "integer")} vehicles · ${fmtNumber(count(data), "integer")} visits`,
  footnote: "Counts jobs after the sale date and before the first free service (free service no 1). Free services and PDI jobs are excluded.",
  emptyMessage: "No vehicles sold in this period came in before their first service",
};

// ── 16. Vehicles visited, mileage wise ──────────────────────────────────────

function MileageChart({ data }: { data: ReportResponse }) {
  const bands = data.breakdown ?? [];
  if (!bands.length) return null;
  const max = Math.max(...bands.map((band) => band.count), 1);
  return (
    <section className="rounded-xl border border-[#e8edf3] bg-white p-4 shadow-sm sm:p-5" aria-labelledby="mileage-chart">
      <h2 id="mileage-chart" className="mb-4 font-semibold">Vehicles by mileage band</h2>
      <div className="flex h-44 items-end gap-2 sm:gap-4" role="img" aria-label={bands.map((band) => `${band.label}: ${band.count}`).join(", ")}>
        {bands.map((band) => (
          <div key={band.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <span className="text-sm font-semibold tabular-nums">{band.count}</span>
            <div className="w-full max-w-24 rounded-t bg-primary/85" style={{ height: `${Math.max((band.count / max) * 100, band.count ? 3 : 0)}%` }} />
            <span className="w-full truncate text-center text-xs text-muted-foreground" title={band.label}>{band.label.replace(/ km$/, "")}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export const mileageWiseConfig: ReportConfig = {
  slug: "mileage-wise",
  title: "Vehicles visited — mileage wise",
  description: "How many vehicles came in at each mileage band.",
  category: "Vehicle analysis",
  permission: REPORT_PERMISSIONS.MILEAGE_WISE,
  width: 80,
  icon: Route,
  period: { kind: "range", label: "Bill date", presets: RANGE_PRESETS, defaultPreset: "thisMonth" },
  filters: ["model", "complaint", "labourOperation"],
  options: [
    { kind: "range", key: "mileage", label: "Mileage (km)", fromKey: "mileageFrom", toKey: "mileageTo", unit: "km" },
    { kind: "checkbox", key: "printRequests", label: "Print customer request", local: true, default: true },
    { kind: "checkbox", key: "printAddress", label: "Print customer address", local: true },
    { kind: "checkbox", key: "printLabour", label: "Print labour details", local: true },
  ],
  hasMode: true,
  noun: ["vehicle", "vehicles"],
  columns: [
    jobColumn(),
    { key: "billDate", label: "Bill date", format: "date" },
    registrationColumn(),
    modelColumn(),
    { key: "mileage", label: "Mileage (km)", format: "integer" },
    { key: "customer", label: "Customer", className: "min-w-36" },
    ...addressColumns(),
    { key: "requests", label: "Customer requests", whenOption: "printRequests", className: "min-w-40 text-xs" },
    {
      key: "labour",
      label: "Labour details",
      whenOption: "printLabour",
      className: "min-w-56 text-xs",
      render: (row) => (
        <ul className="grid gap-0.5">
          {str(row, "labour").split("; ").filter(Boolean).map((line) => <li key={line}>{line}</li>)}
        </ul>
      ),
    },
  ],
  extra: (data) => <MileageChart data={data} />,
  subtotalLabel: (group) => `Subtotal — ${group.label} · ${group.count} ${group.count === 1 ? "vehicle" : "vehicles"}`,
  footnote: "Bands are set in Settings → Report settings. Mileage is the odometer reading recorded on the job card.",
};

export const VEHICLE_ANALYSIS_CONFIGS = [beforeFirstServiceConfig, mileageWiseConfig];

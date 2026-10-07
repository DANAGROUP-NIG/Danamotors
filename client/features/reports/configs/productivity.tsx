import { Gauge, UserCog } from "lucide-react";
import { REPORT_PERMISSIONS } from "@/features/auth/roles";
import { cn } from "@/lib/utils";
import { fmtMoney, fmtNumber } from "../lib/report-format";
import type { ReportColumn, ReportConfig, ReportGroup, ReportResponse } from "../types";
import { jobColumn, modelColumn, RANGE_PRESETS, registrationColumn, str } from "./shared";

/** Green from 100%, amber 85–99%, red below 85%. */
function efficiencyTone(value: number | null | undefined) {
  if (value === null || value === undefined) return "border-slate-200 bg-slate-50 text-slate-600";
  if (value >= 100) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value >= 85) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-red-200 bg-red-50 text-red-700";
}

const lineColumns: ReportColumn[] = [
  { key: "labourCode", label: "Labour code", className: "whitespace-nowrap font-mono text-xs" },
  {
    key: "description",
    label: "Description",
    className: "min-w-48",
    text: (row) => (row.sharedWith ? `${str(row, "description")} (shared with ${str(row, "sharedWith")} · ${fmtNumber(row.sharePercent)}%)` : str(row, "description")),
    render: (row) => (
      <div>
        {str(row, "description")}
        {row.sharedWith ? (
          <span className="ml-2 inline-flex rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-600">
            Shared with {str(row, "sharedWith")} · {fmtNumber(row.sharePercent)}%
          </span>
        ) : null}
      </div>
    ),
  },
  { key: "standardHours", label: "Std hrs", format: "hours" },
  { key: "chargedHours", label: "Charged hrs", format: "hours" },
  { key: "amount", label: "Amount", format: "money" },
  // Shown on the technician subtotals and the grand total only.
  {
    key: "efficiency",
    label: "Efficiency",
    format: "percent",
    text: () => "",
    render: () => null,
    renderTotal: (value) => <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold", efficiencyTone(value))}>{fmtNumber(value, "integer")}%</span>,
  },
];

function technicianSubtotal(group: ReportGroup) {
  return `${group.label} · ${fmtNumber(group.totals.jobs ?? 0, "integer")} jobs · ${fmtNumber(group.count, "integer")} lines`;
}

function productivityCards(data: ReportResponse) {
  const t = data.totals;
  return [
    { label: "Technicians", value: fmtNumber(Number(data.summary?.technicians ?? 0), "integer"), tone: "blue" as const },
    { label: "Jobs worked", value: fmtNumber(t.jobs ?? 0, "integer") },
    { label: "Standard hrs", value: fmtNumber(t.standardHours ?? 0, "hours") },
    { label: "Charged hrs", value: fmtNumber(t.chargedHours ?? 0, "hours") },
    { label: "Labour", value: fmtMoney(t.amount ?? 0), tone: "purple" as const },
    { label: "Efficiency", value: t.chargedHours ? `${fmtNumber(t.efficiency, "integer")}%` : "—", tone: (t.efficiency ?? 0) >= 100 ? ("emerald" as const) : ("amber" as const) },
  ];
}

// ── 8. Daily productivity ───────────────────────────────────────────────────

export const dailyProductivityConfig: ReportConfig = {
  slug: "daily-productivity",
  title: "Daily productivity report",
  description: "What each technician worked on during the day.",
  category: "Productivity",
  permission: REPORT_PERMISSIONS.DAILY_PRODUCTIVITY,
  width: 80,
  icon: Gauge,
  period: { kind: "date", label: "For date", dateLabel: "For date", presets: ["today", "yesterday"], defaultPreset: "yesterday", hint: "Labour lines recorded on this day" },
  filters: ["model", "variant", "serviceType", "team", "receivedBy", "deliveredBy"],
  hasMode: true,
  noun: ["line", "lines"],
  columns: [jobColumn(), registrationColumn(), ...lineColumns],
  summaryCards: productivityCards,
  subtotalLabel: technicianSubtotal,
  totalLabel: (data) => `Grand total · ${fmtNumber(data.totals.jobs ?? 0, "integer")} jobs · ${fmtNumber(data.totals.count ?? 0, "integer")} lines`,
  footnote: "Efficiency = standard hours ÷ charged hours. A line worked by several technicians is split by their recorded shares, or evenly.",
  emptyMessage: "No labour was recorded on this day",
};

// ── 9. Technician productivity ──────────────────────────────────────────────

function EfficiencyChart({ data }: { data: ReportResponse }) {
  const groups = data.groups.filter((group) => group.key !== "unassigned" && group.totals.chargedHours > 0);
  if (!groups.length) return null;
  const max = Math.max(120, ...groups.map((group) => group.totals.efficiency ?? 0));
  return (
    <section className="rounded-xl border border-[#e8edf3] bg-white p-4 shadow-sm sm:p-5" aria-labelledby="efficiency-chart">
      <h2 id="efficiency-chart" className="mb-4 font-semibold">Efficiency by technician</h2>
      <div className="relative grid gap-2.5">
        <div className="pointer-events-none absolute inset-y-0 border-l border-dashed border-slate-400" style={{ left: `calc(9rem + (100% - 9rem - 3.5rem) * ${100 / max})` }} aria-hidden>
          <span className="absolute -top-5 -translate-x-1/2 text-xs text-muted-foreground">100%</span>
        </div>
        {groups.map((group) => {
          const value = group.totals.efficiency ?? 0;
          return (
            <div key={group.key} className="grid grid-cols-[9rem_1fr_3.5rem] items-center gap-2 text-sm">
              <span className="truncate text-slate-600" title={group.label}>{group.label}</span>
              <div className="h-4 rounded bg-muted">
                <div className={cn("h-full rounded", value >= 100 ? "bg-emerald-500" : value >= 85 ? "bg-amber-400" : "bg-red-500")} style={{ width: `${Math.min(value / max, 1) * 100}%` }} />
              </div>
              <span className="text-right font-semibold tabular-nums">{fmtNumber(value, "integer")}%</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export const technicianProductivityConfig: ReportConfig = {
  slug: "technician-productivity",
  title: "Technician productivity report",
  description: "Technician output and efficiency over a billing period.",
  category: "Productivity",
  permission: REPORT_PERMISSIONS.TECHNICIAN_PRODUCTIVITY,
  width: 80,
  icon: UserCog,
  period: { kind: "range", label: "Bill date", presets: RANGE_PRESETS, defaultPreset: "lastMonth" },
  filters: ["model", "variant", "technician"],
  options: [
    {
      kind: "segmented",
      key: "orderBy",
      label: "Order by",
      default: "jobDate",
      choices: [
        { value: "jobDate", label: "Job date" },
        { value: "billDate", label: "Bill date" },
      ],
    },
  ],
  noun: ["line", "lines"],
  columns: [
    jobColumn(),
    { key: "jobDate", label: "Job date", format: "date" },
    { key: "billDate", label: "Bill date", format: "date" },
    registrationColumn(),
    modelColumn(false),
    ...lineColumns,
  ],
  summaryCards: productivityCards,
  extra: (data) => <EfficiencyChart data={data} />,
  subtotalLabel: technicianSubtotal,
  totalLabel: (data) => `Grand total · ${fmtNumber(data.totals.jobs ?? 0, "integer")} jobs · ${fmtNumber(data.totals.count ?? 0, "integer")} lines`,
  footnote: "Shared labour lines are split between technicians by their recorded shares, or evenly. Efficiency = standard hours ÷ charged hours.",
};

export const PRODUCTIVITY_CONFIGS = [dailyProductivityConfig, technicianProductivityConfig];


import Link from "next/link";
import { BarChart3, CalendarDays, Repeat2 } from "lucide-react";
import { ReasonChips, RepeatStatusBadge } from "@/features/repeat-jobs/components/repeat-ui";
import { REPEAT_SOURCE, REPEAT_STATUS, reasonText } from "@/features/repeat-jobs/lib/repeat-job.logic";
import type { RepeatReason, RepeatSource, RepeatStatus } from "@/features/repeat-jobs/types/repeat-job.types";
import { fmtDate, fmtNumber, plural } from "../lib/report-format";
import type { ReportColumn, ReportConfig, ReportResponse, ReportRow } from "../types";
import { jobColumn, modelColumn, RANGE_PRESETS, registrationColumn, str } from "./shared";

const GROUP = "Repeat jobs";
const reasonsOf = (row: ReportRow) => (Array.isArray(row.reasons) ? (row.reasons as RepeatReason[]) : []);
const statusOf = (row: ReportRow) => str(row, "reviewStatus") as RepeatStatus;
const pct = (value: number | undefined) => `${fmtNumber(value ?? 0, "number")}%`;

const previousJobColumn: ReportColumn = {
  key: "previousJobNumber",
  label: "Previous job / date",
  text: (row) => `${str(row, "previousJobNumber")} ${fmtDate(row.previousJobDate)}`,
  render: (row) => (
    <div className="whitespace-nowrap">
      <Link href={`/job-cards/${str(row, "previousJobId")}`} className="font-medium text-blue-700 underline-offset-2 hover:underline print:text-black">
        {str(row, "previousJobNumber")}
      </Link>
      <div className="text-xs text-muted-foreground">{fmtDate(row.previousJobDate)}</div>
    </div>
  ),
};

const statusColumn: ReportColumn = {
  key: "reviewStatus",
  label: "Review",
  text: (row) => `${REPEAT_STATUS[statusOf(row)]?.label ?? str(row, "reviewStatus")} (${REPEAT_SOURCE[str(row, "source") as RepeatSource] ?? str(row, "source")})`,
  render: (row) => (
    <div className="flex flex-col items-start gap-0.5">
      {REPEAT_STATUS[statusOf(row)] ? <RepeatStatusBadge status={statusOf(row)} /> : str(row, "reviewStatus")}
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{REPEAT_SOURCE[str(row, "source") as RepeatSource]}</span>
    </div>
  ),
};

const reasonsColumn: ReportColumn = {
  key: "reasons",
  label: "Reasons",
  className: "min-w-48",
  value: (row) => reasonsOf(row).map((reason) => reason.code).join(","),
  text: (row) => reasonText(reasonsOf(row)),
  render: (row) => <ReasonChips reasons={reasonsOf(row)} dense empty={<span className="text-xs text-muted-foreground">Not reviewed</span>} />,
};

const peopleColumn = (key: string, label: string, sub: string, subLabel: string): ReportColumn => ({
  key,
  label,
  text: (row) => `${str(row, key) || "—"} / ${str(row, sub) || "—"}`,
  render: (row) => (
    <div className="whitespace-nowrap text-sm">
      {str(row, key) || <span className="text-slate-300">—</span>}
      <div className="text-xs text-muted-foreground">{subLabel}: {str(row, sub) || "—"}</div>
    </div>
  ),
});

/** R1's columns, also the detail rows of the analysis. */
const repeatColumns: ReportColumn[] = [
  jobColumn({ withDate: true }),
  registrationColumn(true),
  modelColumn(),
  { key: "mileage", label: "Mileage", format: "integer" },
  previousJobColumn,
  { key: "previousMileage", label: "Prev. mileage", format: "integer" },
  { key: "daysDifference", label: "Days", format: "integer" },
  { key: "kmDifference", label: "Km", format: "integer" },
  peopleColumn("previousEngineer", "Prev. engineer / SA", "previousServiceAdvisor", "SA"),
  peopleColumn("engineer", "Engineer / SA (now)", "receivedBy", "SA"),
  reasonsColumn,
  { key: "remarks", label: "Remarks", className: "min-w-48 text-xs", text: (row) => str(row, "remarks") || str(row, "openingNote") },
  statusColumn,
];

// ── R1. Repeat job list ─────────────────────────────────────────────────────────

const repeatList: ReportConfig = {
  slug: "repeat-list",
  title: "List of repeat jobs",
  description: "Repeat jobs with the previous job, days and km between them, the people responsible, reasons, remarks and review status.",
  category: "Service · Repeat jobs",
  subgroup: GROUP,
  permission: "report:repeat-list",
  width: 132,
  icon: Repeat2,
  period: { kind: "range", label: "Job date", presets: RANGE_PRESETS, defaultPreset: "thisMonth" },
  filters: ["model", "variant"],
  options: [
    { kind: "checkbox", key: "includeNotRepeat", label: "Include vehicles marked \"not a repeat job\"", visibleWhen: { key: "onlyNotRepeat", values: ["false"] } },
    {
      kind: "checkbox",
      key: "onlyNotRepeat",
      label: "Only vehicles marked \"not a repeat job\"",
      hint: "By default the list shows repeats that count: confirmed and pending review. \"Only\" overrides \"include\".",
    },
  ],
  columns: repeatColumns,
  noun: ["repeat job", "repeat jobs"],
  rowTone: (row) => (statusOf(row) === "PENDING_REVIEW" ? "amber" : statusOf(row) === "CONFIRMED" ? "red" : undefined),
  totalLabel: (data) =>
    `${plural(data.totals.count ?? 0, ["job", "jobs"])} · ${data.totals.pending ?? 0} pending review · ${data.totals.confirmed ?? 0} confirmed · ${data.totals.notRepeat ?? 0} not a repeat`,
  summaryCards: (data) => [
    { label: "Listed", value: fmtNumber(data.totals.count ?? 0, "integer"), tone: "blue" },
    { label: "Pending review", value: fmtNumber(data.totals.pending ?? 0, "integer"), tone: "amber" },
    { label: "Confirmed", value: fmtNumber(data.totals.confirmed ?? 0, "integer"), tone: "red" },
    { label: "Not a repeat", value: fmtNumber(data.totals.notRepeat ?? 0, "integer"), tone: "gray", muted: !data.totals.notRepeat },
  ],
  footnote: "Days and km are measured from the previous job (km is blank when a reading is missing or went down). Prev. engineer / SA are the people the repeat counts against.",
  emptyMessage: "No repeat jobs in this period",
};

// ── R2. Repeat job analysis ─────────────────────────────────────────────────────

const BY_LABEL: Record<string, string> = { model: "Model", variant: "Variant", serviceAdvisor: "Service advisor (previous job)", engineer: "Engineer (previous job)" };

const countColumns = (data: ReportResponse): ReportColumn[] => [
  { key: "jobs", label: "Jobs", format: "integer", totalFormat: "integer" },
  { key: "repeats", label: "Repeats", format: "integer" },
  { key: "repeatPct", label: "Repeat %", format: "percent" },
  { key: "pending", label: "Pending", format: "integer" },
  { key: "confirmed", label: "Confirmed", format: "integer" },
  ...(data.columns ?? []).map((column) => ({ key: column.key, label: column.label, format: "integer" as const, className: "min-w-24" })),
];

function RankedBars({ data }: { data: ReportResponse }) {
  const ranked = data.groups.filter((group) => (group.totals.jobs ?? 0) > 0).sort((a, b) => (b.totals.repeatPct ?? 0) - (a.totals.repeatPct ?? 0)).slice(0, 8);
  if (ranked.length < 2) return null;
  const top = Math.max(...ranked.map((group) => group.totals.repeatPct ?? 0), 1);
  return (
    <section className="rounded-xl border border-border bg-card p-4 print:hidden">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">Highest repeat %</h3>
      <ul className="space-y-2">
        {ranked.map((group) => (
          <li key={group.key} className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate text-slate-700" title={group.label}>{group.label}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <span className="block h-full rounded-full bg-red-500" style={{ width: `${((group.totals.repeatPct ?? 0) / top) * 100}%` }} />
            </span>
            <span className="tabular-nums text-slate-600">
              {pct(group.totals.repeatPct)} <span className="text-xs text-muted-foreground">({group.totals.repeats ?? 0}/{group.totals.jobs ?? 0})</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const analysis: ReportConfig = {
  slug: "repeat-analysis",
  title: "Repeat job analysis",
  description: "Repeat % and reason counts by model, variant, or the previous job's service advisor or engineer.",
  category: "Service · Repeat jobs",
  subgroup: GROUP,
  permission: "report:repeat-analysis",
  width: 132,
  icon: BarChart3,
  period: { kind: "range", label: "Job date", presets: RANGE_PRESETS, defaultPreset: "thisMonth" },
  filters: [],
  options: [
    {
      kind: "segmented",
      key: "by",
      label: "Analyse by",
      choices: [
        { value: "model", label: "Model" },
        { value: "variant", label: "Variant" },
        { value: "serviceAdvisor", label: "Service advisor" },
        { value: "engineer", label: "Engineer" },
      ],
      default: "model",
      hint: "Service advisor and engineer are the previous job's: the people responsible for the work being repeated.",
    },
  ],
  hasMode: true,
  defaultMode: "both",
  modeChoices: [
    { value: "both", label: "Detail with summary" },
    { value: "detail", label: "Detail" },
    { value: "summary", label: "Only summary" },
  ],
  columns: repeatColumns,
  columnsFor: (data, options) =>
    options.mode === "summary"
      ? [{ key: "groupLabel", label: BY_LABEL[options.by] ?? "Group", className: "min-w-48" }, ...countColumns(data)]
      : [jobColumn({ withDate: true }), registrationColumn(), previousJobColumn, { key: "daysDifference", label: "Days", format: "integer" }, { key: "kmDifference", label: "Km", format: "integer" }, peopleColumn("previousEngineer", "Prev. engineer / SA", "previousServiceAdvisor", "SA"), statusColumn, ...countColumns(data)],
  noun: ["repeat job", "repeat jobs"],
  subtotalLabel: (group) => group.label,
  totalLabel: () => "All groups",
  summaryCards: (data) => [
    { label: "Jobs opened", value: fmtNumber(data.totals.jobs ?? 0, "integer"), tone: "blue" },
    { label: "Repeat jobs", value: fmtNumber(data.totals.repeats ?? 0, "integer"), sub: "Confirmed and pending", tone: "red" },
    { label: "Repeat %", value: pct(data.totals.repeatPct), tone: "orange" },
    { label: "Pending review", value: fmtNumber(data.totals.pending ?? 0, "integer"), tone: "amber", muted: !data.totals.pending },
  ],
  extra: (data) => <RankedBars data={data} />,
  footnote: "Jobs = jobs opened in the period by each group (for advisors and engineers, the jobs they handled). Repeats exclude jobs reviewed as \"not a repeat job\". A job can have several reasons, so reason columns can add up to more than the repeats.",
  emptyMessage: "No jobs in this period",
};

// ── R3. Date-wise summary ───────────────────────────────────────────────────────

const dateSummary: ReportConfig = {
  slug: "repeat-summary",
  title: "Date-wise summary of repeat jobs",
  description: "Jobs opened, repeats and repeat % per day, with pending, confirmed and not-a-repeat counts.",
  category: "Service · Repeat jobs",
  subgroup: GROUP,
  permission: "report:repeat-summary",
  width: 80,
  icon: CalendarDays,
  period: { kind: "range", label: "Job date", presets: RANGE_PRESETS, defaultPreset: "thisMonth" },
  filters: ["model", "variant", "receivedBy", "engineer"],
  filterLabels: { receivedBy: "Service advisor" },
  columns: [
    { key: "day", label: "Date", format: "date" },
    { key: "jobs", label: "Jobs opened", format: "integer" },
    { key: "repeats", label: "Repeats", format: "integer" },
    { key: "repeatPct", label: "Repeat %", format: "percent" },
    { key: "pending", label: "Pending", format: "integer" },
    { key: "confirmed", label: "Confirmed", format: "integer" },
    { key: "notRepeat", label: "Not a repeat", format: "integer" },
  ],
  noun: ["day", "days"],
  totalLabel: () => "Grand total",
  rowTone: (row) => (Number(row.repeatPct ?? 0) >= 10 ? "red" : undefined),
  summaryCards: (data) => [
    { label: "Jobs opened", value: fmtNumber(data.totals.jobs ?? 0, "integer"), tone: "blue" },
    { label: "Repeat jobs", value: fmtNumber(data.totals.repeats ?? 0, "integer"), tone: "red" },
    { label: "Repeat %", value: pct(data.totals.repeatPct), tone: "orange" },
    { label: "Not a repeat", value: fmtNumber(data.totals.notRepeat ?? 0, "integer"), tone: "gray", muted: !data.totals.notRepeat },
  ],
  footnote: "Service advisor and engineer filters select jobs opened by them, and repeats of jobs they handled before. Days of 10% or more are highlighted.",
  emptyMessage: "No jobs in this period",
};

export const REPEAT_CONFIGS: ReportConfig[] = [repeatList, analysis, dateSummary];

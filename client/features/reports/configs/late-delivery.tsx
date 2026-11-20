import { BarChart3, CalendarClock, Clock3, ListOrdered, Timer } from "lucide-react";
import { LateKindBadge, LateReasonChips, type ReasonChip } from "@/features/late-deliveries/components/late-ui";
import { LATE_PERMISSIONS, lateByText } from "@/features/late-deliveries/lib/late-delivery.logic";
import type { LateKind } from "@/features/late-deliveries/types/late-delivery.types";
import { fmtDate, fmtNumber, fmtTime } from "../lib/report-format";
import type { ReportColumn, ReportConfig, ReportResponse, ReportRow } from "../types";
import { jobColumn, modelColumn, RANGE_PRESETS, registrationColumn, str } from "./shared";

const CATEGORY = "Service · Late deliveries" as const;
const DETAIL = "Discrepancy reports";
const ANALYSIS = "Analysis and lists";
const PERIOD_HINT = "Filters the promised date. Late status comes from the stored promise and delivery date-times (Lagos time), so a past period always gives the same answer.";
const RULE = "Late by date = delivered on a later day than promised. Late by time = delivered on the promised day after the promised time. Only delivered jobs count.";

const reasonsOf = (row: ReportRow) => (Array.isArray(row.reasons) ? (row.reasons as ReasonChip[]) : []);
const kindOf = (row: ReportRow) => str(row, "lateKind") as LateKind;
const num = (value: unknown) => (typeof value === "number" ? value : Number(value ?? 0));
const pct = (value: number | undefined) => `${fmtNumber(value ?? 0, "percent")}`;
const lateBy = (row: ReportRow) => lateByText(kindOf(row), num(row.daysLate), num(row.minutesLate));

const reasonsColumn: ReportColumn = {
  key: "reasons",
  label: "Reasons",
  className: "min-w-52",
  value: (row) => reasonsOf(row).map((reason) => reason.code).join(","),
  text: (row) => reasonsOf(row).map((reason) => `${reason.code} ${reason.description}`).join("; ") || "No reason recorded",
  render: (row) => <LateReasonChips reasons={reasonsOf(row)} dense empty={<span className="text-xs font-medium text-amber-700">No reason recorded</span>} />,
};

const remarksColumn: ReportColumn = { key: "remarks", label: "Remarks", className: "min-w-48 text-xs" };

const lateByColumn: ReportColumn = {
  key: "lateBy",
  label: "Late by",
  align: "right",
  value: (row) => num(row.minutesLate),
  text: lateBy,
  render: (row) => <span className={kindOf(row) === "DATE" ? "font-semibold text-red-700" : "font-semibold text-amber-700"}>{lateBy(row)}</span>,
};

const advisorColumn: ReportColumn = { key: "receivedBy", label: "Service advisor" };
const serviceTypeColumn: ReportColumn = { key: "serviceType", label: "Service type" };
const noReason = (row: ReportRow) => (reasonsOf(row).length ? undefined : ("amber" as const));

function summaryCards(data: ReportResponse, kind: LateKind) {
  return [
    { label: "Delivered", value: fmtNumber(data.totals.delivered ?? 0, "integer"), sub: "With a promise, in the period", tone: "blue" as const },
    { label: kind === "DATE" ? "Late by date" : "Late by time", value: fmtNumber(data.totals.late ?? 0, "integer"), tone: "red" as const },
    { label: "Late %", value: pct(data.totals.latePct), tone: "orange" as const },
    {
      label: kind === "DATE" ? "Average days late" : "Average delay",
      value: kind === "DATE" ? fmtNumber(data.totals.avgLate ?? 0, "number") : lateByText("TIME", 0, data.totals.avgLate ?? 0),
      tone: "amber" as const,
      muted: !data.totals.late,
    },
  ];
}

const allDatesSubtitle = (data: ReportResponse) => {
  const query = data.filters.query as Record<string, unknown>;
  const all = query.allDates === true || query.allDates === "true";
  return all ? "Promised date: all dates" : `Promised date ${fmtDate(`${query.from}T12:00:00Z`)} to ${fmtDate(`${query.to}T12:00:00Z`)}`;
};

// ── 3.1 / 3.2 Discrepancy reports ───────────────────────────────────────────────

function discrepancy(kind: LateKind): ReportConfig {
  const date = kind === "DATE";
  const columns: ReportColumn[] = [
    jobColumn({ withDate: true }),
    registrationColumn(),
    modelColumn(),
    serviceTypeColumn,
    advisorColumn,
    date ? { key: "promisedAt", label: "Promised", format: "datetime" } : { key: "promisedAt", label: "Promised date", format: "date" },
    date ? { key: "deliveredAt", label: "Delivered", format: "datetime" } : { key: "promisedTime", label: "Promised time", text: (row) => fmtTime(row.promisedAt), value: (row) => str(row, "promisedAt") },
    ...(date ? [] : [{ key: "deliveredTime", label: "Delivered time", text: (row: ReportRow) => fmtTime(row.deliveredAt), value: (row: ReportRow) => str(row, "deliveredAt") }]),
    date ? { key: "daysLate", label: "Days late", format: "integer", totalKey: "avgLate", totalFormat: "number" } : lateByColumn,
    reasonsColumn,
    remarksColumn,
  ];
  return {
    slug: date ? "promise-date-discrepancy" : "promise-time-discrepancy",
    title: date ? "Promised date discrepancy report" : "Promised time discrepancy report",
    description: date
      ? "Jobs delivered on a later day than promised, with days late, reasons and remarks; summary by model, service type and reason."
      : "Jobs delivered later than the promised time on the promised day, with the delay, reasons and remarks; summary by model, service type and reason.",
    category: CATEGORY,
    subgroup: DETAIL,
    permission: date ? LATE_PERMISSIONS.DATE_DISCREPANCY : LATE_PERMISSIONS.TIME_DISCREPANCY,
    width: 132,
    icon: date ? CalendarClock : Clock3,
    period: { kind: "range", label: "Promised date", presets: RANGE_PRESETS, defaultPreset: "thisMonth", hint: PERIOD_HINT },
    filters: ["model", "variant", "serviceType", "serviceGroup", "receivedBy"],
    filterLabels: { receivedBy: "Service advisor" },
    options: [
      {
        kind: "select",
        key: "jobType",
        label: "Job type",
        choices: [
          { value: "BOTH", label: "All" },
          { value: "REGULAR", label: "Regular jobs" },
          { value: "PDI", label: "PDI jobs" },
        ],
        default: "BOTH",
      },
      { kind: "checkbox", key: "allDates", label: "All promised dates (ignore the period)", hint: "The legacy \"All\" next to the dates." },
    ],
    hasMode: true,
    defaultMode: "both",
    modeChoices: [
      { value: "both", label: "Detail with summary" },
      { value: "summary", label: "Summary only" },
      { value: "detail", label: "Detail only" },
    ],
    columns,
    noun: ["late job", "late jobs"],
    rowTone: noReason,
    subtitle: allDatesSubtitle,
    totalLabel: (data) => (date ? `${fmtNumber(data.totals.late ?? 0, "integer")} late jobs · average days late` : `${fmtNumber(data.totals.late ?? 0, "integer")} late jobs`),
    summaryCards: (data) => summaryCards(data, kind),
    footnote: `${RULE} Rows without a reason are highlighted; record reasons on the ${date ? "promise date" : "promise time"} details screen.`,
    emptyMessage: date ? "No job was delivered late by date in this period" : "No job was delivered late by time in this period",
  };
}

// ── 3.3 / 3.4 Delayed delivery analysis ─────────────────────────────────────────

function analysis(kind: LateKind): ReportConfig {
  const date = kind === "DATE";
  return {
    slug: date ? "promise-date-analysis" : "promise-time-analysis",
    title: date ? "Promised date delayed delivery analysis" : "Promised time delayed delivery analysis",
    description: `Late-by-${date ? "date" : "time"} jobs broken down by reason, with a line for jobs with no reason recorded.`,
    category: CATEGORY,
    subgroup: ANALYSIS,
    permission: date ? LATE_PERMISSIONS.DATE_ANALYSIS : LATE_PERMISSIONS.TIME_ANALYSIS,
    width: 80,
    icon: date ? BarChart3 : Timer,
    period: { kind: "range", label: "Promised date", presets: RANGE_PRESETS, defaultPreset: "thisMonth", hint: PERIOD_HINT },
    filters: [],
    columns: [
      { key: "label", label: "Reason", text: (row) => (str(row, "code") ? `${str(row, "code")} ${str(row, "label")}` : str(row, "label")), className: "min-w-56" },
      { key: "late", label: "Late jobs", format: "integer" },
      { key: "lateShare", label: "% of late jobs", format: "percent" },
      date
        ? { key: "avgLate", label: "Avg days late", format: "number" }
        : { key: "avgLate", label: "Avg delay", align: "right", text: (row) => lateByText("TIME", 0, num(row.avgLate)), value: (row) => num(row.avgLate) },
    ],
    noun: ["reason", "reasons"],
    rowTone: (row) => (str(row, "id") === "none" && num(row.late) > 0 ? "amber" : undefined),
    totalLabel: (data) => `Late jobs (${fmtNumber(data.totals.late ?? 0, "integer")} of ${fmtNumber(data.totals.delivered ?? 0, "integer")} delivered, ${pct(data.totals.latePct)})`,
    summaryCards: (data) => summaryCards(data, kind),
    extra: (data) => <ReasonBars data={data} />,
    footnote: `${RULE} A job with several reasons counts under each, so the reason lines can add up to more than the late jobs.`,
    emptyMessage: `No job was delivered late by ${date ? "date" : "time"} in this period`,
  };
}

function ReasonBars({ data }: { data: ReportResponse }) {
  const lines = data.rows.filter((row) => num(row.late) > 0).sort((a, b) => num(b.late) - num(a.late));
  if (!lines.length) return null;
  const top = Math.max(...lines.map((row) => num(row.late)), 1);
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">Why jobs were late</h3>
      <ul className="space-y-2">
        {lines.map((row) => (
          <li key={str(row, "id")} className="grid grid-cols-[minmax(0,14rem)_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate text-slate-700" title={str(row, "label")}>
              {str(row, "code") && <span className="mr-1.5 font-mono text-xs text-muted-foreground">{str(row, "code")}</span>}
              {str(row, "label")}
            </span>
            <span className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <span className={`block h-full rounded-full ${str(row, "id") === "none" ? "bg-slate-400" : "bg-red-500"}`} style={{ width: `${(num(row.late) / top) * 100}%` }} />
            </span>
            <span className="tabular-nums text-slate-600">
              {num(row.late)} <span className="text-xs text-muted-foreground">({pct(num(row.lateShare))})</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── 3.5 List of delayed deliveries ─────────────────────────────────────────────

const delayedList: ReportConfig = {
  slug: "delayed-deliveries",
  title: "List of delayed deliveries",
  description: "Every job delivered late, by date or by time, in one list with how late and the reasons.",
  category: CATEGORY,
  subgroup: ANALYSIS,
  permission: LATE_PERMISSIONS.DELAYED_LIST,
  width: 132,
  icon: ListOrdered,
  period: { kind: "range", label: "Promised date", presets: RANGE_PRESETS, defaultPreset: "thisMonth", hint: PERIOD_HINT },
  filters: [],
  columns: [
    jobColumn({ withDate: true }),
    registrationColumn(),
    modelColumn(),
    { key: "promisedAt", label: "Promised", format: "datetime" },
    { key: "deliveredAt", label: "Delivered", format: "datetime" },
    {
      key: "lateKind",
      label: "Late by",
      text: (row) => (kindOf(row) === "DATE" ? "Date" : "Time"),
      render: (row) => <LateKindBadge kind={kindOf(row)} />,
    },
    lateByColumn,
    reasonsColumn,
  ],
  noun: ["delayed delivery", "delayed deliveries"],
  rowTone: noReason,
  totalLabel: (data) => `${fmtNumber(data.totals.count ?? 0, "integer")} delayed · ${data.totals.dateLate ?? 0} by date · ${data.totals.timeLate ?? 0} by time`,
  summaryCards: (data) => [
    { label: "Delayed deliveries", value: fmtNumber(data.totals.count ?? 0, "integer"), tone: "red" },
    { label: "Late by date", value: fmtNumber(data.totals.dateLate ?? 0, "integer"), tone: "orange", muted: !data.totals.dateLate },
    { label: "Late by time", value: fmtNumber(data.totals.timeLate ?? 0, "integer"), tone: "amber", muted: !data.totals.timeLate },
  ],
  footnote: `${RULE} Rows without a reason are highlighted.`,
  emptyMessage: "No job was delivered late in this period",
};

export const LATE_DELIVERY_CONFIGS: ReportConfig[] = [discrepancy("DATE"), discrepancy("TIME"), analysis("DATE"), analysis("TIME"), delayedList];

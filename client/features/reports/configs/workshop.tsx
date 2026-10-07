import { Activity, Car, ClipboardList, Layers, Timer } from "lucide-react";
import { REPORT_PERMISSIONS } from "@/features/auth/roles";
import { cn } from "@/lib/utils";
import { fmtDuration, fmtMoney, fmtNumber } from "../lib/report-format";
import type { ReportConfig, ReportResponse, ReportRow, SummaryCard } from "../types";
import {
  addressColumns,
  count,
  jobColumn,
  JOB_STATUS,
  modelColumn,
  printAddressOption,
  RANGE_PRESETS,
  registrationColumn,
  statusColumn,
  STD_FILTERS,
  STD_WITH_DELIVERED,
  str,
} from "./shared";

const BASIS = (initial: "job" | "bill") => ({
  key: "basis",
  default: initial,
  choices: initial === "bill" ? [{ value: "bill", label: "Bill date" }, { value: "job", label: "Job date" }] : [{ value: "job", label: "Job date" }, { value: "bill", label: "Bill date" }],
});

function topServiceTypes(data: ReportResponse, limit = 4): SummaryCard[] {
  const tones: SummaryCard["tone"][] = ["emerald", "blue", "amber", "red"];
  return (data.breakdown ?? []).slice(0, limit).map((item, index) => ({ label: item.label, value: fmtNumber(item.count, "integer"), tone: tones[index % tones.length] }));
}

// ── 3. List of job cards open ───────────────────────────────────────────────

export const jobCardsOpenConfig: ReportConfig = {
  slug: "job-cards-open",
  title: "List of job cards open",
  description: "Job cards opened in a date range.",
  category: "Workshop",
  permission: REPORT_PERMISSIONS.JOB_CARDS_OPEN,
  width: 80,
  icon: ClipboardList,
  period: { kind: "range", label: "Job date", presets: RANGE_PRESETS, defaultPreset: "thisWeek" },
  filters: STD_FILTERS,
  options: [printAddressOption],
  noun: ["job card", "job cards"],
  columns: [
    jobColumn(),
    { key: "jobDate", label: "Opened", format: "datetime" },
    registrationColumn(true),
    { key: "customer", label: "Customer", className: "min-w-40" },
    ...addressColumns(),
    modelColumn(),
    { key: "serviceType", label: "Service type" },
    { key: "mileage", label: "Mileage (km)", format: "integer" },
    { key: "receivedBy", label: "Received by" },
    { key: "team", label: "Team" },
    statusColumn(),
    { key: "promisedAt", label: "Promised", format: "datetime" },
  ],
  summaryCards: (data) => [{ label: "Job cards", value: fmtNumber(count(data), "integer"), tone: "blue" }, ...topServiceTypes(data)],
  totalLabel: (data) =>
    `Total ${fmtNumber(count(data), "integer")} job cards${(data.breakdown ?? []).length ? ` · ${(data.breakdown ?? []).map((item) => `${item.label} ${item.count}`).join(" · ")}` : ""}`,
};

// ── 4. Workshop status (as on) ──────────────────────────────────────────────

const STATUS_CARDS: { key: string; label: string; tone: SummaryCard["tone"] }[] = [
  { key: "OPEN", label: "Open", tone: "gray" },
  { key: "IN_PROGRESS", label: "In progress", tone: "blue" },
  { key: "QC", label: "QC", tone: "purple" },
  { key: "READY", label: "Ready", tone: "emerald" },
  { key: "BILLED", label: "Billed – not delivered", tone: "amber" },
  { key: "DELIVERED", label: "Delivered", tone: "emerald" },
];
const BAR: Record<string, string> = { OPEN: "bg-slate-400", IN_PROGRESS: "bg-blue-500", QC: "bg-purple-500", READY: "bg-emerald-500", BILLED: "bg-amber-400", DELIVERED: "bg-emerald-300" };

function StatusProportions({ data }: { data: ReportResponse }) {
  const summary = data.summary ?? {};
  const undeliveredOnly = (data.filters.query as Record<string, string>).undeliveredOnly === "true";
  const parts = STATUS_CARDS.filter((card) => !(undeliveredOnly && card.key === "DELIVERED")).map((card) => ({ ...card, value: Number(summary[card.key] ?? 0) }));
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  if (!total) return null;
  return (
    <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={parts.map((part) => `${part.label} ${part.value}`).join(", ")}>
      {parts.map((part) => (part.value ? <div key={part.key} className={BAR[part.key]} style={{ width: `${(part.value / total) * 100}%` }} /> : null))}
    </div>
  );
}

export const workshopStatusConfig: ReportConfig = {
  slug: "workshop-status",
  title: "Workshop status report",
  description: "Pending and delivered jobs as on a date. Status is shown as it was on that date.",
  category: "Workshop",
  permission: REPORT_PERMISSIONS.WORKSHOP_STATUS,
  width: 132,
  icon: Activity,
  period: { kind: "date", label: "As on", dateLabel: "As on", presets: ["today", "yesterday"], defaultPreset: "today", hint: "Status is reconstructed from job history for this date" },
  filters: STD_WITH_DELIVERED,
  options: [{ kind: "checkbox", key: "undeliveredOnly", label: "Only undelivered vehicles" }],
  hasMode: true,
  noun: ["job", "jobs"],
  columns: [
    jobColumn({ withDate: true }),
    registrationColumn(),
    { key: "customer", label: "Customer", className: "min-w-36" },
    modelColumn(false),
    { key: "serviceType", label: "Service type" },
    { key: "receivedBy", label: "Received by" },
    statusColumn("statusAsOn", "Status as on"),
    { key: "promisedAt", label: "Promised", format: "datetime" },
    { key: "readyAt", label: "Ready at", format: "datetime" },
    { key: "billNumber", label: "Bill no" },
    { key: "billDate", label: "Bill date", format: "date" },
    { key: "billAmount", label: "Bill amount", format: "money" },
    { key: "deliveredAt", label: "Delivered", format: "datetime" },
    { key: "deliveredBy", label: "Delivered by" },
    {
      key: "daysOpen",
      label: "Days open",
      format: "integer",
      render: (row) => <span className={cn("font-semibold tabular-nums", Number(row.daysOpen) > 7 && "text-red-600")}>{fmtNumber(row.daysOpen, "integer")}</span>,
    },
  ],
  summaryCards: (data, options) =>
    STATUS_CARDS.map((card) => ({
      label: card.label,
      value: fmtNumber(Number(data.summary?.[card.key] ?? 0), "integer"),
      tone: card.tone,
      muted: card.key === "DELIVERED" && options.undeliveredOnly === "true",
    })),
  extra: (data) => <StatusProportions data={data} />,
  subtotalLabel: (group) => `Subtotal — ${group.label} · ${group.count} ${group.count === 1 ? "job" : "jobs"}`,
  totalLabel: (data) => {
    const query = data.filters.query as Record<string, string>;
    return `Grand total · ${fmtNumber(count(data), "integer")} ${query.undeliveredOnly === "true" ? "undelivered " : ""}jobs`;
  },
};

// ── 5. Workshop progress ────────────────────────────────────────────────────

const PROMISE_TONE: Record<string, "red" | "amber" | "orange" | undefined> = { OVERDUE: "red", DUE_SOON: "amber", DELIVERED_LATE: "orange" };

function promiseText(row: ReportRow): string {
  const minutes = typeof row.minutesToPromise === "number" ? row.minutesToPromise : null;
  switch (row.promiseState) {
    case "OVERDUE":
      return row.readyAt ? `Ready late ${fmtDuration(minutes ?? 0)}` : `Overdue ${fmtDuration(minutes ?? 0)}`;
    case "DUE_SOON":
      return `Due in ${fmtDuration(minutes ?? 0)}`;
    case "ON_TIME":
      return row.readyAt ? "Ready on time" : `${fmtDuration(minutes ?? 0)} left`;
    case "DELIVERED_LATE":
      return `Late ${fmtDuration(minutes ?? 0)}`;
    case "DELIVERED_ON_TIME":
      return "Delivered on time";
    default:
      return "No promise time";
  }
}

const PILL: Record<string, string> = {
  OVERDUE: "border-red-200 bg-red-50 text-red-700",
  DUE_SOON: "border-amber-200 bg-amber-50 text-amber-700",
  DELIVERED_LATE: "border-orange-200 bg-orange-50 text-orange-700",
  DELIVERED_ON_TIME: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export const workshopProgressConfig: ReportConfig = {
  slug: "workshop-progress",
  title: "Workshop progress report",
  description: "Jobs nearing their promise time or already overdue.",
  category: "Workshop",
  permission: REPORT_PERMISSIONS.WORKSHOP_PROGRESS,
  width: 132,
  icon: Timer,
  period: { kind: "range", label: "Job date", presets: RANGE_PRESETS, defaultPreset: "thisWeek", basis: BASIS("job") },
  filters: STD_WITH_DELIVERED,
  options: [printAddressOption, { kind: "number", key: "dueSoonHours", label: "Due soon within", suffix: "hours", min: 0, max: 72, default: 2, settingDefault: "dueSoonHours" }],
  hasMode: true,
  noun: ["job", "jobs"],
  columns: [
    jobColumn({ withDate: true }),
    registrationColumn(),
    { key: "customer", label: "Customer", className: "min-w-36" },
    ...addressColumns(),
    modelColumn(false),
    { key: "serviceType", label: "Service type" },
    { key: "team", label: "Team" },
    { key: "promisedAt", label: "Promised", format: "datetime" },
    statusColumn(),
    { key: "readyAt", label: "Ready", format: "datetime" },
    { key: "deliveredAt", label: "Delivered", format: "datetime" },
    {
      key: "minutesToPromise",
      label: "Time to promise",
      text: promiseText,
      value: (row) => (typeof row.minutesToPromise === "number" ? row.minutesToPromise : null),
      render: (row) => {
        const pill = PILL[str(row, "promiseState")];
        return pill ? (
          <span className={cn("inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold", pill)}>{promiseText(row)}</span>
        ) : (
          <span className="whitespace-nowrap text-sm text-muted-foreground">{promiseText(row)}</span>
        );
      },
    },
    { key: "lateReasons", label: "Late reasons", className: "min-w-32 text-xs" },
  ],
  rowTone: (row) => PROMISE_TONE[str(row, "promiseState")],
  summaryCards: (data) => {
    const s = data.summary ?? {};
    const cards: SummaryCard[] = [
      { label: "On time", value: fmtNumber(Number(s.ON_TIME ?? 0), "integer"), tone: "emerald" },
      { label: "Due soon", value: fmtNumber(Number(s.DUE_SOON ?? 0), "integer"), tone: "amber", sub: `within ${s.dueSoonHours ?? 2}h` },
      { label: "Overdue", value: fmtNumber(Number(s.OVERDUE ?? 0), "integer"), tone: "red" },
      { label: "Delivered late", value: fmtNumber(Number(s.DELIVERED_LATE ?? 0), "integer"), tone: "orange" },
      { label: "Delivered on time", value: fmtNumber(Number(s.DELIVERED_ON_TIME ?? 0), "integer"), tone: "emerald" },
    ];
    if (Number(s.NO_PROMISE ?? 0) > 0) cards.push({ label: "No promise time", value: fmtNumber(Number(s.NO_PROMISE), "integer"), tone: "gray" });
    return cards;
  },
  footnote: "Red: past the promise time and not ready. Amber: due within the chosen hours. Ready jobs are judged by when they became ready.",
};

// ── 6. Service-wise workshop progress ───────────────────────────────────────

function ServiceWiseSummary({ data }: { data: ReportResponse }) {
  if (!data.groups.length) return null;
  const rate = (onTime: number, late: number) => (onTime + late ? Math.round((onTime / (onTime + late)) * 100) : null);
  const max = Math.max(...data.groups.map((group) => (group.totals.onTime ?? 0) + (group.totals.late ?? 0)), 1);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <section className="overflow-hidden rounded-xl border border-[#e8edf3] bg-white shadow-sm" aria-label="Progress by service type">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-[#f8fafc] text-slate-500">
              <tr>
                {["Service type", "Opened", "Ready", "Billed", "Delivered", "On time", "Late", "On-time %", "Labour billed", "Parts billed"].map((label, index) => (
                  <th key={label} scope="col" className={cn("whitespace-nowrap px-3 py-2.5 font-semibold", index === 0 ? "text-left" : "text-right")}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...data.groups.map((group) => ({ key: group.key, label: group.label, totals: group.totals })), { key: "__total", label: "Total", totals: data.totals }].map((item) => {
                const t = item.totals;
                const pct = rate(t.onTime ?? 0, t.late ?? 0);
                const total = item.key === "__total";
                return (
                  <tr key={item.key} className={cn("border-t border-[#e8edf3]", total && "bg-slate-50 font-semibold")}>
                    <td className="px-3 py-2.5">{item.label}</td>
                    {["count", "ready", "billed", "delivered", "onTime", "late"].map((key) => (
                      <td key={key} className="px-3 py-2.5 text-right tabular-nums">{fmtNumber(t[key] ?? 0, "integer")}</td>
                    ))}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <span className="w-10 text-right tabular-nums">{pct === null ? "—" : `${pct}%`}</span>
                        <span className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full bg-emerald-500" style={{ width: `${pct ?? 0}%` }} />
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{fmtMoney(t.labourBilled ?? 0)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{fmtMoney(t.partsBilled ?? 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-xl border border-[#e8edf3] bg-white p-4 shadow-sm" aria-label="Delivered on time versus late by service type">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Delivered on time vs late</h2>
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-emerald-500" />On time</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-orange-500" />Late</span>
          </div>
        </div>
        <div className="grid gap-2.5">
          {data.groups.map((group) => {
            const onTime = group.totals.onTime ?? 0;
            const late = group.totals.late ?? 0;
            return (
              <div key={group.key} className="grid grid-cols-[7.5rem_1fr] items-center gap-2 text-xs">
                <span className="truncate text-slate-600" title={group.label}>{group.label}</span>
                <div className="flex h-5 overflow-hidden rounded" style={{ width: `${((onTime + late) / max) * 100}%` }} aria-label={`${group.label}: ${onTime} on time, ${late} late`}>
                  {onTime > 0 && <span className="flex items-center justify-center bg-emerald-500 font-semibold text-white" style={{ flex: onTime }}>{onTime}</span>}
                  {late > 0 && <span className="flex items-center justify-center bg-orange-500 font-semibold text-white" style={{ flex: late }}>{late}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export const serviceWiseProgressConfig: ReportConfig = {
  slug: "service-wise-progress",
  title: "Service-wise workshop progress",
  description: "Workshop progress grouped by service type over a period.",
  category: "Workshop",
  permission: REPORT_PERMISSIONS.SERVICE_WISE_PROGRESS,
  width: 132,
  icon: Layers,
  period: { kind: "range", label: "Bill date", presets: RANGE_PRESETS, defaultPreset: "lastMonth", basis: BASIS("bill") },
  filters: STD_WITH_DELIVERED,
  hasMode: true,
  defaultMode: "summary",
  noun: ["job", "jobs"],
  columns: [
    jobColumn({ withDate: true }),
    registrationColumn(),
    modelColumn(false),
    { key: "customer", label: "Customer", className: "min-w-36" },
    statusColumn(),
    { key: "promisedAt", label: "Promised", format: "datetime" },
    { key: "readyAt", label: "Ready", format: "datetime", totalKey: "ready", totalFormat: "integer" },
    { key: "billDate", label: "Billed", format: "date", totalKey: "billed", totalFormat: "integer" },
    { key: "deliveredAt", label: "Delivered", format: "datetime", totalKey: "delivered", totalFormat: "integer" },
    { key: "onTimeFlag", label: "On time", text: (row) => (row.onTime ? "Yes" : ""), value: (row) => Number(row.onTime ?? 0), totalKey: "onTime", totalFormat: "integer", align: "right" },
    { key: "lateFlag", label: "Late", text: (row) => (row.late ? "Yes" : ""), value: (row) => Number(row.late ?? 0), totalKey: "late", totalFormat: "integer", align: "right" },
    { key: "labourBilled", label: "Labour billed", format: "money" },
    { key: "partsBilled", label: "Parts billed", format: "money" },
  ],
  summaryCards: (data) => {
    const t = data.totals;
    const decided = (t.onTime ?? 0) + (t.late ?? 0);
    return [
      { label: "Jobs", value: fmtNumber(t.count ?? 0, "integer"), tone: "blue" },
      { label: "Delivered", value: fmtNumber(t.delivered ?? 0, "integer"), tone: "emerald" },
      { label: "On-time rate", value: decided ? `${Math.round(((t.onTime ?? 0) / decided) * 100)}%` : "—", tone: "emerald", sub: `${t.late ?? 0} late` },
      { label: "Labour billed", value: fmtMoney(t.labourBilled ?? 0), tone: "purple" },
      { label: "Parts billed", value: fmtMoney(t.partsBilled ?? 0), tone: "orange" },
    ];
  },
  extra: (data) => <ServiceWiseSummary data={data} />,
  subtotalLabel: (group) => `${group.label} · ${group.count} ${group.count === 1 ? "job" : "jobs"}`,
  footnote: "Labour and parts billed are net of discount. On time / late compares delivery with the promise date and time.",
};

// ── 7. Vehicles to be ready ─────────────────────────────────────────────────

export const vehiclesToBeReadyConfig: ReportConfig = {
  slug: "vehicles-to-be-ready",
  title: "Vehicles to be ready",
  description: "Vehicles promised for a given day, so the floor can plan.",
  category: "Workshop",
  permission: REPORT_PERMISSIONS.VEHICLES_TO_BE_READY,
  width: 80,
  icon: Car,
  period: { kind: "date", label: "Promised for", dateLabel: "Promised for", presets: ["today", "tomorrow"], defaultPreset: "today" },
  filters: STD_FILTERS,
  noun: ["vehicle", "vehicles"],
  columns: [
    { key: "promisedAt", label: "Promised", format: "time", className: "font-semibold" },
    jobColumn(),
    registrationColumn(),
    modelColumn(false),
    { key: "serviceType", label: "Service type" },
    { key: "customer", label: "Customer", className: "min-w-36" },
    { key: "customerPhone", label: "Phone", className: "whitespace-nowrap" },
    { key: "team", label: "Team" },
    statusColumn(),
    { key: "readyAt", label: "Ready at", format: "time" },
  ],
  rowTone: (row) => (row.atRisk ? "red" : undefined),
  summaryCards: (data) => {
    const s = data.summary ?? {};
    return [
      { label: "Promised", value: fmtNumber(Number(s.promised ?? 0), "integer"), tone: "gray" },
      { label: "Ready", value: fmtNumber(Number(s.ready ?? 0), "integer"), tone: "emerald" },
      { label: "Still in work", value: fmtNumber(Number(s.inWork ?? 0), "integer"), tone: "blue" },
      { label: "At risk", value: fmtNumber(Number(s.atRisk ?? 0), "integer"), tone: "red", sub: "past promise time" },
    ];
  },
  footnote: "Delivered vehicles are left out. Red rows are past their promise time and not yet ready.",
  emptyMessage: "No vehicles are promised for this day",
};

export const WORKSHOP_CONFIGS = [jobCardsOpenConfig, workshopStatusConfig, workshopProgressConfig, serviceWiseProgressConfig, vehiclesToBeReadyConfig];

export { JOB_STATUS };

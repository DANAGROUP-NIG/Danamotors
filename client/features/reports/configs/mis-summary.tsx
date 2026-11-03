import { CalendarRange, ChartPie, Grid3x3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtMoney, fmtNumber, formatValue, plural } from "../lib/report-format";
import type { ReportColumn, ReportConfig, ReportResponse, ReportRow } from "../types";
import { CATEGORY_FILL, dataColumns, heatClass, jobTypeOption, labelColumn, matrixIndent, matrixRowStyle, MIS_GROUPS, SERVICE_CATEGORIES, ShareBars } from "./mis-shared";
import { MonthlyTrend } from "../components/mis/MonthlyTrend";
import { RANGE_PRESETS, str } from "./shared";

function monthsBetween(from: string, to: string): number {
  return (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1;
}

// ── S1. Monthly information report ─────────────────────────────────────────────

const total = (data: ReportResponse, id: string) => Number(data.rows.find((row) => row.id === id)?.total ?? 0);

const misMonthly: ReportConfig = {
  slug: "mis-monthly",
  title: "Monthly information report",
  description: "Month-by-month vehicles, labour, spares, oil and service charge by service category, with an optional annexure by service type.",
  category: "Service MIS",
  subgroup: MIS_GROUPS.summary,
  permission: "report:mis-monthly",
  width: 132,
  icon: CalendarRange,
  period: { kind: "none", label: "Months", presets: [], defaultPreset: "thisMonth" },
  filters: [],
  options: [
    { kind: "month", key: "fromMonth", label: "From month", default: "yearStart", visibleWhen: { key: "previousYear", values: ["false"] } },
    { kind: "month", key: "toMonth", label: "To month", default: "current", visibleWhen: { key: "previousYear", values: ["false"] } },
    { kind: "checkbox", key: "previousYear", label: "All months of the previous year" },
    { kind: "number", key: "fromDay", label: "From day", min: 1, max: 31, default: 1 },
    { kind: "number", key: "toDay", label: "To day", min: 1, max: 31, default: 31, hint: "Only days from–to of each month count, e.g. 1–15 compares the first half of every month. Days past a month's end are ignored." },
    { kind: "checkbox", key: "annexure", label: "Annexure (break each category down by service type)", default: true },
  ],
  validateOptions: (options) => {
    if (Number(options.fromDay) > Number(options.toDay)) return "The to day must be on or after the from day.";
    if (options.previousYear === "true") return null;
    const months = monthsBetween(options.fromMonth, options.toMonth);
    if (months < 1) return "The to month must be on or after the from month.";
    if (months > 12) return "Choose at most 12 months.";
    return null;
  },
  subtitle: (data) => {
    const query = data.filters.query as Record<string, string>;
    const months = (data.columns ?? []).filter((column) => column.key !== "total");
    const span = months.length ? `${months[0].label} – ${months[months.length - 1].label}` : "";
    const days = query.fromDay && query.toDay && (query.fromDay !== "1" || query.toDay !== "31") ? ` · days ${query.fromDay}–${query.toDay} of each month` : "";
    return `${query.previousYear === "true" ? "Previous year: " : ""}${span}${days}`;
  },
  columns: [labelColumn("Particulars")],
  columnsFor: (data) => [
    labelColumn("Particulars"),
    ...dataColumns(data, (row) => (row.groupKey === "VEHICLES" ? "integer" : "money")),
  ],
  rowStyle: matrixRowStyle,
  rowIndent: matrixIndent,
  hideSubtotals: true,
  hideGrandTotal: true,
  noun: ["job delivered", "jobs delivered"],
  summaryCards: (data) => [
    { label: "Vehicles", value: fmtNumber(total(data, "VEHICLES:total"), "integer"), sub: `${(data.columns ?? []).length - 1} months`, tone: "blue" },
    { label: "Total labour", value: fmtMoney(total(data, "LABOUR:total")), sub: "Net of discount, with PDI", tone: "emerald" },
    { label: "Total spares", value: fmtMoney(total(data, "SPARES:total")), tone: "amber" },
    { label: "Total oil", value: fmtMoney(total(data, "OIL:total")), tone: "orange" },
    { label: "Service charge", value: fmtMoney(total(data, "SERVICE_CHARGE:total")), tone: "purple" },
  ],
  extra: (data) => {
    const months = (data.columns ?? []).filter((column) => column.key !== "total");
    const value = (id: string, month: string) => Number(data.rows.find((row) => row.id === id)?.[month] ?? 0);
    if (months.length < 2) return null;
    return <MonthlyTrend points={months.map((month) => ({ month: month.label, labour: value("LABOUR:total", month.key), spares: value("SPARES:total", month.key), oil: value("OIL:total", month.key) }))} />;
  },
  footnote: "Jobs count in the month they were delivered. Amounts are the value of the work on each job (customer, warranty, goodwill and free lines); discounts come from the job bill. Running jobs = running repair + other services.",
  emptyMessage: "No jobs were delivered in these months",
};

// ── S2. Business product mix ───────────────────────────────────────────────────

const mixColumns: ReportColumn[] = [
  {
    key: "label",
    label: "Service type / model",
    className: "min-w-48",
    render: (row) => <span className="font-medium text-slate-800">{str(row, "label")}</span>,
  },
  { key: "vehicles", label: "Vehicles", format: "integer" },
  { key: "spares", label: "Spares", format: "money" },
  { key: "sparesPct", label: "%", format: "percent" },
  { key: "oil", label: "Oil & lub.", format: "money" },
  { key: "oilPct", label: "%", format: "percent" },
  { key: "labour", label: "Labour (net)", format: "money" },
  { key: "labourPct", label: "%", format: "percent" },
  { key: "serviceCharge", label: "Service charge", format: "money" },
  { key: "serviceChargePct", label: "%", format: "percent" },
  { key: "sparesPerVehicle", label: "Spares / veh.", format: "money" },
  { key: "oilPerVehicle", label: "Oil / veh.", format: "money" },
  { key: "labourPerVehicle", label: "Labour / veh.", format: "money" },
  { key: "serviceChargePerVehicle", label: "Svc chg / veh.", format: "money" },
];

const productMix: ReportConfig = {
  slug: "business-product-mix",
  title: "Business product mix",
  description: "Vehicles serviced, spares, oil, labour and service charge per service type or model, with % shares and per-vehicle values.",
  category: "Service MIS",
  subgroup: MIS_GROUPS.summary,
  permission: "report:business-product-mix",
  width: 132,
  icon: ChartPie,
  period: { kind: "range", label: "Delivered", presets: RANGE_PRESETS, defaultPreset: "thisMonth" },
  filters: ["model", "variant", "serviceType", "serviceGroup", "engineer"],
  options: [
    {
      kind: "segmented",
      key: "by",
      label: "Group by",
      choices: [
        { value: "serviceType", label: "Service type" },
        { value: "model", label: "Model (with mileage bands)" },
      ],
      default: "serviceType",
    },
    jobTypeOption("BOTH"),
  ],
  columns: mixColumns,
  columnsFor: (data, options) => [
    { ...mixColumns[0], label: options.by === "model" ? "Model" : "Service type" },
    ...mixColumns.slice(1),
    ...(data.columns ?? []).map((column) => ({ key: column.key, label: column.label, format: "integer" as const })),
  ],
  noun: ["vehicle", "vehicles"],
  subtotalLabel: (group) => `${group.label} · ${plural(group.totals.vehicles ?? 0, ["vehicle", "vehicles"])}`,
  totalLabel: (data) => `Overall · ${plural(data.totals.vehicles ?? 0, ["vehicle", "vehicles"])}`,
  summaryCards: (data) => [
    { label: "Vehicles serviced", value: fmtNumber(data.totals.vehicles ?? 0, "integer"), tone: "blue" },
    { label: "Labour (net)", value: fmtMoney(data.totals.labour ?? 0), sub: `${fmtMoney(data.totals.labourPerVehicle ?? 0)} per vehicle`, tone: "emerald" },
    { label: "Spares", value: fmtMoney(data.totals.spares ?? 0), sub: `${fmtMoney(data.totals.sparesPerVehicle ?? 0)} per vehicle`, tone: "amber" },
    { label: "Oil & lubricants", value: fmtMoney(data.totals.oil ?? 0), sub: `${fmtMoney(data.totals.oilPerVehicle ?? 0)} per vehicle`, tone: "orange" },
    { label: "Service charge", value: fmtMoney(data.totals.serviceCharge ?? 0), tone: "purple" },
  ],
  extra: (data) => (
    <ShareBars
      title="Revenue by service category"
      items={data.groups.map((group) => ({
        key: group.key,
        label: SERVICE_CATEGORIES[group.key]?.label ?? group.label,
        value: (group.totals.spares ?? 0) + (group.totals.oil ?? 0) + (group.totals.labour ?? 0) + (group.totals.serviceCharge ?? 0),
        fill: CATEGORY_FILL[group.key],
      }))}
    />
  ),
  footnote: "Row % are shares of the row's service category, so they add up to 100 in each category; category % are shares of the whole. Labour is net of the bill discount; spares and oil are before discount.",
  emptyMessage: "No jobs were delivered in this period",
};

// ── S3. Analysis of jobs ───────────────────────────────────────────────────────

const jobAnalysis: ReportConfig = {
  slug: "job-analysis",
  title: "Analysis of jobs",
  description: "Jobs by model (or variant) and service type, with total, repeat and accidental columns, then the same grid as % of each row.",
  category: "Service MIS",
  subgroup: MIS_GROUPS.summary,
  permission: "report:job-analysis",
  width: 132,
  icon: Grid3x3,
  period: { kind: "range", label: "Delivered", presets: RANGE_PRESETS, defaultPreset: "thisMonth" },
  filters: [],
  options: [
    {
      kind: "segmented",
      key: "by",
      label: "Rows",
      choices: [
        { value: "model", label: "Model-wise" },
        { value: "variant", label: "Variant-wise" },
      ],
      default: "model",
    },
  ],
  columns: [labelColumn("Model")],
  columnsFor: (data, options) => [
    labelColumn<ReportRow>(options.by === "variant" ? "Model · variant" : "Model"),
    ...(data.columns ?? []).map(
      (column): ReportColumn => ({
        key: column.key,
        label: column.label,
        format: "number",
        align: "right",
        text: (row) => formatValue(row[column.key], row.grid === "percent" ? "percent" : "integer"),
        render: (row) => {
          const value = Number(row[column.key] ?? 0);
          const text = formatValue(value, row.grid === "percent" ? "percent" : "integer");
          const tint = row.grid === "percent" && row.kind !== "total" && column.key !== "total" ? heatClass(value) : "";
          return <span className={cn("inline-block min-w-12 rounded px-1.5 py-0.5 tabular-nums", tint, !value && "text-slate-300")}>{value ? text : "–"}</span>;
        },
      }),
    ),
  ],
  rowStyle: matrixRowStyle,
  hideSubtotals: true,
  hideGrandTotal: true,
  noun: ["job", "jobs"],
  summaryCards: (data) => [
    { label: "Jobs delivered", value: fmtNumber(data.totals.count ?? 0, "integer"), tone: "blue" },
    { label: "Service types", value: fmtNumber(Math.max((data.columns ?? []).length - 3, 0), "integer"), tone: "gray" },
    { label: "Repeat jobs", value: fmtNumber(data.totals.repeat ?? 0, "integer"), sub: `${fmtNumber(data.totals.count ? ((data.totals.repeat ?? 0) / data.totals.count) * 100 : 0, "percent")} of jobs`, tone: "orange" },
    { label: "Accidental", value: fmtNumber(data.totals.accidental ?? 0, "integer"), sub: `${fmtNumber(data.totals.count ? ((data.totals.accidental ?? 0) / data.totals.count) * 100 : 0, "percent")} of jobs`, tone: "red" },
  ],
  footnote: "Only service types with at least one job in the period get a column. Repeat and accidental jobs are also counted under their service type.",
  emptyMessage: "No jobs were delivered in this period",
};

export const MIS_SUMMARY_CONFIGS: ReportConfig[] = [misMonthly, productMix, jobAnalysis];

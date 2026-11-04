import Link from "next/link";
import { ArrowRight, Cake, CalendarX, CarFront, Repeat, ArrowLeftRight, UserPlus } from "lucide-react";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { fmtDate, fmtNumber, plural } from "../lib/report-format";
import type { ReportColumn, ReportConfig } from "../types";
import { MIS_GROUPS } from "./mis-shared";
import { addressColumns, jobColumn, modelColumn, printAddressOption, RANGE_PRESETS, registrationColumn, str } from "./shared";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function customerColumn(withContact = true): ReportColumn {
  return {
    key: "customer",
    label: withContact ? "Customer / phone" : "Customer",
    text: (row) => (withContact ? [str(row, "customer"), str(row, "customerPhone")].filter(Boolean).join(" / ") : str(row, "customer")),
    render: (row) => (
      <div className="min-w-36">
        {str(row, "customer") || <span className="text-slate-300">—</span>}
        {withContact && <div className="text-xs text-muted-foreground">{[str(row, "customerPhone"), str(row, "email")].filter(Boolean).join(" · ") || "No phone"}</div>}
      </div>
    ),
  };
}

const vehicleLink: ReportColumn = {
  ...registrationColumn(true),
  render: (row) => (
    <div className="whitespace-nowrap">
      <Link href={`/vehicles/${str(row, "vehicleId")}`} className="font-medium text-blue-700 underline-offset-2 hover:underline print:text-black">
        {str(row, "registration") || "Unregistered"}
      </Link>
      {row.vin ? <div className="font-mono text-xs text-muted-foreground">{str(row, "vin")}</div> : null}
    </div>
  ),
};

const ORDER_OPTION = {
  kind: "select" as const,
  key: "order",
  label: "In the order of",
  choices: [
    { value: "MODEL", label: "Model" },
    { value: "VARIANT", label: "Variant" },
    { value: "SALE_DATE", label: "Sale date" },
  ],
  default: "MODEL",
};

// ── S9. List of new customers ──────────────────────────────────────────────────

const newCustomers: ReportConfig = {
  slug: "new-customers",
  title: "List of new customers",
  description: "Customers whose first ever job card was opened in the period, by model.",
  category: "Service MIS",
  subgroup: MIS_GROUPS.lists,
  permission: "report:new-customers",
  width: 80,
  icon: UserPlus,
  period: { kind: "range", label: "First job", presets: RANGE_PRESETS, defaultPreset: "thisMonth", hint: "A new customer's first ever job (at any branch, not PDI, not cancelled) falls in this period." },
  filters: ["model"],
  columns: [
    customerColumn(),
    { key: "customerAddress", label: "Address", className: "min-w-48 text-xs" },
    registrationColumn(),
    modelColumn(),
    { key: "saleDate", label: "Sale date", format: "date" },
    jobColumn({ withDate: true, label: "First job" }),
    { key: "serviceType", label: "Service type", className: "text-xs" },
  ],
  noun: ["new customer", "new customers"],
  subtotalLabel: (group) => `${group.label} · ${plural(group.count, ["new customer", "new customers"])}`,
  summaryCards: (data) => [
    { label: "New customers", value: fmtNumber(data.totals.count ?? 0, "integer"), tone: "emerald" },
    ...(data.breakdown ?? [])
      .slice()
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((item) => ({ label: item.label, value: fmtNumber(item.count, "integer"), sub: "new customers", tone: "blue" as const })),
  ],
  emptyMessage: "No new customers in this period",
};

// ── S10. List of regular customers ─────────────────────────────────────────────

const regularCustomers: ReportConfig = {
  slug: "regular-customers",
  title: "List of regular customers",
  description: "Vehicles with at least the minimum number of visits since a date, counting a comeback within a few km once.",
  category: "Service MIS",
  subgroup: MIS_GROUPS.lists,
  permission: "report:regular-customers",
  width: 80,
  icon: Repeat,
  period: { kind: "date", label: "Visits from", dateLabel: "Visits from", presets: [], defaultPreset: "thisMonth" },
  filters: [],
  options: [
    { kind: "text", key: "fromRegistration", label: "From registration", placeholder: "First", maxLength: 30 },
    { kind: "text", key: "toRegistration", label: "To registration", placeholder: "Last", maxLength: 30 },
    { kind: "number", key: "mileageDiff", label: "Mileage difference", suffix: "km", min: 0, max: 1_000_000, default: 0 },
    { kind: "number", key: "minVisits", label: "Minimum visits", min: 1, max: 100, default: 2, hint: "A visit counts when its mileage is at least the mileage difference above the previous counted visit, so a comeback a few km later counts once." },
    printAddressOption,
  ],
  columns: [
    vehicleLink,
    modelColumn(false),
    customerColumn(false),
    ...addressColumns(),
    {
      key: "visits",
      label: "Visits",
      format: "integer",
      text: (row) => `${str(row, "visits")} of ${str(row, "allVisits")}`,
      render: (row) => (
        <span className="whitespace-nowrap tabular-nums">
          <span className="font-semibold">{str(row, "visits")}</span>
          <span className="text-xs text-muted-foreground"> of {str(row, "allVisits")}</span>
        </span>
      ),
    },
    {
      key: "firstVisit",
      label: "First visit",
      text: (row) => `${fmtDate(`${str(row, "firstVisit")}T12:00:00Z`)} ${fmtNumber(row.firstMileage, "integer")} km`,
      render: (row) => (
        <div className="whitespace-nowrap text-xs">
          {fmtDate(`${str(row, "firstVisit")}T12:00:00Z`)}
          <div className="text-muted-foreground">{row.firstMileage === null ? "—" : `${fmtNumber(row.firstMileage, "integer")} km`}</div>
        </div>
      ),
    },
    {
      key: "lastVisit",
      label: "Last visit",
      text: (row) => `${fmtDate(`${str(row, "lastVisit")}T12:00:00Z`)} ${fmtNumber(row.lastMileage, "integer")} km`,
      render: (row) => (
        <div className="whitespace-nowrap text-xs">
          {fmtDate(`${str(row, "lastVisit")}T12:00:00Z`)}
          <div className="text-muted-foreground">{row.lastMileage === null ? "—" : `${fmtNumber(row.lastMileage, "integer")} km`}</div>
        </div>
      ),
    },
    { key: "averageKm", label: "Avg km between", format: "integer" },
  ],
  noun: ["regular vehicle", "regular vehicles"],
  validateOptions: (options) => {
    const from = options.fromRegistration?.trim().toUpperCase();
    const to = options.toRegistration?.trim().toUpperCase();
    return from && to && to < from ? "The last registration must come after the first." : null;
  },
  summaryCards: (data) => [
    { label: "Regular vehicles", value: fmtNumber(data.totals.count ?? 0, "integer"), tone: "emerald" },
    { label: "Counted visits", value: fmtNumber(data.totals.visits ?? 0, "integer"), sub: data.totals.count ? `${fmtNumber((data.totals.visits ?? 0) / data.totals.count, "number")} per vehicle` : undefined, tone: "blue" },
  ],
  emptyMessage: "No vehicles have that many visits since this date",
};

// ── S11. Birthday / anniversary ────────────────────────────────────────────────

const today = new Date();
const thisMonth = today.getMonth() + 1;
const lastDay = new Date(today.getFullYear(), thisMonth, 0).getDate();

const birthdayAnniversary: ReportConfig = {
  slug: "birthday-anniversary",
  title: "Birthday / anniversary report",
  description: "Customers whose birthday or anniversary falls between two days of the year, including ranges over the year end.",
  category: "Service MIS",
  subgroup: MIS_GROUPS.lists,
  permission: "report:birthday-anniversary",
  width: 80,
  icon: Cake,
  period: { kind: "none", label: "Days", presets: [], defaultPreset: "today" },
  filters: [],
  options: [
    { kind: "dayMonth", key: "from", label: "From", dayKey: "fromDay", monthKey: "fromMonth", defaultDay: 1, defaultMonth: thisMonth },
    { kind: "dayMonth", key: "to", label: "To", dayKey: "toDay", monthKey: "toMonth", defaultDay: lastDay, defaultMonth: thisMonth },
    {
      kind: "segmented",
      key: "show",
      label: "Show",
      choices: [
        { value: "BIRTHDAY", label: "Birthday" },
        { value: "ANNIVERSARY", label: "Anniversary" },
        { value: "BOTH", label: "Both" },
      ],
      default: "BOTH",
    },
    {
      kind: "segmented",
      key: "order",
      label: "Order",
      choices: [
        { value: "DATE", label: "Date-wise" },
        { value: "NAME", label: "Name-wise" },
      ],
      default: "DATE",
      hint: "No year is needed: 01 Dec to 31 Jan covers December and January. Date-wise lists from the first day of the range.",
    },
    printAddressOption,
  ],
  validateOptions: (options) => {
    const valid = (day: string, month: string) => Number(day) <= new Date(2024, Number(month), 0).getDate();
    if (!valid(options.fromDay, options.fromMonth)) return "From: that month does not have that many days.";
    if (!valid(options.toDay, options.toMonth)) return "To: that month does not have that many days.";
    return null;
  },
  subtitle: (data) => {
    const query = data.filters.query as Record<string, string>;
    const label = (day: string, month: string) => `${day.padStart(2, "0")} ${MONTHS[Number(month) - 1]}`;
    return `${label(query.fromDay ?? "1", query.fromMonth ?? "1")} to ${label(query.toDay ?? "31", query.toMonth ?? "12")}`;
  },
  columns: [
    {
      key: "dayMonth",
      label: "Date",
      text: (row) => `${str(row, "date").slice(8, 10)} ${MONTHS[Number(str(row, "date").slice(5, 7)) - 1]}`,
      render: (row) => (
        <div className="whitespace-nowrap">
          <span className="font-semibold">{str(row, "date").slice(8, 10)} {MONTHS[Number(str(row, "date").slice(5, 7)) - 1]}</span>
          <div className="text-xs text-muted-foreground">{str(row, "date").slice(0, 4)}</div>
        </div>
      ),
    },
    {
      key: "occasion",
      label: "Occasion",
      text: (row) => (row.occasion === "BIRTHDAY" ? "Birthday" : "Anniversary"),
      render: (row) => <StatusBadge status={row.occasion === "BIRTHDAY" ? "Birthday" : "Anniversary"} tone={row.occasion === "BIRTHDAY" ? "purple" : "blue"} className="px-2 py-0 text-xs" />,
    },
    {
      key: "customer",
      label: "Customer",
      render: (row) => (
        <Link href={`/customers/${str(row, "customerId")}`} className="font-medium text-blue-700 underline-offset-2 hover:underline print:text-black">
          {str(row, "customer")}
        </Link>
      ),
    },
    { key: "customerPhone", label: "Phone", className: "whitespace-nowrap text-xs" },
    { key: "email", label: "Email", className: "text-xs" },
    { key: "customerAddress", label: "Address", whenOption: "printAddress", className: "min-w-48 text-xs" },
    { key: "registration", label: "Latest vehicle" },
  ],
  noun: ["occasion", "occasions"],
  summaryCards: (data) => {
    const summary = data.summary ?? {};
    const customers = Number(summary.customers ?? 0);
    return [
      { label: "Birthdays", value: fmtNumber(Number(summary.birthdays ?? 0), "integer"), tone: "purple" },
      { label: "Anniversaries", value: fmtNumber(Number(summary.anniversaries ?? 0), "integer"), tone: "blue" },
      { label: "No birthday recorded", value: fmtNumber(Number(summary.withoutBirthday ?? 0), "integer"), sub: `of ${fmtNumber(customers, "integer")} customers`, tone: "amber", muted: true },
      { label: "No anniversary recorded", value: fmtNumber(Number(summary.withoutAnniversary ?? 0), "integer"), sub: `of ${fmtNumber(customers, "integer")} customers`, tone: "amber", muted: true },
    ];
  },
  footnote: "Only customers with a date on their profile can be listed; the cards above show how many have none recorded.",
  emptyMessage: "No birthdays or anniversaries in these days",
};

// ── S12. Vehicle resale history ────────────────────────────────────────────────

const vehicleResale: ReportConfig = {
  slug: "vehicle-resale",
  title: "Vehicle resale history",
  description: "Every owner change in the period, with the previous and new owner.",
  category: "Service MIS",
  subgroup: MIS_GROUPS.lists,
  permission: "report:vehicle-resale",
  width: 80,
  icon: ArrowLeftRight,
  period: { kind: "range", label: "Resale", presets: RANGE_PRESETS, defaultPreset: "thisMonth" },
  filters: [],
  options: [{ kind: "text", key: "registration", label: "Vehicle", placeholder: "All vehicles (or registration / VIN)", maxLength: 30 }],
  columns: [
    vehicleLink,
    { key: "engineNumber", label: "Engine no", className: "whitespace-nowrap font-mono text-xs" },
    modelColumn(),
    { key: "resaleDate", label: "Resale date", format: "date" },
    {
      key: "previousOwner",
      label: "Previous → new owner",
      text: (row) => `${str(row, "previousOwner") || "—"} → ${str(row, "newOwner")}`,
      render: (row) => (
        <div className="flex min-w-48 flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground">{str(row, "previousOwner") || "—"}</span>
          <ArrowRight className="size-3.5 text-slate-400" aria-hidden />
          <span className="font-medium">{str(row, "newOwner")}</span>
        </div>
      ),
    },
    { key: "customerType", label: "Customer type", className: "text-xs" },
    { key: "recordedBy", label: "Recorded by", className: "text-xs", text: (row) => str(row, "recordedBy") || "Not recorded" },
  ],
  noun: ["resale", "resales"],
  summaryCards: (data) => [
    { label: "Resales", value: fmtNumber(data.totals.count ?? 0, "integer"), tone: "blue" },
    { label: "Vehicles", value: fmtNumber(Number(data.summary?.vehicles ?? 0), "integer"), tone: "gray" },
  ],
  footnote: "A resale is every ownership record after a vehicle's first, dated by its purchase date. Recorded by is kept for owner changes recorded from November 2026.",
  emptyMessage: "No owner changes in this period",
};

// ── S13. Vehicles that skipped free service ────────────────────────────────────

const REASONS: Record<string, string> = { DAYS: "Days passed", KM: "Km passed", NEXT_DONE: "Next service done" };

const skippedColumns: ReportColumn[] = [
  vehicleLink,
  modelColumn(),
  { key: "saleDate", label: "Sale date", format: "date" },
  { key: "sellingDealer", label: "Selling dealer", className: "text-xs" },
  customerColumn(),
  {
    key: "serviceSkipped",
    label: "Service skipped",
    text: (row) => `${str(row, "serviceSkipped")} (${REASONS[str(row, "reason")] ?? ""})`,
    render: (row) => (
      <div className="min-w-32">
        <span className="font-medium">{str(row, "serviceSkipped")}</span>
        <div className="text-xs text-red-700">{REASONS[str(row, "reason")]}</div>
      </div>
    ),
  },
  {
    key: "dueBy",
    label: "Due by",
    text: (row) => [row.dueBy ? fmtDate(`${str(row, "dueBy")}T12:00:00Z`) : "", row.dueKm ? `${fmtNumber(row.dueKm, "integer")} km` : ""].filter(Boolean).join(" / ") || "Next service",
  },
  {
    key: "lastVisit",
    label: "Last visit",
    text: (row) => (row.lastVisit ? `${fmtDate(row.lastVisit)} ${fmtNumber(row.lastMileage, "integer")} km` : "Never"),
    render: (row) =>
      row.lastVisit ? (
        <div className="whitespace-nowrap text-xs">
          {fmtDate(row.lastVisit)}
          <div className="text-muted-foreground">{row.lastMileage === null ? "—" : `${fmtNumber(row.lastMileage, "integer")} km`}</div>
        </div>
      ) : (
        <span className="text-xs italic text-muted-foreground">Never visited</span>
      ),
  },
];

const skippedFreeService: ReportConfig = {
  slug: "skipped-free-service",
  title: "Vehicles that skipped free service",
  description: "Sold vehicles past a free service's due days or km without it, with a summary per model.",
  category: "Service MIS",
  subgroup: MIS_GROUPS.lists,
  permission: "report:skipped-free-service",
  width: 80,
  icon: CalendarX,
  period: { kind: "range", label: "Sold", presets: RANGE_PRESETS, defaultPreset: "lastMonth" },
  filters: ["model", "variant", "freeService"],
  options: [ORDER_OPTION],
  hasMode: true,
  defaultMode: "detail",
  modeChoices: [
    { value: "detail", label: "Detail only" },
    { value: "summary", label: "Summary only" },
  ],
  columns: skippedColumns,
  columnsFor: (data, options) =>
    options.mode === "summary"
      ? [
          { key: "label", label: options.order === "VARIANT" ? "Variant" : "Model" },
          { key: "sold", label: "Vehicles sold", format: "integer" },
          ...(data.columns ?? []).map((column) => ({ key: column.key, label: column.label, format: column.format ?? "integer" })),
        ]
      : skippedColumns,
  noun: ["skipped service", "skipped services"],
  subtotalLabel: (group) => `${group.label} · ${plural(group.totals.sold ?? 0, ["vehicle sold", "vehicles sold"])}`,
  totalLabel: (data) => `All models · ${plural(data.totals.sold ?? 0, ["vehicle sold", "vehicles sold"])}`,
  summaryCards: (data) => [
    { label: "Vehicles sold", value: fmtNumber(Number(data.summary?.sold ?? 0), "integer"), tone: "blue" },
    { label: "Vehicles with a skip", value: fmtNumber(Number(data.summary?.vehicles ?? 0), "integer"), tone: "red" },
    ...(data.breakdown ?? []).map((item) => ({ label: item.label, value: fmtNumber(item.count, "integer"), sub: `${fmtNumber(Number(data.summary?.sold) ? (item.count / Number(data.summary?.sold)) * 100 : 0, "percent")} of sold`, tone: "amber" as const })),
  ],
  footnote: "Due limits come from the service charge per model (Days limit / Mileage limit). A free service with no limit counts as skipped once a later free service is done. Checked as on today.",
  emptyMessage: "No vehicle sold in this period has skipped a free service",
};

// ── S14. Vehicle list by model and variant ─────────────────────────────────────

const vehicleList: ReportConfig = {
  slug: "vehicle-list",
  title: "Vehicle list by model and variant",
  description: "Vehicles sold in the period (optionally with stock vehicles), with subtotals per model and variant.",
  category: "Service MIS",
  subgroup: MIS_GROUPS.lists,
  permission: "report:vehicle-list",
  width: 80,
  icon: CarFront,
  period: { kind: "range", label: "Sold", presets: RANGE_PRESETS, defaultPreset: "thisMonth" },
  filters: ["model", "variant"],
  options: [ORDER_OPTION, { kind: "checkbox", key: "includeStock", label: "Include stock vehicles" }, { ...printAddressOption, label: "Print customer address" }],
  columns: [
    { ...modelColumn(), showWhen: { key: "order", values: ["SALE_DATE"] } },
    vehicleLink,
    { key: "engineNumber", label: "Engine no", className: "whitespace-nowrap font-mono text-xs" },
    { key: "colour", label: "Colour", className: "text-xs" },
    {
      key: "saleDate",
      label: "Sale date",
      format: "date",
      render: (row) => (row.stock ? <StatusBadge status="Stock" tone="amber" className="px-2 py-0 text-xs" /> : fmtDate(row.saleDate)),
      text: (row) => (row.stock ? "Stock" : fmtDate(row.saleDate)),
    },
    { key: "sellingDealer", label: "Selling dealer", className: "text-xs" },
    customerColumn(false),
    ...addressColumns(),
  ],
  noun: ["vehicle", "vehicles"],
  subtotalLabel: (group) => `${group.label} · ${plural(group.count, ["vehicle", "vehicles"])}`,
  summaryCards: (data) => [
    { label: "Vehicles", value: fmtNumber(data.totals.count ?? 0, "integer"), tone: "blue" },
    { label: "Sold", value: fmtNumber(Number(data.summary?.sold ?? 0), "integer"), tone: "emerald" },
    { label: "Stock", value: fmtNumber(Number(data.summary?.stock ?? 0), "integer"), tone: "amber" },
  ],
  footnote: "Stock vehicles have no sale date or no owner; those without an owner appear in every branch's list.",
  emptyMessage: "No vehicles match these filters",
};

export const MIS_LIST_CONFIGS: ReportConfig[] = [newCustomers, regularCustomers, birthdayAnniversary, vehicleResale, skippedFreeService, vehicleList];

import Link from "next/link";
import { Gauge, HardHat, PackageMinus, TriangleAlert, Undo2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber, plural } from "../lib/report-format";
import type { ReportColumn, ReportConfig, ReportResponse } from "../types";
import { categoryBadge, chargeTypeBadge, CHARGE_TYPES, jobTypeOption, MIS_GROUPS, SERVICE_CATEGORIES, ShareBars } from "./mis-shared";
import { jobColumn, modelColumn, RANGE_PRESETS, registrationColumn, str } from "./shared";

const pct = (part: number, whole: number) => (whole ? (part / whole) * 100 : 0);

// ── S4. Group-wise productivity ────────────────────────────────────────────────

const periodColumns = (prefix: "mtd" | "ytd", label: string): ReportColumn[] => [
  { key: `${prefix}Lines`, label: `${label} lines`, format: "integer" },
  { key: `${prefix}Jobs`, label: `${label} jobs`, format: "integer" },
  { key: `${prefix}Hours`, label: `${label} hours`, format: "hours" },
  { key: `${prefix}Amount`, label: `${label} labour`, format: "money" },
  { key: `${prefix}Share`, label: `${label} share`, format: "percent" },
  { key: `${prefix}PerJob`, label: `${label} per job`, format: "money" },
];

const groupProductivity: ReportConfig = {
  slug: "group-productivity",
  title: "Group-wise productivity",
  description: "Labour lines, jobs, hours sold and labour per service group, month to date and year to date.",
  category: "Service MIS",
  subgroup: MIS_GROUPS.workshop,
  permission: "report:group-productivity",
  width: 80,
  icon: Gauge,
  period: {
    kind: "date",
    label: "As on",
    dateLabel: "As on",
    presets: ["today", "yesterday"],
    defaultPreset: "today",
    hint: "Month to date runs from the 1st of that month, year to date from 1 January. Billed lines count on the bill date, others on the job date.",
  },
  filters: ["model", "variant", "serviceGroup"],
  columns: [{ key: "label", label: "Service group", className: "min-w-40 font-medium" }, ...periodColumns("mtd", "MTD"), ...periodColumns("ytd", "YTD")],
  noun: ["service group", "service groups"],
  totalLabel: () => "All service groups",
  summaryCards: (data) => [
    { label: "Labour month to date", value: fmtMoney(data.totals.mtdAmount ?? 0), sub: `${fmtNumber(data.totals.mtdJobs ?? 0, "integer")} jobs · ${fmtNumber(data.totals.mtdHours ?? 0, "hours")} h`, tone: "blue" },
    { label: "Labour year to date", value: fmtMoney(data.totals.ytdAmount ?? 0), sub: `${fmtNumber(data.totals.ytdJobs ?? 0, "integer")} jobs · ${fmtNumber(data.totals.ytdHours ?? 0, "hours")} h`, tone: "emerald" },
    { label: "Labour per job (MTD)", value: fmtMoney(data.totals.mtdPerJob ?? 0), tone: "amber" },
    { label: "Labour per job (YTD)", value: fmtMoney(data.totals.ytdPerJob ?? 0), tone: "orange" },
  ],
  extra: (data) => <ShareBars title="Year-to-date labour by service group" items={data.rows.map((row) => ({ key: str(row, "id"), label: str(row, "label"), value: Number(row.ytdAmount ?? 0) }))} />,
  footnote: "Hours sold use the standard hours where recorded, otherwise the charged hours. Labour is net of the bill's labour discount, shared over the job's lines.",
  emptyMessage: "No labour lines this year up to that date",
};

// ── S5. Engineer performance ───────────────────────────────────────────────────

function EngineerCards({ data }: { data: ReportResponse }) {
  if (!data.groups.length) return null;
  return (
    <section aria-label="Engineer summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {data.groups.map((group) => {
        const t = group.totals;
        return (
          <article key={group.key} className="rounded-xl border border-border bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-slate-900">{group.label}</h3>
              <span className="text-sm font-semibold tabular-nums text-slate-900">{fmtMoney(t.total ?? 0)}</span>
            </div>
            <p className="text-sm text-muted-foreground">{plural(t.jobs ?? 0, ["job", "jobs"])} · {fmtMoney(t.perJob ?? 0)} per job · {fmtNumber(t.labourHours ?? 0, "hours")} h</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Object.entries(SERVICE_CATEGORIES)
                .filter(([key]) => t[key])
                .map(([key, category]) => (
                  <StatusBadge key={key} status={`${category.label} ${t[key]}`} tone={category.tone} className="px-2 py-0 text-xs" />
                ))}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-muted/60 px-3 py-2">
                <dt className="text-xs text-muted-foreground">Repeat jobs</dt>
                <dd className={cn("font-semibold tabular-nums", (t.repeatPct ?? 0) > 5 && "text-orange-700")}>{fmtNumber(t.repeat ?? 0, "integer")} · {fmtNumber(t.repeatPct ?? 0, "percent")}</dd>
              </div>
              <div className="rounded-lg bg-muted/60 px-3 py-2">
                <dt className="text-xs text-muted-foreground">Delivered late</dt>
                <dd className={cn("font-semibold tabular-nums", (t.latePct ?? 0) > 10 && "text-red-700")}>{fmtNumber(t.late ?? 0, "integer")} · {fmtNumber(t.latePct ?? 0, "percent")}</dd>
              </div>
            </dl>
          </article>
        );
      })}
    </section>
  );
}

const engineerPerformance: ReportConfig = {
  slug: "engineer-performance",
  title: "Engineer performance",
  description: "Jobs billed per engineer with labour, parts, billing per job, repeat jobs and late deliveries.",
  category: "Service MIS",
  subgroup: MIS_GROUPS.workshop,
  permission: "report:engineer-performance",
  width: 132,
  icon: HardHat,
  period: { kind: "range", label: "Billed", presets: RANGE_PRESETS, defaultPreset: "thisMonth" },
  filters: ["model", "variant", "serviceType", "serviceGroup", "engineer"],
  options: [jobTypeOption("REGULAR")],
  hasMode: true,
  modeChoices: [
    { value: "both", label: "Jobs with summary" },
    { value: "summary", label: "Only summary" },
  ],
  columns: [
    jobColumn({ withDate: true }),
    registrationColumn(),
    modelColumn(),
    { key: "serviceType", label: "Service type", className: "min-w-36 text-xs" },
    categoryBadge(),
    { key: "labourHours", label: "Hours", format: "hours" },
    { key: "labourAmount", label: "Labour (net)", format: "money" },
    { key: "spares", label: "Spares", format: "money" },
    { key: "oil", label: "Oil", format: "money" },
    { key: "total", label: "Total", format: "money" },
    {
      key: "repeat",
      label: "Repeat",
      format: "integer",
      align: "center",
      text: (row) => (row.repeat ? "Yes" : "No"),
      render: (row) => (row.repeat ? <StatusBadge status="Repeat" tone="orange" className="px-2 py-0 text-xs" /> : <span className="text-slate-300">—</span>),
    },
    {
      key: "late",
      label: "Promised / delivered",
      format: "integer",
      text: (row) => `${fmtDateTime(row.promisedAt)} / ${fmtDateTime(row.deliveredAt)}`,
      render: (row) => (
        <div className="whitespace-nowrap text-xs">
          <div>{fmtDateTime(row.promisedAt) || "—"}</div>
          <div className={cn(row.late ? "font-semibold text-red-700" : "text-muted-foreground")}>{fmtDateTime(row.deliveredAt) || "Not delivered"}{row.late ? " · late" : ""}</div>
        </div>
      ),
    },
  ],
  noun: ["job", "jobs"],
  rowTone: (row) => (row.late ? "red" : row.repeat ? "orange" : undefined),
  subtotalLabel: (group) =>
    `${group.label} · ${plural(group.totals.jobs ?? 0, ["job", "jobs"])} · ${fmtMoney(group.totals.perJob ?? 0)}/job · repeat ${fmtNumber(group.totals.repeatPct ?? 0, "percent")} · late ${fmtNumber(group.totals.latePct ?? 0, "percent")}`,
  totalLabel: (data) => `All engineers · ${plural(data.totals.jobs ?? 0, ["job", "jobs"])} · ${fmtMoney(data.totals.perJob ?? 0)}/job`,
  summaryCards: (data) => [
    { label: "Jobs billed", value: fmtNumber(data.totals.jobs ?? 0, "integer"), sub: plural(data.groups.length, ["engineer", "engineers"]), tone: "blue" },
    { label: "Total billing", value: fmtMoney(data.totals.total ?? 0), sub: `${fmtMoney(data.totals.perJob ?? 0)} per job`, tone: "emerald" },
    { label: "Repeat jobs", value: fmtNumber(data.totals.repeat ?? 0, "integer"), sub: fmtNumber(data.totals.repeatPct ?? 0, "percent"), tone: "orange" },
    { label: "Delivered late", value: fmtNumber(data.totals.late ?? 0, "integer"), sub: fmtNumber(data.totals.latePct ?? 0, "percent"), tone: "red" },
  ],
  extra: (data) => <EngineerCards data={data} />,
  footnote: "Total = labour net of discount + spares and oil net of discount + service charge, for every charge type. Late = delivered after the promised time.",
  emptyMessage: "No jobs were billed in this period",
};

// ── S6. Engineer-wise part consumption ─────────────────────────────────────────

const engineerPartConsumption: ReportConfig = {
  slug: "engineer-part-consumption",
  title: "Engineer-wise part consumption",
  description: "Parts issued to jobs net of returns, by engineer, with the split by requisition type and spares / oil.",
  category: "Service MIS",
  subgroup: MIS_GROUPS.workshop,
  permission: "report:engineer-part-consumption",
  width: 80,
  icon: PackageMinus,
  period: { kind: "range", label: "Issued", presets: RANGE_PRESETS, defaultPreset: "thisMonth" },
  filters: ["engineer"],
  options: [
    {
      kind: "segmented",
      key: "partKind",
      label: "Parts",
      choices: [
        { value: "SPARES", label: "Spares" },
        { value: "OIL", label: "Oil" },
        { value: "BOTH", label: "Both" },
      ],
      default: "BOTH",
    },
  ],
  hasMode: true,
  defaultMode: "detail",
  columns: [
    { key: "issueDate", label: "Issued", format: "date" },
    {
      key: "requisitionNumber",
      label: "Requisition / job",
      text: (row) => [str(row, "requisitionNumber") || "Direct issue", str(row, "jobNumber")].join(" / "),
      render: (row) => (
        <div className="whitespace-nowrap">
          <span className="font-medium">{str(row, "requisitionNumber") || "Direct issue"}</span>
          <div className="text-xs">
            <Link href={`/job-cards/${str(row, "jobId")}`} className="text-blue-700 underline-offset-2 hover:underline print:text-black">{str(row, "jobNumber")}</Link>
          </div>
        </div>
      ),
    },
    { key: "partNumber", label: "Part no", className: "whitespace-nowrap font-mono text-xs" },
    { key: "description", label: "Description", className: "min-w-40 text-xs", showWhen: { key: "mode", values: ["detail", "both"] } },
    chargeTypeBadge(),
    { key: "qtyRequired", label: "Req.", format: "integer", showWhen: { key: "mode", values: ["detail", "both"] } },
    { key: "qtyIssued", label: "Issued", format: "integer" },
    { key: "qtyReturned", label: "Ret.", format: "integer" },
    { key: "rate", label: "Rate", format: "money", showWhen: { key: "mode", values: ["detail", "both"] } },
    { key: "amount", label: "Amount", format: "money" },
    { key: "nonWarranty", label: "Non-warranty", format: "money", showWhen: { key: "mode", values: ["summary", "both"] } },
    { key: "warranty", label: "Warranty", format: "money", showWhen: { key: "mode", values: ["summary", "both"] } },
    { key: "foc", label: "FOC", format: "money", showWhen: { key: "mode", values: ["summary", "both"] } },
    { key: "goodwill", label: "Goodwill", format: "money", showWhen: { key: "mode", values: ["summary", "both"] } },
    { key: "spares", label: "Spares", format: "money", showWhen: { key: "mode", values: ["summary", "both"] } },
    { key: "oil", label: "Oil", format: "money", showWhen: { key: "mode", values: ["summary", "both"] } },
  ],
  noun: ["part line", "part lines"],
  subtotalLabel: (group) => `${group.label} · ${plural(group.count, ["line", "lines"])}`,
  summaryCards: (data) => [
    { label: "Consumed (net)", value: fmtMoney(data.totals.amount ?? 0), sub: plural(data.groups.length, ["engineer", "engineers"]), tone: "blue" },
    ...Object.entries(CHARGE_TYPES).map(([key, type]) => {
      const field = { CUSTOMER: "nonWarranty", WARRANTY: "warranty", GOODWILL: "goodwill", FREE: "foc" }[key]!;
      return { label: type.label, value: fmtMoney(data.totals[field] ?? 0), sub: fmtNumber(pct(data.totals[field] ?? 0, data.totals.amount ?? 0), "percent"), tone: type.tone };
    }),
  ],
  footnote: "Amount = (issued − returned) × rate. Returns that were rejected or cancelled are not deducted. Oil = parts of type O, as in the parts reports.",
  emptyMessage: "No parts were issued to jobs in this period",
};

// ── S7. Requisition return register ────────────────────────────────────────────

const requisitionReturnRegister: ReportConfig = {
  slug: "requisition-return-register",
  title: "Requisition return register",
  description: "Parts returned from jobs, grouped by job, requisition or return, with requisition type, billed status and part filters.",
  category: "Service MIS",
  subgroup: MIS_GROUPS.workshop,
  permission: "report:requisition-return-register",
  width: 132,
  icon: Undo2,
  period: { kind: "range", label: "Returned", presets: RANGE_PRESETS, defaultPreset: "thisMonth" },
  filters: [],
  options: [
    { kind: "lookup", key: "partCategory", label: "Part category", source: "partCategory", all: "All categories" },
    { kind: "text", key: "partNumber", label: "Part number", placeholder: "All parts", maxLength: 60 },
    {
      kind: "segmented",
      key: "basedOn",
      label: "Based on",
      choices: [
        { value: "JOB", label: "Job" },
        { value: "REQUISITION", label: "Requisition" },
        { value: "RETURN", label: "Requisition return" },
      ],
      default: "RETURN",
    },
    jobTypeOption("BOTH"),
    {
      kind: "multi",
      key: "chargeTypes",
      label: "Requisition type",
      choices: [
        { value: "WARRANTY", label: "Warranty" },
        { value: "GOODWILL", label: "Goodwill" },
        { value: "CUSTOMER", label: "Non-warranty" },
        { value: "FREE", label: "FOC" },
      ],
    },
    {
      kind: "segmented",
      key: "billing",
      label: "Billed",
      choices: [
        { value: "BILLED", label: "Billed" },
        { value: "UNBILLED", label: "Unbilled" },
        { value: "BOTH", label: "Both" },
      ],
      default: "BOTH",
    },
    {
      kind: "select",
      key: "partFlag",
      label: "Purchase source",
      choices: [
        { value: "", label: "All" },
        { value: "O", label: "Original" },
        { value: "A", label: "Authorised source" },
        { value: "F", label: "FOC item" },
        { value: "L", label: "Local" },
      ],
      default: "",
    },
  ],
  columns: [
    {
      key: "returnNumber",
      label: "Return no / date",
      text: (row) => `${str(row, "returnNumber")} ${fmtDate(row.returnDate)}`,
      render: (row) => (
        <div className="whitespace-nowrap">
          <span className="font-medium">{str(row, "returnNumber")}</span>
          <div className="text-xs text-muted-foreground">{fmtDate(row.returnDate)}</div>
        </div>
      ),
    },
    {
      key: "requisitionNumber",
      label: "Requisition",
      text: (row) => (row.requisitionNumber ? `${str(row, "requisitionNumber")} ${fmtDate(row.requisitionDate)}` : "Direct issue"),
      render: (row) =>
        row.requisitionNumber ? (
          <div className="whitespace-nowrap">
            {str(row, "requisitionNumber")}
            <div className="text-xs text-muted-foreground">{fmtDate(row.requisitionDate)}</div>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Direct issue</span>
        ),
    },
    jobColumn({ withDate: true }),
    registrationColumn(),
    modelColumn(false),
    { key: "engineer", label: "Engineer", className: "whitespace-nowrap text-xs" },
    { key: "partNumber", label: "Part no", className: "whitespace-nowrap font-mono text-xs" },
    { key: "description", label: "Description", className: "min-w-40 text-xs" },
    chargeTypeBadge(),
    { key: "qtyIssued", label: "Issued", format: "integer" },
    { key: "qtyReturned", label: "Returned", format: "integer" },
    { key: "rate", label: "Rate", format: "money" },
    { key: "amount", label: "Amount", format: "money" },
    { key: "reason", label: "Reason", className: "min-w-32 text-xs" },
    {
      key: "billed",
      label: "Bill",
      text: (row) => (row.billed ? "Billed" : "Unbilled"),
      render: (row) => <StatusBadge status={row.billed ? "Billed" : "Unbilled"} tone={row.billed ? "emerald" : "amber"} className="px-2 py-0 text-xs" />,
    },
  ],
  noun: ["returned line", "returned lines"],
  subtotalLabel: (group) => `${group.label} · ${plural(group.count, ["line", "lines"])}`,
  summaryCards: (data) => [
    { label: "Lines returned", value: fmtNumber(data.totals.count ?? 0, "integer"), sub: `${fmtNumber(data.totals.qtyReturned ?? 0, "integer")} units`, tone: "blue" },
    { label: "Value returned", value: fmtMoney(data.totals.amount ?? 0), tone: "emerald" },
    { label: "On billed jobs", value: fmtNumber(Number(data.summary?.billed ?? 0), "integer"), tone: "gray" },
    { label: "On unbilled jobs", value: fmtNumber(Number(data.summary?.unbilled ?? 0), "integer"), tone: "amber" },
  ],
  footnote: "Only completed (or approved) returns count. Billed = the job has an active bill now.",
  emptyMessage: "No parts were returned in this period",
};

// ── S8. List of major problems ─────────────────────────────────────────────────

const majorProblems: ReportConfig = {
  slug: "major-problems",
  title: "List of major problems",
  description: "Customer complaints by defect code (free text as uncoded) or by job, with the major defect filter.",
  category: "Service MIS",
  subgroup: MIS_GROUPS.workshop,
  permission: "report:major-problems",
  width: 132,
  icon: TriangleAlert,
  period: { kind: "range", label: "Job opened", presets: RANGE_PRESETS, defaultPreset: "thisMonth" },
  filters: ["model", "variant", "serviceType", "serviceGroup", "engineer"],
  options: [
    { kind: "text", key: "fromCode", label: "From defect code", placeholder: "First code", maxLength: 50 },
    { kind: "text", key: "toCode", label: "To defect code", placeholder: "Last code", maxLength: 50 },
    jobTypeOption("REGULAR"),
    {
      kind: "segmented",
      key: "defects",
      label: "Defects",
      choices: [
        { value: "MAJOR", label: "Major defects" },
        { value: "ALL", label: "All defects" },
      ],
      default: "ALL",
      hint: "Major defects lists only codes flagged Major defect on the complaint master; free-text complaints are left out. A code range also leaves them out.",
    },
    {
      kind: "segmented",
      key: "view",
      label: "List",
      choices: [
        { value: "DEFECT", label: "Defect-wise" },
        { value: "JOB", label: "Job-wise" },
      ],
      default: "DEFECT",
    },
  ],
  columns: [
    jobColumn({ withDate: true }),
    registrationColumn(),
    modelColumn(),
    { key: "mileage", label: "Mileage", format: "integer" },
    { key: "engineer", label: "Engineer", className: "whitespace-nowrap text-xs" },
    {
      key: "code",
      label: "Defect",
      showWhen: { key: "view", values: ["JOB"] },
      text: (row) => (row.code ? `${str(row, "code")} ${str(row, "codeDescription")}` : "Uncoded"),
      render: (row) =>
        row.code ? (
          <div className="min-w-32">
            <span className="font-mono text-xs font-semibold">{str(row, "code")}</span> {row.major ? <StatusBadge status="Major" tone="red" className="ml-1 px-1.5 py-0 text-[11px]" /> : null}
            <div className="text-xs text-muted-foreground">{str(row, "codeDescription")}</div>
          </div>
        ) : (
          <span className="text-xs italic text-muted-foreground">Uncoded</span>
        ),
    },
    { key: "description", label: "Customer's words", className: "min-w-56" },
  ],
  noun: ["complaint", "complaints"],
  rowTone: (row) => (row.major ? "red" : undefined),
  subtotalLabel: (group) => `${group.label} · ${plural(group.totals.jobs ?? group.count, ["job", "jobs"])}`,
  totalLabel: (data) => `${plural(data.totals.count ?? 0, ["complaint", "complaints"])} on ${plural(data.totals.jobs ?? 0, ["job", "jobs"])}`,
  summaryCards: (data) => [
    { label: "Complaints", value: fmtNumber(Number(data.summary?.complaints ?? 0), "integer"), sub: `on ${plural(Number(data.summary?.jobs ?? 0), ["job", "jobs"])}`, tone: "blue" },
    { label: "Defect codes", value: fmtNumber(Number(data.summary?.codes ?? 0), "integer"), tone: "gray" },
    { label: "Uncoded (free text)", value: fmtNumber(Number(data.summary?.uncoded ?? 0), "integer"), sub: fmtNumber(pct(Number(data.summary?.uncoded ?? 0), Number(data.summary?.complaints ?? 0)), "percent"), tone: "amber" },
  ],
  footnote: "Defect-wise: one group per complaint code with its service group, counting jobs. Free-text complaints are listed under Uncoded (free text).",
  emptyMessage: "No complaints match these filters",
};

export const MIS_WORKSHOP_CONFIGS: ReportConfig[] = [groupProductivity, engineerPerformance, engineerPartConsumption, requisitionReturnRegister, majorProblems];

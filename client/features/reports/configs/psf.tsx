import { BarChart3, Frown, History, Lock, Mail, PhoneCall, Tags } from "lucide-react";
import { PsfStatusBadge } from "@/features/psf/components/psf-ui";
import { PSF_PERMISSIONS, PSF_STATUS } from "@/features/psf/lib/psf.logic";
import type { PsfStatus } from "@/features/psf/types/psf.types";
import { PsfLetterToolbar, PsfMailingLabels, PsfLetters, MailingToolbar } from "../components/psf/PsfPrint";
import { fmtDate, fmtDateTime, fmtNumber } from "../lib/report-format";
import type { ReportColumn, ReportConfig, ReportResponse, ReportRow } from "../types";
import { jobColumn, modelColumn, RANGE_PRESETS, registrationColumn, str } from "./shared";

const CATEGORY = "Service · Follow-up (PSF)" as const;
const CALLS = "Calls and lists";
const ANALYSIS = "Analysis";
const LETTERS = "Letters and mailing";
const PERIOD_HINT = "Filters the delivery date (Lagos time). Only delivered, not cancelled, non-PDI jobs are followed up. Each job counts at its current status (its last call).";
const DELIVERY_PERIOD = { kind: "range" as const, label: "Delivery date", presets: RANGE_PRESETS, defaultPreset: "thisMonth" as const, hint: PERIOD_HINT };

const pct = (value: unknown) => (value === null || value === undefined ? "—" : fmtNumber(value, "percent"));
const statusOf = (row: ReportRow, key = "status") => (row[key] ? (str(row, key) as PsfStatus) : null);
const statusText = (row: ReportRow, key = "status") => {
  const status = statusOf(row, key);
  return status ? PSF_STATUS[status].label : "Not followed up";
};
const codes = (row: ReportRow, key: string) => (Array.isArray(row[key]) ? (row[key] as { code: string; description: string; major?: boolean; status?: PsfStatus }[]) : []);

const statusColumn = (key = "status", label = "Follow-up status"): ReportColumn => ({
  key,
  label,
  text: (row) => statusText(row, key),
  value: (row) => PSF_STATUS[statusOf(row, key) ?? "SATISFIED"].code * (row[key] ? 1 : 0),
  render: (row) => <PsfStatusBadge status={statusOf(row, key)} short />,
});
const deliveredColumn: ReportColumn = { key: "deliveredAt", label: "Delivered", format: "date" };
const customerColumn: ReportColumn = { key: "customer", label: "Customer", className: "min-w-36" };
const phonesColumn: ReportColumn = { key: "customerPhones", label: "Phone numbers", className: "min-w-36 whitespace-pre-line text-xs", text: (row) => str(row, "customerPhones").split(" / ").join("\n") };
const addressColumn: ReportColumn = { key: "customerAddress", label: "Address", whenOption: "withAddress", className: "min-w-48 text-xs" };
const remarkColumn: ReportColumn = { key: "remark", label: "Remark", className: "min-w-48 text-xs" };
const withAddressOption = { kind: "checkbox" as const, key: "withAddress", label: "With address", local: true };
const openLink = (row: ReportRow) => (
  <a href={`/psf?job=${str(row, "jobId")}`} className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-primary hover:underline print:hidden">
    <PhoneCall className="size-3.5" /> Call
  </a>
);
const callColumn: ReportColumn = { key: "call", label: "", printHidden: true, text: () => "", render: openLink };

function countCards(data: ReportResponse) {
  const totals = data.totals;
  return [
    { label: "Delivered", value: fmtNumber(totals.delivered ?? 0, "integer"), sub: "In the period", tone: "blue" as const },
    { label: "Followed up", value: fmtNumber(totals.followedUp ?? 0, "integer"), sub: `${pct(totals.followedUpPct)} of delivered`, tone: "purple" as const },
    { label: "Reached", value: fmtNumber(totals.contacted ?? 0, "integer"), sub: "Satisfied + dissatisfied", tone: "gray" as const },
    { label: "Satisfaction", value: pct(totals.satisfactionPct), sub: "Satisfied ÷ reached", tone: "emerald" as const, muted: !totals.contacted },
    { label: "Dissatisfied", value: fmtNumber(totals.dissatisfied ?? 0, "integer"), tone: "red" as const },
    { label: "Not contacted", value: fmtNumber(totals.notContacted ?? 0, "integer"), sub: "Not followed up, no phone, not available", tone: "amber" as const },
  ];
}

// ── 2. Post-service follow-up list ─────────────────────────────────────────────

const followUpList: ReportConfig = {
  slug: "psf-followup-list",
  title: "Post-service follow-up list",
  description: "Who to call after delivery: customer, every phone, preferred call time, the work done and the current follow-up status. 100% or major labour, accidental vehicles and customers not contacted.",
  category: CATEGORY,
  subgroup: CALLS,
  permission: PSF_PERMISSIONS.READ,
  width: 132,
  icon: PhoneCall,
  period: DELIVERY_PERIOD,
  filters: [],
  options: [
    { kind: "segmented", key: "basis", label: "Follow-up basis", choices: [{ value: "ALL", label: "100% follow-up" }, { value: "MAJOR", label: "Major labour" }], default: "ALL" },
    { kind: "checkbox", key: "flaggedOnly", label: "Only labour marked for follow-up analysis", hint: "The legacy “Y / N” question: limits the labour (and the jobs) to items marked “Include labour for follow-up analysis”." },
    { kind: "checkbox", key: "includeAccidental", label: "Include accidental vehicles", default: true },
    withAddressOption,
    { kind: "segmented", key: "notContacted", label: "Customers not contacted", choices: [{ value: "INCLUDE", label: "Include" }, { value: "EXCLUDE", label: "Not include" }, { value: "ONLY", label: "Only" }], default: "INCLUDE", hint: "Not contacted = never followed up, no phone or not available." },
  ],
  columns: [
    jobColumn(),
    deliveredColumn,
    registrationColumn(),
    modelColumn(false),
    customerColumn,
    phonesColumn,
    addressColumn,
    { key: "preferred", label: "Prefers", className: "text-xs", text: (row) => [str(row, "preferredDay"), str(row, "preferredTime")].filter(Boolean).join(", ") },
    { key: "serviceType", label: "Service" },
    {
      key: "labour",
      label: "Labour",
      className: "min-w-44 text-xs",
      text: (row) => codes(row, "labour").map((line) => `${line.code}${line.major ? " (major)" : ""}`).join(", "),
      render: (row) => (
        <ul className="flex max-w-60 flex-wrap gap-1">
          {codes(row, "labour").map((line, index) => (
            <li key={`${line.code}-${index}`} title={line.description} className={line.major ? "rounded bg-amber-100 px-1 font-mono text-[11px] text-amber-800" : "rounded bg-slate-100 px-1 font-mono text-[11px] text-slate-700"}>{line.code}</li>
          ))}
        </ul>
      ),
    },
    statusColumn(),
    { key: "callCount", label: "Calls", format: "integer", align: "right" },
    callColumn,
  ],
  noun: ["job", "jobs"],
  summaryCards: (data) => [
    { label: "Jobs to list", value: fmtNumber(data.totals.count ?? 0, "integer"), tone: "blue" },
    { label: "Not contacted", value: fmtNumber(data.totals.notContacted ?? 0, "integer"), tone: "amber" },
    { label: "Reached", value: fmtNumber(data.totals.contacted ?? 0, "integer"), tone: "emerald" },
    { label: "Followed up", value: fmtNumber(data.totals.followedUp ?? 0, "integer"), tone: "purple" },
  ],
  rowTone: (row) => (row.status ? undefined : "amber"),
  totalLabel: (data) => `${fmtNumber(data.totals.count ?? 0, "integer")} jobs`,
  emptyMessage: "No delivered job matches these choices.",
};

// ── 3. Customer follow-up analysis ─────────────────────────────────────────────

const analysis: ReportConfig = {
  slug: "psf-analysis",
  title: "Customer follow-up analysis",
  description: "Jobs delivered and followed up, the jobs at each status with % of delivered and of followed up, satisfaction %, and the labour / service-wise satisfaction.",
  category: CATEGORY,
  subgroup: ANALYSIS,
  permission: PSF_PERMISSIONS.ANALYSIS,
  width: 80,
  icon: BarChart3,
  period: DELIVERY_PERIOD,
  filters: [],
  options: [{ kind: "checkbox", key: "labourWise", label: "Print labour-wise satisfaction", default: true }],
  columns: [
    { key: "code", label: "Code", align: "center", className: "w-14 font-mono" },
    { key: "label", label: "Status", text: (row) => str(row, "label"), render: (row) => (row.id === "NOT_FOLLOWED" ? <PsfStatusBadge status={null} /> : <PsfStatusBadge status={statusOf(row, "id")} />) },
    { key: "jobs", label: "Jobs", format: "integer", align: "right", totalKey: "delivered" },
    { key: "deliveredPct", label: "% of delivered", format: "percent", align: "right" },
    { key: "followedUpPct", label: "% of followed up", format: "percent", align: "right", totalKey: "followedUpShare", text: (row) => pct(row.followedUpPct) },
  ],
  noun: ["status", "statuses"],
  summaryCards: countCards,
  totalLabel: () => "Jobs delivered",
  footnote: "Followed up = status 1–5. Satisfaction % = satisfied ÷ (satisfied + dissatisfied): no phone, not available and closed are not counted as reached. Labour-wise figures use the lines of each job's last call.",
};

// ── 4. Model-wise ──────────────────────────────────────────────────────────────

const modelAnalysis: ReportConfig = {
  slug: "psf-analysis-model",
  title: "Customer follow-up analysis, model-wise",
  description: "The follow-up analysis per model: delivered, followed up, each status, not followed up and satisfaction %, for a range of models.",
  category: CATEGORY,
  subgroup: ANALYSIS,
  permission: PSF_PERMISSIONS.ANALYSIS_MODEL,
  width: 80,
  icon: BarChart3,
  period: DELIVERY_PERIOD,
  filters: [],
  options: [
    { kind: "lookup", key: "modelFrom", label: "From model", source: "model", all: "First model" },
    { kind: "lookup", key: "modelTo", label: "To model", source: "model", all: "Last model" },
  ],
  columns: [
    { key: "model", label: "Model", className: "font-medium" },
    { key: "delivered", label: "Delivered", format: "integer", align: "right" },
    { key: "followedUp", label: "Followed up", format: "integer", align: "right" },
    { key: "satisfied", label: "Satisfied", format: "integer", align: "right" },
    { key: "dissatisfied", label: "Dissatisfied", format: "integer", align: "right" },
    { key: "noPhone", label: "No phone", format: "integer", align: "right" },
    { key: "notAvailable", label: "Not avail.", format: "integer", align: "right" },
    { key: "closed", label: "Closed", format: "integer", align: "right" },
    { key: "notFollowed", label: "Not followed", format: "integer", align: "right" },
    { key: "satisfactionPct", label: "Satisf. %", format: "percent", align: "right" },
  ],
  noun: ["model", "models"],
  summaryCards: countCards,
  subtitle: (data) => {
    const summary = data.summary ?? {};
    return summary.modelFrom || summary.modelTo ? `Models ${summary.modelFrom ?? "first"} to ${summary.modelTo ?? "last"}` : "All models";
  },
  totalLabel: () => "Total",
  footnote: "Models in name order; the range keeps models whose names lie between the two chosen. With every model, the totals equal the customer follow-up analysis.",
};

// ── 5. / 6. Dissatisfied and closed ────────────────────────────────────────────

const dissatisfied: ReportConfig = {
  slug: "psf-dissatisfied",
  title: "Follow-up list for dissatisfied customers",
  description: "Customers who said they were dissatisfied, with the lines they were unhappy with and the remark: the list the service manager acts on.",
  category: CATEGORY,
  subgroup: CALLS,
  permission: PSF_PERMISSIONS.DISSATISFIED,
  width: 132,
  icon: Frown,
  period: DELIVERY_PERIOD,
  filters: ["model"],
  options: [withAddressOption],
  columns: [
    jobColumn(),
    deliveredColumn,
    registrationColumn(),
    modelColumn(false),
    customerColumn,
    phonesColumn,
    addressColumn,
    {
      key: "dissatisfiedLines",
      label: "Dissatisfied with",
      className: "min-w-44 text-xs",
      text: (row) => codes(row, "dissatisfiedLines").map((line) => `${line.code} ${line.description}`).join("; ") || "Overall",
      render: (row) => {
        const lines = codes(row, "dissatisfiedLines");
        return lines.length ? (
          <ul className="space-y-0.5">{lines.map((line, index) => <li key={`${line.code}-${index}`}><span className="font-mono font-semibold text-red-700">{line.code}</span> {line.description}</li>)}</ul>
        ) : <span className="text-slate-500">Overall</span>;
      },
    },
    remarkColumn,
    { key: "lastCalledAt", label: "Called", text: (row) => `${fmtDate(row.lastCalledAt)} ${str(row, "lastCalledBy")}`.trim(), render: (row) => <div className="whitespace-nowrap text-xs">{fmtDate(row.lastCalledAt)}<div className="text-muted-foreground">{str(row, "lastCalledBy")}</div></div> },
    { key: "receivedBy", label: "Service advisor", className: "text-xs" },
    callColumn,
  ],
  noun: ["dissatisfied customer", "dissatisfied customers"],
  summaryCards: (data) => [{ label: "Dissatisfied, still open", value: fmtNumber(data.totals.count ?? 0, "integer"), sub: "Closing the follow-up (5) takes a job off this list", tone: "red" }],
  rowTone: () => "red",
  totalLabel: (data) => `${fmtNumber(data.totals.count ?? 0, "integer")} customers`,
  emptyMessage: "No dissatisfied customer in this period.",
};

const closed: ReportConfig = {
  slug: "psf-closed",
  title: "List of follow-up closed",
  description: "Follow-ups closed (status 5) with the closing remark, who closed them, when, and the status before closing.",
  category: CATEGORY,
  subgroup: CALLS,
  permission: PSF_PERMISSIONS.CLOSED,
  width: 132,
  icon: Lock,
  period: DELIVERY_PERIOD,
  filters: ["model"],
  options: [withAddressOption],
  columns: [
    jobColumn(),
    deliveredColumn,
    registrationColumn(),
    modelColumn(false),
    customerColumn,
    phonesColumn,
    addressColumn,
    { key: "previousStatusLabel", label: "Before closing", className: "text-xs", text: (row) => str(row, "previousStatusLabel") || "—", render: (row) => (row.previousStatus ? <PsfStatusBadge status={statusOf(row, "previousStatus")} short /> : <span className="text-slate-300">—</span>) },
    { key: "remark", label: "Closing remark", className: "min-w-48 text-xs" },
    { key: "closedBy", label: "Closed by" },
    { key: "closedAt", label: "Closed on", format: "date" },
  ],
  noun: ["closed follow-up", "closed follow-ups"],
  summaryCards: (data) => [{ label: "Follow-ups closed", value: fmtNumber(data.totals.count ?? 0, "integer"), tone: "purple" }],
  totalLabel: (data) => `${fmtNumber(data.totals.count ?? 0, "integer")} closed`,
  emptyMessage: "No follow-up was closed for jobs delivered in this period.",
};

// ── 7. Vehicle follow-up history ───────────────────────────────────────────────

const history: ReportConfig = {
  slug: "psf-history",
  title: "Vehicle follow-up history",
  description: "Every follow-up call on a vehicle's jobs: attempt, date, caller, status, remark, booking and, with labour details, the status of each line.",
  category: CATEGORY,
  subgroup: CALLS,
  permission: PSF_PERMISSIONS.HISTORY,
  width: 132,
  icon: History,
  period: { ...DELIVERY_PERIOD, defaultPreset: "thisMonth" },
  filters: [],
  options: [
    { kind: "text", key: "registration", label: "Registration no.", placeholder: "e.g. LSL-901PF", maxLength: 20 },
    { kind: "checkbox", key: "allDates", label: "All delivery dates (ignore the period)" },
    { kind: "checkbox", key: "withLabour", label: "With labour details", default: true, local: true },
  ],
  validateOptions: (options) => (options.registration?.trim() ? null : "Enter the registration number of the vehicle."),
  columns: [
    jobColumn(),
    deliveredColumn,
    { key: "serviceType", label: "Service" },
    { key: "mileage", label: "Mileage", format: "integer", align: "right" },
    { key: "attempt", label: "Call", align: "center", text: (row) => (row.attempt ? `#${str(row, "attempt")}` : "—") },
    { key: "calledAt", label: "Called on", text: (row) => (row.calledAt ? fmtDateTime(row.calledAt) : "—") },
    { key: "calledBy", label: "Called by" },
    statusColumn("callStatus", "Status"),
    remarkColumn,
    { key: "booking", label: "Booking", className: "text-xs", text: (row) => (row.bookingAt ? `${fmtDateTime(row.bookingAt)}${row.bookingNumber ? ` · ${str(row, "bookingNumber")}` : ""}` : "") },
    {
      key: "lines",
      label: "Labour / service status",
      whenOption: "withLabour",
      className: "min-w-56 text-xs",
      text: (row) => codes(row, "lines").map((line) => `${line.code}: ${line.status ? PSF_STATUS[line.status].short : ""}`).join("; "),
      render: (row) => (
        <ul className="space-y-0.5">
          {codes(row, "lines").map((line, index) => (
            <li key={`${line.code}-${index}`} className="flex items-center gap-1.5"><span className="font-mono font-semibold">{line.code}</span><PsfStatusBadge status={line.status ?? null} short className="px-1.5 py-0 text-[10px]" /></li>
          ))}
        </ul>
      ),
    },
  ],
  noun: ["call", "calls"],
  subtitle: (data) => `Registration ${String((data.filters.query as Record<string, unknown>).registration ?? "").toUpperCase()}`,
  summaryCards: (data) => [
    { label: "Jobs", value: fmtNumber(data.totals.jobs ?? 0, "integer"), tone: "blue" },
    { label: "Calls", value: fmtNumber(data.totals.calls ?? 0, "integer"), tone: "purple" },
  ],
  rowTone: (row) => (row.callStatus === "DISSATISFIED" ? "red" : row.callId ? undefined : "amber"),
  totalLabel: (data) => `${fmtNumber(data.totals.calls ?? 0, "integer")} calls on ${fmtNumber(data.totals.jobs ?? 0, "integer")} jobs`,
  emptyMessage: "No delivered job of this vehicle in the period. Check the registration, or tick All delivery dates.",
};

// ── 8. Customer follow-up letter ───────────────────────────────────────────────

const letter: ReportConfig = {
  slug: "psf-letter",
  title: "Customer follow-up letter",
  description: "A letter to customers who could not be reached about their recent service: no phone, not available or not followed up. One letter per customer; customers without an address are left out.",
  category: CATEGORY,
  subgroup: LETTERS,
  permission: PSF_PERMISSIONS.LETTER,
  width: 80,
  icon: Mail,
  period: DELIVERY_PERIOD,
  filters: [],
  options: [
    { kind: "checkbox", key: "noPhone", label: "Customer has no phone", default: true },
    { kind: "checkbox", key: "notAvailable", label: "Customer not available", default: true },
    { kind: "checkbox", key: "notFollowedUp", label: "Customer not followed up", default: true },
    { kind: "checkbox", key: "printList", label: "Print list", default: false, local: true },
    { kind: "checkbox", key: "printLetters", label: "Print letters", default: true, local: true },
  ],
  validateOptions: (options) =>
    ["noPhone", "notAvailable", "notFollowedUp"].some((key) => options[key] === "true")
      ? ["printList", "printLetters"].some((key) => options[key] === "true") ? null : "Tick Print list or Print letters."
      : "Choose at least one group of customers.",
  columns: [
    { key: "customer", label: "Customer", className: "min-w-40 font-medium" },
    { key: "customerAddress", label: "Address", className: "min-w-48 text-xs", text: (row) => str(row, "customerAddress") || "No address: no letter" },
    { key: "groupLabels", label: "Reason", className: "min-w-40 text-xs" },
    { key: "jobNumber", label: "Latest job", text: (row) => `${str(row, "jobNumber")} · ${fmtDate(row.deliveredAt)}` },
    { key: "registrations", label: "Registration(s)" },
    { key: "jobCount", label: "Jobs", format: "integer", align: "right" },
  ],
  noun: ["customer", "customers"],
  summaryCards: (data) => [
    { label: "Customers", value: fmtNumber(data.totals.count ?? 0, "integer"), tone: "blue" },
    { label: "Letters to print", value: fmtNumber(data.totals.mailable ?? 0, "integer"), tone: "emerald" },
    { label: "No address (left out)", value: fmtNumber(data.totals.noAddress ?? 0, "integer"), tone: "amber", muted: !data.totals.noAddress },
  ],
  rowTone: (row) => (row.mailable ? undefined : "amber"),
  extra: (data) => <PsfLetterToolbar data={data} />,
  printList: (options) => options.printList === "true",
  printSections: (data, options) => (options.printLetters === "true" ? <PsfLetters data={data} /> : null),
  emptyMessage: "No customer to write to for these groups.",
};

// ── 9. Mailing list ────────────────────────────────────────────────────────────

const mailingList: ReportConfig = {
  slug: "psf-mailing-list",
  title: "Mailing list",
  description: "Customers' postal addresses for a city or every city, as a document or as A4 address labels. Customers without an address are counted and left out.",
  category: CATEGORY,
  subgroup: LETTERS,
  permission: PSF_PERMISSIONS.LETTER,
  width: 80,
  icon: Tags,
  period: { kind: "none", label: "", presets: [], defaultPreset: "today" },
  filters: [],
  options: [
    { kind: "segmented", key: "address", label: "Address", choices: [{ value: "CORRESPONDENCE", label: "Correspondence" }, { value: "REGISTRATION", label: "Registration" }], default: "CORRESPONDENCE", hint: "Customer records hold one address, so both choices print it." },
    { kind: "segmented", key: "layout", label: "Print as", choices: [{ value: "DOCUMENT", label: "Document" }, { value: "LABELS", label: "Labels" }], default: "DOCUMENT", local: true },
    { kind: "lookup", key: "city", label: "City", source: "customerCity", all: "All cities" },
  ],
  columns: [
    { key: "customer", label: "Customer", className: "min-w-40 font-medium" },
    { key: "customerAddress", label: "Address", className: "min-w-56" },
    { key: "city", label: "City" },
    { key: "phone", label: "Phone", className: "text-xs" },
    { key: "code", label: "Code", className: "font-mono text-xs" },
  ],
  noun: ["customer", "customers"],
  summaryCards: (data) => [
    { label: "Addresses", value: fmtNumber(data.totals.count ?? 0, "integer"), tone: "blue" },
    { label: "Left out: no address", value: fmtNumber(data.totals.noAddress ?? 0, "integer"), tone: "amber", muted: !data.totals.noAddress },
  ],
  extra: (data) => <MailingToolbar data={data} />,
  printList: (options) => options.layout !== "LABELS",
  printSections: (data, options) => (options.layout === "LABELS" ? <PsfMailingLabels data={data} /> : null),
  emptyMessage: "No customer with an address for this choice.",
};

export const PSF_CONFIGS: ReportConfig[] = [followUpList, dissatisfied, closed, history, analysis, modelAnalysis, letter, mailingList];

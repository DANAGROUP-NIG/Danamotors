import Link from "next/link";
import { CalendarX2, ClipboardList, PhoneCall, UserX } from "lucide-react";
import { fmtDate, fmtNumber, plural } from "../lib/report-format";
import type { ReportColumn, ReportConfig, ReportResponse, ReportRow } from "../types";
import { modelColumn, RANGE_PRESETS, registrationColumn, str } from "./shared";

const CATEGORY = "Service · CSC" as const;
const STAGE_SHORT: Record<string, string> = { FIRST: "1st", SECOND: "2nd", NOT_VISITED: "NV" };
const STATUS_LABEL: Record<string, string> = { OPEN: "Open", VISITED: "Visited", CLOSED: "Closed" };

interface Contact {
  stage: string;
  slot: number;
  date: string;
  person: string | null;
  remarks: string | null;
  doneBy: string | null;
}
const contactsOf = (row: ReportRow) => (Array.isArray(row.contacts) ? (row.contacts as Contact[]) : []);
const contactText = (contact: Contact) =>
  `${STAGE_SHORT[contact.stage] ?? contact.stage} ${fmtDate(contact.date)}${contact.person ? ` ${contact.person}` : ""}${contact.remarks ? `: ${contact.remarks}` : ""}${contact.doneBy ? ` (${contact.doneBy})` : ""}`;

const dueColumn: ReportColumn = {
  key: "dueDate",
  label: "Due / service",
  format: "date",
  text: (row) => `${fmtDate(row.dueDate)} ${str(row, "serviceCode")}`,
  render: (row) => (
    <div className="whitespace-nowrap">
      <div>{fmtDate(row.dueDate)}</div>
      <span className="font-mono text-xs font-semibold text-primary print:text-black" title={str(row, "serviceDescription")}>{str(row, "serviceCode")}</span>
      {row.dueMileage ? <span className="ml-1 text-xs text-muted-foreground">{fmtNumber(Number(row.dueMileage), "integer")} km</span> : null}
    </div>
  ),
};

const customerColumn: ReportColumn = {
  key: "customerName",
  label: "Customer / phone",
  className: "min-w-40",
  text: (row) => [str(row, "customerName"), str(row, "phone")].filter(Boolean).join(" / "),
  render: (row) => (
    <div>
      {str(row, "customerName") || <span className="text-slate-300">—</span>}
      {row.phone ? <div className="text-xs text-muted-foreground">{str(row, "phone")}</div> : null}
    </div>
  ),
};

const lastVisitColumn: ReportColumn = {
  key: "lastJobNumber",
  label: "Last visit",
  text: (row) => (row.lastJobNumber ? `${str(row, "lastJobNumber")} ${fmtDate(row.lastJobDate)}` : ""),
  render: (row) =>
    row.lastJobId ? (
      <div className="whitespace-nowrap">
        <Link href={`/job-cards/${str(row, "lastJobId")}`} className="font-mono text-sm text-blue-700 hover:underline print:text-black">{str(row, "lastJobNumber")}</Link>
        <div className="text-xs text-muted-foreground">{fmtDate(row.lastJobDate)}{row.lastMileage ? ` · ${fmtNumber(Number(row.lastMileage), "integer")} km` : ""}</div>
      </div>
    ) : (
      <span className="text-slate-300">—</span>
    ),
};

const contactsColumn: ReportColumn = {
  key: "contacts",
  label: "Calls made",
  className: "min-w-64 text-xs",
  value: (row) => contactsOf(row).length,
  text: (row) => contactsOf(row).map(contactText).join("; "),
  render: (row) => {
    const contacts = contactsOf(row);
    return contacts.length ? (
      <ul className="space-y-0.5">{contacts.map((contact) => <li key={`${contact.stage}-${contact.slot}`}>{contactText(contact)}</li>)}</ul>
    ) : (
      <span className="text-slate-400">Not called</span>
    );
  },
};

const outcomeText = (row: ReportRow) => {
  if (row.status === "VISITED") return `Visited ${str(row, "visitJobNumber")} ${fmtDate(row.visitDate)}`.trim();
  if (row.status === "CLOSED") return `Closed ${str(row, "closeReasonCode")} ${str(row, "closeReason")}`.trim();
  return row.bookingNumber ? `Booked ${fmtDate(row.bookedFor)}` : "Open";
};

const outcomeColumn: ReportColumn = {
  key: "status",
  label: "Outcome",
  className: "min-w-40",
  text: outcomeText,
  render: (row) => (
    <div className="text-sm">
      <span className={row.status === "VISITED" ? "font-medium text-emerald-700" : row.status === "CLOSED" ? "font-medium text-slate-600" : "text-blue-700"}>
        {STATUS_LABEL[str(row, "status")] ?? str(row, "status")}
      </span>
      {row.status === "VISITED" && row.visitJobId ? (
        <div className="text-xs">
          <Link href={`/job-cards/${str(row, "visitJobId")}`} className="font-mono text-blue-700 hover:underline print:text-black">{str(row, "visitJobNumber")}</Link> {fmtDate(row.visitDate)}
        </div>
      ) : null}
      {row.status === "CLOSED" ? <div className="text-xs text-muted-foreground">{str(row, "closeReasonCode")} {str(row, "closeReason")}</div> : null}
      {row.bookingNumber ? <div className="text-xs text-muted-foreground">Booked {fmtDate(row.bookedFor)}</div> : null}
    </div>
  ),
};

const serviceChips = (data: ReportResponse) => (data.breakdown ?? []).map((item) => `${item.label} ${item.count}`).join(" · ");

// ── Call sheet ────────────────────────────────────────────────────────────────

const callSheet: ReportConfig = {
  slug: "csc-call-sheet",
  title: "CSC call sheet",
  description: "The cases to call in a due period: vehicle, customer and phone, service, due date and mileage, last visit and call dates.",
  category: CATEGORY,
  subgroup: "Follow-up",
  permission: "csc:case:read",
  width: 132,
  icon: ClipboardList,
  period: { kind: "range", label: "Due date", presets: RANGE_PRESETS, defaultPreset: "thisMonth" },
  filters: ["model", "serviceType"],
  filterLabels: { serviceType: "Service" },
  options: [
    { kind: "segmented", key: "status", label: "Cases", choices: [{ value: "open", label: "Still open" }, { value: "all", label: "All" }], default: "open" },
  ],
  columns: [
    dueColumn,
    registrationColumn(true),
    modelColumn(),
    customerColumn,
    lastVisitColumn,
    { key: "followUp1Date", label: "1st call", format: "date" },
    { key: "followUp2Date", label: "2nd call", format: "date" },
    { key: "remarksBlank", label: "Remarks", className: "min-w-48", text: () => "", render: () => <span className="block h-5 border-b border-dotted border-slate-300" /> },
  ],
  noun: ["case", "cases"],
  totalLabel: (data) => `${plural(data.totals.count ?? 0, ["case", "cases"])}${data.breakdown?.length ? ` · ${serviceChips(data)}` : ""}`,
  summaryCards: (data) => [
    { label: "Cases", value: fmtNumber(data.totals.count ?? 0, "integer"), tone: "blue" },
    ...(data.breakdown ?? []).slice(0, 3).map((item) => ({ label: `Service ${item.label}`, value: fmtNumber(item.count, "integer"), tone: "purple" as const })),
  ],
  footnote: "Generate the cases first (CSC → Generate cases). The remarks column is left blank for notes during the calls.",
  emptyMessage: "No cases due in this period. Generate them first.",
};

// ── 7. CSC follow-up report ───────────────────────────────────────────────────

const followUp: ReportConfig = {
  slug: "csc-followup",
  title: "CSC follow-up report",
  description: "Cases due in a month with every call made, booking and outcome, and how many were contacted, booked, visited and closed.",
  category: CATEGORY,
  subgroup: "Follow-up",
  permission: "report:csc-followup",
  width: 132,
  icon: PhoneCall,
  period: { kind: "none", label: "Month", presets: [], defaultPreset: "thisMonth" },
  filters: ["model"],
  options: [
    { kind: "month", key: "month", label: "Month", default: "current" },
    { kind: "checkbox", key: "previousMonth", label: "Print previous month data", hint: "Adds the month before, grouped by month." },
  ],
  columns: [dueColumn, registrationColumn(), modelColumn(false), customerColumn, contactsColumn, outcomeColumn],
  noun: ["case", "cases"],
  subtotalLabel: (group) => `Due in ${group.label}`,
  totalLabel: (data) => `${plural(data.totals.count ?? 0, ["case", "cases"])} · ${data.totals.contacted ?? 0} contacted · ${data.totals.booked ?? 0} booked · ${data.totals.visited ?? 0} visited · ${data.totals.closed ?? 0} closed`,
  subtitle: (data) => (data.summary?.from ? `Due ${fmtDate(data.summary.from)} to ${fmtDate(data.summary.to)}` : ""),
  rowTone: (row) => (row.status === "CLOSED" ? "red" : row.status === "OPEN" && !contactsOf(row).length ? "amber" : undefined),
  summaryCards: (data) => {
    const total = data.totals.count ?? 0;
    const pct = (value: number) => (total ? `${Math.round((value / total) * 100)}% of cases` : undefined);
    return [
      { label: "Generated", value: fmtNumber(total, "integer"), tone: "blue" },
      { label: "Contacted", value: fmtNumber(data.totals.contacted ?? 0, "integer"), sub: pct(data.totals.contacted ?? 0), tone: "purple" },
      { label: "Booked", value: fmtNumber(data.totals.booked ?? 0, "integer"), sub: pct(data.totals.booked ?? 0), tone: "amber" },
      { label: "Visited", value: fmtNumber(data.totals.visited ?? 0, "integer"), sub: pct(data.totals.visited ?? 0), tone: "emerald" },
      { label: "Closed", value: fmtNumber(data.totals.closed ?? 0, "integer"), sub: pct(data.totals.closed ?? 0), tone: "red", muted: !data.totals.closed },
    ];
  },
  footnote: "Calls: 1st and 2nd follow-up and NV (not visited) calls with date, person, remarks and who called. Rows in amber are open and not yet called; red are closed without a visit.",
  emptyMessage: "No cases due in this month",
};

// ── 8. Vehicles not visited after due date ────────────────────────────────────

const notVisited: ReportConfig = {
  slug: "csc-not-visited",
  title: "Vehicles not visited after due date",
  description: "Open cases whose due date has passed with no visit, how long overdue, and whether they were followed up.",
  category: CATEGORY,
  subgroup: "Follow-up",
  permission: "report:csc-not-visited",
  width: 132,
  icon: CalendarX2,
  period: { kind: "range", label: "Due date", presets: RANGE_PRESETS, defaultPreset: "lastMonth" },
  filters: ["model"],
  options: [
    { kind: "number", key: "daysNotVisited", label: "Days not visited after due date", suffix: "days", min: 0, max: 3650, default: 0 },
    { kind: "checkbox", key: "onlyFollowedUp", label: "Consider only followed up vehicles" },
  ],
  columns: [
    dueColumn,
    { key: "daysOverdue", label: "Days overdue", format: "integer" },
    registrationColumn(true),
    modelColumn(),
    customerColumn,
    lastVisitColumn,
    contactsColumn,
  ],
  noun: ["vehicle", "vehicles"],
  totalLabel: (data) => `${plural(data.totals.count ?? 0, ["vehicle", "vehicles"])} · ${data.totals.followedUp ?? 0} followed up · ${data.totals.booked ?? 0} booked`,
  rowTone: (row) => (Number(row.daysOverdue ?? 0) >= 60 ? "red" : Number(row.daysOverdue ?? 0) >= 30 ? "orange" : undefined),
  summaryCards: (data) => [
    { label: "Not visited", value: fmtNumber(data.totals.count ?? 0, "integer"), tone: "red" },
    { label: "Followed up", value: fmtNumber(data.totals.followedUp ?? 0, "integer"), tone: "purple" },
    { label: "Booked", value: fmtNumber(data.totals.booked ?? 0, "integer"), tone: "amber", muted: !data.totals.booked },
  ],
  footnote: "A case counts once the match window after the due date (10 days by default) has passed. Orange: 30+ days overdue; red: 60+.",
  emptyMessage: "Every vehicle due in this period has visited or been closed",
};

// ── 9. No-show analysis ───────────────────────────────────────────────────────

const BY_LABEL: Record<string, string> = { model: "Model", service: "Service" };

const noShow: ReportConfig = {
  slug: "csc-no-show",
  title: "No-show analysis",
  description: "Cases closed without a visit, counted by closure reason, service-wise or model-wise.",
  category: CATEGORY,
  subgroup: "Analysis",
  permission: "report:csc-no-show",
  width: 132,
  icon: UserX,
  period: { kind: "range", label: "Due date", presets: RANGE_PRESETS, defaultPreset: "thisMonth" },
  filters: ["model", "serviceType"],
  filterLabels: { serviceType: "Service" },
  options: [
    { kind: "lookup", key: "reason", label: "Reason", source: "cscReason", all: "All reasons" },
    { kind: "segmented", key: "by", label: "Summary", choices: [{ value: "service", label: "Service wise" }, { value: "model", label: "Model wise" }], default: "model" },
  ],
  hasMode: true,
  defaultMode: "both",
  modeChoices: [
    { value: "both", label: "Detail with summary" },
    { value: "summary", label: "Summary only" },
    { value: "detail", label: "Detail only" },
  ],
  columns: [dueColumn, registrationColumn(), modelColumn(false), customerColumn, { key: "closeReason", label: "Reason", text: (row) => `${str(row, "closeReasonCode")} ${str(row, "closeReason")}` }, { key: "closeRemarks", label: "Remarks", className: "min-w-40 text-xs" }],
  columnsFor: (data, options) => {
    const reasonColumns: ReportColumn[] = (data.columns ?? []).map((column) => ({ key: column.key, label: column.label, format: "integer" as const, className: "min-w-24" }));
    if (options.mode === "summary") return [{ key: "groupLabel", label: BY_LABEL[options.by] ?? "Group", className: "min-w-48" }, { key: "count", label: "No-shows", format: "integer" }, ...reasonColumns];
    return [dueColumn, registrationColumn(), customerColumn, { key: "closeReason", label: "Reason", text: (row) => `${str(row, "closeReasonCode")} ${str(row, "closeReason")}` }, { key: "closeRemarks", label: "Remarks", className: "min-w-40 text-xs" }, ...reasonColumns];
  },
  noun: ["no-show", "no-shows"],
  subtotalLabel: (group) => group.label,
  totalLabel: (data) => `${plural(data.totals.count ?? 0, ["no-show", "no-shows"])}`,
  summaryCards: (data) => [
    { label: "No-shows", value: fmtNumber(data.totals.count ?? 0, "integer"), tone: "red" },
    ...[...(data.breakdown ?? [])].sort((a, b) => b.count - a.count).slice(0, 3).map((item) => ({ label: item.label, value: fmtNumber(item.count, "integer"), tone: "gray" as const })),
  ],
  footnote: "Counts cases closed with a final closure reason (no visit). A follow-up closure (e.g. customer not available) is not a no-show.",
  emptyMessage: "No cases closed without a visit in this period",
};

export const CSC_CONFIGS: ReportConfig[] = [callSheet, followUp, notVisited, noShow];

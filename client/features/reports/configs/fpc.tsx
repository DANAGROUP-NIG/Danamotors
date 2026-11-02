import Link from "next/link";
import { BarChart3, ClipboardCheck } from "lucide-react";
import { Pill } from "@/features/warranty/components/ui";
import { CAMPAIGN_VEHICLE_LABELS, CAMPAIGN_VEHICLE_TONES } from "@/features/warranty/lib/warranty-format";
import type { CampaignVehicleStatus } from "@/features/warranty/types/warranty.types";
import { FpcLetterToolbar } from "../components/fpc/FpcLetterTemplate";
import { FpcLabels, FpcLetters, FpcPrintButton } from "../components/fpc/FpcPrint";
import { fmtDate } from "../lib/report-format";
import type { ReportColumn, ReportConfig, ReportRow, SummaryCard } from "../types";
import { modelColumn, str } from "./shared";

const SHOWS = [
  { value: "TO_BE_CALLED", label: "To be called", tone: "amber" },
  { value: "CALLED_NOT_VISITED", label: "Called, not visited", tone: "blue" },
  { value: "VISITED_NOT_ATTENDED", label: "Visited, not attended", tone: "red" },
  { value: "ATTENDED", label: "Attended", tone: "emerald" },
  { value: "ATTENDED_NOT_CALLED", label: "Attended, not called", tone: "purple" },
] as const satisfies readonly { value: string; label: string; tone: SummaryCard["tone"] }[];

const VISIT_SHOWS = ["VISITED_NOT_ATTENDED", "ATTENDED", "ATTENDED_NOT_CALLED"];

/** A picked bulletin overrides the type; "All" types includes recalls and other campaigns. */
const CAMPAIGN_TYPE_CHOICES = [
  { value: "FPC", label: "FPC bulletins" },
  { value: "RECALL", label: "Recalls" },
  { value: "FREE_FIX", label: "Free fixes" },
  { value: "SERVICE_CAMPAIGN", label: "Service campaigns" },
  { value: "ALL", label: "All campaign types" },
];

function bulletinColumn<Row extends ReportRow>(withSubject: boolean): ReportColumn<Row> {
  return {
    key: "bulletin",
    label: withSubject ? "Bulletin / subject" : "Bulletin",
    text: (row) => (withSubject ? `${str(row, "bulletin")} ${str(row, "subject")}` : str(row, "bulletin")),
    value: (row) => str(row, "bulletin"),
    render: (row) => (
      <div className="min-w-36">
        <Link href={`/campaigns/${str(row, "campaignId")}`} className="font-mono text-xs font-semibold text-blue-700 underline-offset-2 hover:underline print:text-black">
          {str(row, "bulletin")}
        </Link>
        {withSubject && <div className="text-xs text-muted-foreground">{str(row, "subject")}</div>}
      </div>
    ),
  };
}

// ── F1. FPC vehicles ──────────────────────────────────────────────────────────

const vehicleColumns: ReportColumn[] = [
  bulletinColumn(false),
  {
    key: "vin",
    label: "VIN / registration",
    text: (row) => [str(row, "vin"), row.registered ? str(row, "registration") : "not registered"].filter(Boolean).join(" / "),
    value: (row) => str(row, "vin"),
    render: (row) => (
      <div className="whitespace-nowrap">
        {row.vehicleId ? (
          <Link href={`/vehicles/${str(row, "vehicleId")}`} className="font-mono text-xs text-blue-700 underline-offset-2 hover:underline print:text-black">
            {str(row, "vin")}
          </Link>
        ) : (
          <span className="font-mono text-xs">{str(row, "vin")}</span>
        )}
        <div className="text-xs text-muted-foreground">{row.registered ? str(row, "registration") || "—" : <span className="italic text-amber-700">Not registered</span>}</div>
      </div>
    ),
  },
  modelColumn(),
  {
    key: "customer",
    label: "Customer / phone",
    text: (row) => [str(row, "customer"), str(row, "customerPhone")].filter(Boolean).join(" / "),
    render: (row) =>
      row.customer ? (
        <div className="min-w-36">
          {str(row, "customer")}
          <div className="text-xs text-muted-foreground">{str(row, "customerPhone") || "No phone"}</div>
        </div>
      ) : (
        <span className="text-slate-300">—</span>
      ),
  },
  { key: "customerAddress", label: "Address", whenOption: "printAddress", className: "min-w-48 text-xs" },
  { key: "branchName", label: "Branch" },
  {
    key: "status",
    label: "Status",
    text: (row) => CAMPAIGN_VEHICLE_LABELS[str(row, "status") as CampaignVehicleStatus] ?? str(row, "status"),
    render: (row) => {
      const status = str(row, "status") as CampaignVehicleStatus;
      return (
        <div className="whitespace-nowrap">
          <Pill status={CAMPAIGN_VEHICLE_LABELS[status] ?? status} tone={CAMPAIGN_VEHICLE_TONES[status]} />
          <div className="mt-0.5 text-xs text-muted-foreground">{row.called ? `Called ×${str(row, "contacts")}` : "Not called"}</div>
        </div>
      );
    },
  },
  {
    key: "jobNumber",
    label: "Job no / date",
    showWhen: { key: "show", values: VISIT_SHOWS },
    text: (row) => `${str(row, "jobNumber")} ${fmtDate(row.jobDate)}`,
    value: (row) => str(row, "jobNumber"),
    render: (row) => (
      <div className="whitespace-nowrap">
        <Link href={`/job-cards/${str(row, "jobId")}`} className="font-medium text-blue-700 underline-offset-2 hover:underline print:text-black">
          {str(row, "jobNumber")}
        </Link>
        <div className="text-xs text-muted-foreground">{fmtDate(row.jobDate)}</div>
      </div>
    ),
  },
  { key: "billDate", label: "Bill date", format: "date", showWhen: { key: "show", values: VISIT_SHOWS } },
  { key: "notAttendedReason", label: "Not attended reason", showWhen: { key: "show", values: ["VISITED_NOT_ATTENDED"] }, className: "min-w-40 text-xs" },
];

const fpcVehicles: ReportConfig = {
  slug: "fpc-vehicles",
  title: "FPC vehicles",
  description: "Vehicles to be called, called, visited and attended under FPC bulletins, as a call list, customer letters or address labels.",
  category: "Service · FPC",
  permission: "report:fpc-vehicles",
  width: 80,
  icon: ClipboardCheck,
  period: { kind: "none", label: "", presets: [], defaultPreset: "today" },
  filters: ["model", "variant", "campaign"],
  options: [
    { kind: "segmented", key: "show", label: "Show", choices: SHOWS.map(({ value, label }) => ({ value, label })), default: "TO_BE_CALLED" },
    { kind: "select", key: "campaignType", label: "Campaign type", choices: CAMPAIGN_TYPE_CHOICES, default: "FPC", hint: "Picking bulletins under Filters overrides the campaign type." },
    {
      kind: "select",
      key: "order",
      label: "In the order of",
      choices: [
        { value: "MODEL", label: "Model" },
        { value: "VARIANT", label: "Variant" },
        { value: "REGISTRATION", label: "Registration" },
        { value: "VIN", label: "VIN" },
      ],
      default: "MODEL",
    },
    { kind: "checkbox", key: "printList", label: "Print list", default: true, local: true },
    { kind: "checkbox", key: "printLetters", label: "Letters", local: true },
    { kind: "checkbox", key: "printLabels", label: "Labels", local: true },
    { kind: "checkbox", key: "printAddress", label: "Address in list", local: true },
    {
      kind: "checkbox",
      key: "recordCalled",
      label: "Record as called when printing",
      local: true,
      visibleWhen: { key: "show", values: ["TO_BE_CALLED"] },
      hint: "Record as called adds one contact per vehicle printed (a letter, or the call list) after you confirm the count. Needs the campaign vehicle permission.",
    },
  ],
  columns: vehicleColumns,
  noun: ["vehicle", "vehicles"],
  summaryCards: (data, options) =>
    SHOWS.map((show) => ({
      label: show.label,
      value: Number(data.summary?.[show.value] ?? 0).toLocaleString("en-NG"),
      tone: show.tone,
      muted: options.show !== show.value,
      sub: options.show === show.value ? "Shown below" : undefined,
    })),
  rowTone: (row) => (row.registered ? undefined : "amber"),
  extra: (data) => <FpcLetterToolbar data={data} />,
  printList: (options) => options.printList === "true",
  printSections: (data, options) => (
    <>
      {options.printLetters === "true" && <FpcLetters data={data} />}
      {options.printLabels === "true" && <FpcLabels data={data} />}
    </>
  ),
  printAction: (context) => <FpcPrintButton {...context} />,
  validateOptions: (options) =>
    ["printList", "printLetters", "printLabels"].some((key) => options[key] === "true") ? null : "Tick at least one of Print list, Letters or Labels.",
  footnote: "Called: a contact was logged. Visited: a job card was opened under the bulletin. Attended: the job card recorded the FPC work as done. Amber rows are VINs not registered yet; they get no letter or label.",
  emptyMessage: "No vehicles in this list",
};

// ── F2. FPC analysis ──────────────────────────────────────────────────────────

const count = (key: string, label: string): ReportColumn => ({ key, label, format: "integer", align: "right" });

const fpcAnalysis: ReportConfig = {
  slug: "fpc-analysis",
  title: "FPC analysis",
  description: "Per bulletin: vehicles affected, called, visited and attended in the bill period, reasons for not attending, attended % and still outstanding.",
  category: "Service · FPC",
  permission: "report:fpc-analysis",
  width: 132,
  icon: BarChart3,
  period: {
    kind: "range",
    label: "Bill date",
    presets: ["thisMonth", "lastMonth", "thisWeek", "today"],
    defaultPreset: "thisMonth",
    hint: "Visited, attended and not attended count job cards billed in this period. Affected, called, attended % of affected and outstanding are to date.",
  },
  filters: ["model"],
  options: [
    { kind: "range", key: "bulletinDate", label: "FPC bulletin date", fromKey: "bulletinFrom", toKey: "bulletinTo", valueType: "date" },
    { kind: "select", key: "campaignType", label: "Campaign type", choices: CAMPAIGN_TYPE_CHOICES, default: "FPC" },
    {
      kind: "segmented",
      key: "order",
      label: "In the order of",
      choices: [
        { value: "MODEL", label: "Model" },
        { value: "BULLETIN_DATE", label: "Bulletin date" },
      ],
      default: "MODEL",
    },
  ],
  hasMode: true,
  columns: [
    bulletinColumn(true),
    { key: "bulletinDate", label: "Bulletin date", format: "date" },
    { key: "model", label: "Model", showWhen: { key: "order", values: ["MODEL"] } },
    {
      key: "effectiveDate",
      label: "Effective – close",
      text: (row) => `${fmtDate(row.effectiveDate)} – ${row.closeDate ? fmtDate(row.closeDate) : "open"}`,
      value: (row) => str(row, "effectiveDate"),
      className: "whitespace-nowrap",
    },
    count("affected", "Affected"),
    count("called", "Called"),
    count("visited", "Visited"),
    count("attended", "Attended"),
    count("notAttended", "Not attended"),
    { key: "reasons", label: "Not attended — reasons", className: "min-w-44 text-xs" },
    { key: "attendedPctVisited", label: "Att. % visited", format: "percent", align: "right" },
    { key: "attendedPctAffected", label: "Att. % affected", format: "percent", align: "right" },
    count("outstanding", "Outstanding"),
  ],
  noun: ["bulletin", "bulletins"],
  summaryCards: (data) => [
    { label: "Vehicles affected", value: (data.totals.affected ?? 0).toLocaleString("en-NG"), tone: "gray" },
    { label: "Called", value: (data.totals.called ?? 0).toLocaleString("en-NG"), tone: "blue" },
    { label: "Visited in period", value: (data.totals.visited ?? 0).toLocaleString("en-NG"), tone: "purple" },
    {
      label: "Attended in period",
      value: (data.totals.attended ?? 0).toLocaleString("en-NG"),
      sub: data.totals.attendedPctVisited !== undefined ? `${data.totals.attendedPctVisited}% of visits` : undefined,
      tone: "emerald",
    },
    { label: "Not attended", value: (data.totals.notAttended ?? 0).toLocaleString("en-NG"), sub: data.summary?.reasons ? String(data.summary.reasons) : undefined, tone: "red" },
    { label: "Still outstanding", value: (data.totals.outstanding ?? 0).toLocaleString("en-NG"), tone: "amber" },
  ],
  subtotalLabel: (group) => `Total ${group.label}`,
  totalLabel: () => "Grand total",
  footnote: "Visited = attended + not attended. Not answered: visits from before the job card asked whether the FPC work was done.",
  emptyMessage: "No bulletins match these filters",
};

export const FPC_CONFIGS: ReportConfig[] = [fpcVehicles, fpcAnalysis];

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { LookupSource } from "./api/reports.api";

export type FilterKey =
  | "model"
  | "variant"
  | "serviceType"
  | "team"
  | "receivedBy"
  | "deliveredBy"
  | "technician"
  | "complaint"
  | "labourOperation"
  | "campaign"
  | "engineer"
  | "serviceGroup"
  | "freeService";

export type ReportMode = "both" | "summary" | "detail";
export type ReportWidth = 80 | 132;
export type ReportCategory = "Front office" | "Workshop" | "Productivity" | "Billing" | "Vehicle analysis" | "Finance" | "Service · FPC" | "Service MIS";

export interface ReportBranch {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phoneNumber: string | null;
}

export interface ReportGroup {
  key: string;
  label: string;
  count: number;
  totals: Record<string, number>;
}

export interface AppliedFilter {
  key: string;
  label: string;
  values: string[];
}

export type ReportRow = Record<string, unknown> & { groupKey?: string };

export interface ReportResponse<Row extends ReportRow = ReportRow> {
  report: { slug: string; title: string; width: ReportWidth; generatedAt: string };
  filters: { query: Record<string, unknown>; applied: AppliedFilter[] };
  rows: Row[];
  groups: ReportGroup[];
  totals: Record<string, number>;
  summary?: Record<string, number | string | null>;
  breakdown?: { key: string; label: string; count: number; amount?: number }[];
  /** Columns that depend on the data (months, service types, branches) in matrix reports. */
  columns?: { key: string; label: string; format?: ColumnFormat }[];
  meta: { rowCount: number; truncated: boolean; branch: ReportBranch | "ALL"; timeZone: string };
}

export interface LookupOption {
  id: string;
  label: string;
  code?: string | null;
  parentId?: string | null;
  active: boolean;
}

export type ColumnFormat = "text" | "date" | "datetime" | "time" | "money" | "number" | "integer" | "hours" | "percent";

export interface ReportColumn<Row extends ReportRow = ReportRow> {
  key: string;
  label: string;
  format?: ColumnFormat;
  align?: "left" | "right" | "center";
  /** Custom cell for the screen; print and Excel use the formatted value. */
  render?: (row: Row) => ReactNode;
  /** Plain value for sorting, print and Excel when it differs from row[key]. */
  value?: (row: Row) => string | number | null | undefined;
  /** Display text for print, Excel and the default cell when it differs from the formatted value. */
  text?: (row: Row) => string;
  /** Subtotal/total key in groups[].totals / totals (defaults to key when the column is summed). */
  totalKey?: string;
  /** Format of the subtotal/total when it differs from the cells (e.g. a count under a date column). */
  totalFormat?: ColumnFormat;
  /** Custom on-screen subtotal/total cell (print and Excel use the formatted value). */
  renderTotal?: (value: number) => ReactNode;
  /** Shown only when this option is on (e.g. printAddress). */
  whenOption?: string;
  /** Shown only while an option has one of these values (e.g. job columns on visit lists). */
  showWhen?: { key: string; values: string[] };
  /** Hidden in print (screen-only helper columns). */
  printHidden?: boolean;
  className?: string;
}

export type OptionDef = (
  | { kind: "checkbox"; key: string; label: string; default?: boolean }
  | { kind: "segmented"; key: string; label?: string; choices: { value: string; label: string }[]; default: string }
  | { kind: "select"; key: string; label: string; choices: { value: string; label: string }[]; default: string }
  | {
      kind: "number";
      key: string;
      label: string;
      suffix?: string;
      min: number;
      max: number;
      default: number;
    }
  /** A from/to filter with an "All" toggle (e.g. mileage, or dates). Shown with the filters. */
  | { kind: "range"; key: string; label: string; fromKey: string; toKey: string; unit?: string; valueType?: "number" | "date" }
  /** A month (YYYY-MM). Shown with the filters; defaults to this month or January of this year. */
  | { kind: "month"; key: string; label: string; default: "current" | "yearStart" }
  /** Free text such as a registration number; blank = All. Shown with the filters. */
  | { kind: "text"; key: string; label: string; placeholder?: string; maxLength: number }
  /** One value from a lookup list, or All (blank). Shown with the filters. */
  | { kind: "lookup"; key: string; label: string; source: LookupSource; all: string }
  /** Any combination of choices, sent comma separated; none ticked = All. */
  | { kind: "multi"; key: string; label: string; choices: { value: string; label: string }[] }
  /** A day and month without a year (e.g. 08 Oct). Shown with the filters. */
  | { kind: "dayMonth"; key: string; label: string; dayKey: string; monthKey: string; defaultDay: number; defaultMonth: number }
) & {
  /** Display-only option: kept in the URL but not sent to the server (e.g. print address). */
  local?: boolean;
  /** Shown (and sent) only while another option has one of these values. */
  visibleWhen?: { key: string; values: string[] };
  /** Help text under the options. */
  hint?: string;
};

export type PresetKey = "today" | "yesterday" | "tomorrow" | "thisWeek" | "thisMonth" | "lastMonth";

export type RowStyle = "heading" | "subtotal" | "total" | "memo" | "note";

export interface PeriodDef {
  /** "none": the report has no period (e.g. FPC vehicle lists). */
  kind: "range" | "date" | "none";
  label: string;
  /** Label for the single date, e.g. "As on". */
  dateLabel?: string;
  presets: PresetKey[];
  defaultPreset: PresetKey;
  /** Shown as an info tooltip next to the period label. */
  hint?: string;
  /** Optional "Date on" choice (e.g. job date / bill date). */
  basis?: { key: string; choices: { value: string; label: string }[]; default: string };
}

export interface SummaryCard {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "gray" | "blue" | "purple" | "emerald" | "amber" | "red" | "orange";
  muted?: boolean;
}

export interface ReportConfig<Row extends ReportRow = ReportRow> {
  slug: string;
  title: string;
  description: string;
  category: ReportCategory;
  /** Heading within the category on the reports hub. */
  subgroup?: string;
  permission: string;
  width: ReportWidth;
  icon: LucideIcon;
  period: PeriodDef;
  filters: FilterKey[];
  options?: OptionDef[];
  /** True when the report has the detail / summary choice. */
  hasMode?: boolean;
  defaultMode?: ReportMode;
  /** Mode choices when not all three apply (e.g. detail or summary only). */
  modeChoices?: { value: ReportMode; label: string }[];
  columns: ReportColumn<Row>[];
  /** Columns once the data is in (matrix reports whose columns are months, service types or branches). */
  columnsFor?: (data: ReportResponse<Row>, options: Record<string, string>) => ReportColumn<Row>[];
  /** Emphasis of a row in matrix reports (heading, subtotal, total, memo or note lines). */
  rowStyle?: (row: Row) => RowStyle | undefined;
  /** Indent level of a row's first cell (0–2). */
  rowIndent?: (row: Row) => number;
  /** Matrix reports carry their own total lines, so the automatic subtotal and grand total rows are left out. */
  hideSubtotals?: boolean;
  hideGrandTotal?: boolean;
  /** Noun for the result count, e.g. ["job card", "job cards"]. */
  noun: [string, string];
  summaryCards?: (data: ReportResponse<Row>, options: Record<string, string>) => SummaryCard[];
  /** Left border / tint for a row. */
  rowTone?: (row: Row) => "red" | "amber" | "orange" | undefined;
  /** Extra content under a row (e.g. estimate lines, labour details). */
  rowDetail?: (row: Row, options: Record<string, string>) => ReactNode | null;
  /** Text for the subtotal row of a group. */
  subtotalLabel?: (group: ReportGroup) => string;
  /** Text for the grand total row. */
  totalLabel?: (data: ReportResponse<Row>) => string;
  /** Describes the selection when the period alone does not (e.g. the months of a monthly report); used in print and Excel headings. */
  subtitle?: (data: ReportResponse) => string;
  /** Content between the summary strip and the table (charts, summary tables). */
  extra?: (data: ReportResponse<Row>) => ReactNode;
  /** Legend / footnote under the table. */
  footnote?: string;
  emptyMessage?: string;
  /** Print the table (the default). False leaves only printSections, e.g. letters alone. */
  printList?: (options: Record<string, string>) => boolean;
  /** Extra print-only sections after the table (letters, labels). */
  printSections?: (data: ReportResponse<Row>, options: Record<string, string>) => ReactNode;
  /** Replaces the Print button, e.g. to confirm recording contacts before printing. */
  printAction?: (context: { data: ReportResponse<Row> | undefined; options: Record<string, string>; disabled: boolean; print: () => void }) => ReactNode;
  /** Problem with the chosen options before running, or null. */
  validateOptions?: (options: Record<string, string>) => string | null;
}

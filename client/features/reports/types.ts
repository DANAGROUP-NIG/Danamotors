import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type FilterKey =
  | "model"
  | "variant"
  | "serviceType"
  | "team"
  | "receivedBy"
  | "deliveredBy"
  | "technician"
  | "complaint"
  | "labourOperation";

export type ReportMode = "both" | "summary" | "detail";
export type ReportWidth = 80 | 132;
export type ReportCategory = "Front office" | "Workshop" | "Productivity" | "Billing" | "Vehicle analysis" | "Finance";

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
  /** Shown only when this option is on (e.g. printAddress). */
  whenOption?: string;
  /** Hidden in print (screen-only helper columns). */
  printHidden?: boolean;
  className?: string;
}

export type OptionDef = (
  | { kind: "checkbox"; key: string; label: string; default?: boolean }
  | { kind: "segmented"; key: string; label?: string; choices: { value: string; label: string }[]; default: string }
  | { kind: "select"; key: string; label: string; choices: { value: string; label: string }[]; default: string }
  | { kind: "number"; key: string; label: string; suffix?: string; min: number; max: number; default: number }
) & {
  /** Display-only option: kept in the URL but not sent to the server (e.g. print address). */
  local?: boolean;
};

export type PresetKey = "today" | "yesterday" | "tomorrow" | "thisWeek" | "thisMonth" | "lastMonth";

export interface PeriodDef {
  kind: "range" | "date";
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
  permission: string;
  width: ReportWidth;
  icon: LucideIcon;
  period: PeriodDef;
  filters: FilterKey[];
  options?: OptionDef[];
  /** True when the report has the detail / summary choice. */
  hasMode?: boolean;
  defaultMode?: ReportMode;
  columns: ReportColumn<Row>[];
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
  /** Content between the summary strip and the table (charts, summary tables). */
  extra?: (data: ReportResponse<Row>) => ReactNode;
  /** Legend / footnote under the table. */
  footnote?: string;
  emptyMessage?: string;
}

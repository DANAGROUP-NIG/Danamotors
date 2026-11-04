import { StatusBadge, type StatusTone } from "@/components/ui/table-components/StatusBadge";
import { cn } from "@/lib/utils";
import { fmtMoney, fmtNumber, formatValue } from "../lib/report-format";
import type { ColumnFormat, OptionDef, ReportColumn, ReportResponse, ReportRow, RowStyle } from "../types";
import { str } from "./shared";

/** Hub headings for the Service MIS reports (#97). */
export const MIS_GROUPS = {
  summary: "Revenue and job summaries",
  workshop: "Workshop and parts",
  lists: "Customers and vehicles",
  management: "Management",
} as const;

export const SERVICE_CATEGORIES: Record<string, { label: string; tone: StatusTone }> = {
  FREE: { label: "Free services", tone: "emerald" },
  PAID: { label: "Paid service", tone: "blue" },
  RUNNING_REPAIR: { label: "Running repair", tone: "amber" },
  OTHER: { label: "Other services", tone: "gray" },
  ACCIDENTAL: { label: "Accidental", tone: "red" },
  PDI: { label: "PDI", tone: "purple" },
};

/** Fill colours (Tailwind palette variables) per category for bars and charts. */
export const CATEGORY_FILL: Record<string, string> = {
  FREE: "bg-emerald-500",
  PAID: "bg-blue-500",
  RUNNING_REPAIR: "bg-amber-400",
  OTHER: "bg-slate-400",
  ACCIDENTAL: "bg-red-500",
  PDI: "bg-purple-500",
};

/** Legacy job type: regular, PDI or both. */
export function jobTypeOption(defaultValue: "REGULAR" | "PDI" | "BOTH"): OptionDef {
  return {
    kind: "segmented",
    key: "jobType",
    label: "Job type",
    choices: [
      { value: "REGULAR", label: "Regular" },
      { value: "PDI", label: "PDI" },
      { value: "BOTH", label: "Both" },
    ],
    default: defaultValue,
  };
}

export const CHARGE_TYPES: Record<string, { label: string; tone: StatusTone }> = {
  CUSTOMER: { label: "Non-warranty", tone: "blue" },
  WARRANTY: { label: "Warranty", tone: "purple" },
  GOODWILL: { label: "Goodwill", tone: "amber" },
  FREE: { label: "FOC", tone: "emerald" },
};

export function categoryBadge<Row extends ReportRow>(key = "category", label = "Category"): ReportColumn<Row> {
  return {
    key,
    label,
    text: (row) => SERVICE_CATEGORIES[str(row, key)]?.label ?? str(row, key),
    render: (row) => {
      const category = SERVICE_CATEGORIES[str(row, key)];
      return category ? <StatusBadge status={category.label} tone={category.tone} className="whitespace-nowrap px-2 py-0 text-xs" /> : str(row, key);
    },
  };
}

export function chargeTypeBadge<Row extends ReportRow>(): ReportColumn<Row> {
  return {
    key: "chargeType",
    label: "Type",
    text: (row) => CHARGE_TYPES[str(row, "chargeType")]?.label ?? str(row, "chargeType"),
    render: (row) => {
      const type = CHARGE_TYPES[str(row, "chargeType")];
      return type ? <StatusBadge status={type.label} tone={type.tone} className="whitespace-nowrap px-2 py-0 text-xs" /> : str(row, "chargeType");
    },
  };
}

// ── Matrix reports (S1, S3, S15): label column, data columns, row emphasis ─────

export const matrixRowStyle = (row: ReportRow): RowStyle | undefined => {
  const kind = str(row, "kind");
  return kind === "heading" || kind === "subtotal" || kind === "total" || kind === "memo" || kind === "note" ? kind : undefined;
};

export const matrixIndent = (row: ReportRow) => Number(row.level ?? 0);

export function labelColumn<Row extends ReportRow>(label: string): ReportColumn<Row> {
  return { key: "label", label, className: "min-w-56" };
}

/** The data-driven columns, each formatted per row by `formatOf` (e.g. counts in a money matrix). */
export function dataColumns<Row extends ReportRow>(data: ReportResponse<Row>, formatOf: (row: Row, column: { format?: ColumnFormat }) => ColumnFormat): ReportColumn<Row>[] {
  return (data.columns ?? []).map((column) => ({
    key: column.key,
    label: column.label,
    format: "number",
    align: "right",
    text: (row: Row) => formatValue(row[column.key], formatOf(row, column)),
  }));
}

// ── Visuals ───────────────────────────────────────────────────────────────────

/** Labelled horizontal share bars, e.g. revenue by service category. */
export function ShareBars({ title, items, format = "money" }: { title: string; items: { key: string; label: string; value: number; fill?: string }[]; format?: "money" | "integer" }) {
  const total = items.reduce((sum, item) => sum + Math.max(item.value, 0), 0);
  if (!total) return null;
  return (
    <section className="rounded-xl border border-border bg-white p-4 shadow-sm sm:p-5" aria-label={title}>
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden>
        {items.map((item) => (
          <span key={item.key} className={cn("h-full", item.fill ?? "bg-primary")} style={{ width: `${(Math.max(item.value, 0) / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <li key={item.key} className="flex min-w-0 items-center gap-2 text-sm">
            <span className={cn("size-2.5 shrink-0 rounded-sm", item.fill ?? "bg-primary")} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-slate-700">{item.label}</span>
            <span className="tabular-nums font-medium text-slate-900">{format === "money" ? fmtMoney(item.value) : fmtNumber(item.value, "integer")}</span>
            <span className="w-14 text-right tabular-nums text-muted-foreground">{fmtNumber((Math.max(item.value, 0) / total) * 100, "percent")}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Background tint for a % cell (0–100) in the analysis grid, from the existing palette. */
export function heatClass(value: number): string {
  if (value >= 50) return "bg-blue-200/80";
  if (value >= 25) return "bg-blue-100";
  if (value >= 10) return "bg-blue-50";
  return "";
}

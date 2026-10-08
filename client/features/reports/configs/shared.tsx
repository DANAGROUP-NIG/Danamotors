import Link from "next/link";
import { StatusBadge, type StatusTone } from "@/components/ui/table-components/StatusBadge";
import { fmtDate } from "../lib/report-format";
import type { FilterKey, OptionDef, PeriodDef, ReportColumn, ReportRow } from "../types";

export const STD_FILTERS: FilterKey[] = ["model", "variant", "serviceType", "team", "receivedBy"];
export const STD_WITH_DELIVERED: FilterKey[] = [...STD_FILTERS, "deliveredBy"];

export const RANGE_PRESETS: PeriodDef["presets"] = ["today", "yesterday", "thisWeek", "thisMonth", "lastMonth"];

export const printAddressOption: OptionDef = { kind: "checkbox", key: "printAddress", label: "Print address", local: true };

export const JOB_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  OPEN: { label: "Open", tone: "gray" },
  IN_PROGRESS: { label: "In progress", tone: "blue" },
  QC: { label: "QC", tone: "purple" },
  READY: { label: "Ready", tone: "emerald" },
  BILLED: { label: "Billed – not delivered", tone: "amber" },
  DELIVERED: { label: "Delivered", tone: "emerald" },
  CANCELLED: { label: "Cancelled", tone: "red" },
};

export const str = (row: ReportRow, key: string) => (row[key] === null || row[key] === undefined ? "" : String(row[key]));

/** Job number linking to the job card, with the job date beneath. */
export function jobColumn<Row extends ReportRow>(options: { withDate?: boolean; label?: string } = {}): ReportColumn<Row> {
  return {
    key: "jobNumber",
    label: options.label ?? (options.withDate ? "Job no / date" : "Job no"),
    text: (row) => (options.withDate ? `${str(row, "jobNumber")} ${fmtDate(row.jobDate)}` : str(row, "jobNumber")),
    value: (row) => str(row, "jobNumber"),
    render: (row) => (
      <div className="whitespace-nowrap">
        {row.jobId ? (
          <Link href={`/job-cards/${String(row.jobId)}`} className="font-medium text-blue-700 underline-offset-2 hover:underline print:text-black">
            {str(row, "jobNumber")}
          </Link>
        ) : (
          <span className="font-medium">{str(row, "jobNumber")}</span>
        )}
        {options.withDate && <div className="text-xs text-muted-foreground">{fmtDate(row.jobDate)}</div>}
      </div>
    ),
  };
}

export function statusColumn<Row extends ReportRow>(key = "status", label = "Status"): ReportColumn<Row> {
  return {
    key,
    label,
    text: (row) => JOB_STATUS[str(row, key)]?.label ?? str(row, key),
    render: (row) => {
      const status = JOB_STATUS[str(row, key)];
      return status ? <StatusBadge status={status.label} tone={status.tone} className="whitespace-nowrap px-2 py-0 text-xs" /> : str(row, key);
    },
  };
}

/** Customer address and phone, shown only when "Print address" is ticked. */
export function addressColumns<Row extends ReportRow>(): ReportColumn<Row>[] {
  return [
    { key: "customerAddress", label: "Address", whenOption: "printAddress", className: "min-w-48 text-xs" },
    { key: "customerPhone", label: "Phone", whenOption: "printAddress", className: "whitespace-nowrap text-xs" },
  ];
}

/** Registration with the VIN beneath (VIN is its own value for print and Excel). */
export function registrationColumn<Row extends ReportRow>(withVin = false): ReportColumn<Row> {
  return {
    key: "registration",
    label: withVin ? "Registration / VIN" : "Registration",
    text: (row) => (withVin ? [str(row, "registration"), str(row, "vin")].filter(Boolean).join(" / ") : str(row, "registration")),
    render: (row) => (
      <div className="whitespace-nowrap">
        {str(row, "registration") || <span className="text-slate-300">—</span>}
        {withVin && row.vin ? <div className="font-mono text-xs text-muted-foreground">{str(row, "vin")}</div> : null}
      </div>
    ),
  };
}

export function modelColumn<Row extends ReportRow>(withVariant = true): ReportColumn<Row> {
  return {
    key: "model",
    label: withVariant ? "Model · Variant" : "Model",
    text: (row) => (withVariant ? [str(row, "model"), str(row, "variant")].filter(Boolean).join(" · ") : str(row, "model")),
    render: (row) => (
      <div>
        {str(row, "model") || <span className="text-slate-300">—</span>}
        {withVariant && row.variant ? <div className="text-xs text-muted-foreground">{str(row, "variant")}</div> : null}
      </div>
    ),
  };
}

export const count = (data: { totals: Record<string, number> }, key = "count") => data.totals[key] ?? 0;

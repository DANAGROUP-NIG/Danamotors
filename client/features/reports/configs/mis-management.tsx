import { Info, LayoutDashboard } from "lucide-react";
import { fmtMoney, fmtNumber, formatValue } from "../lib/report-format";
import type { ColumnFormat, ReportColumn, ReportConfig, ReportResponse } from "../types";
import { labelColumn, matrixRowStyle, MIS_GROUPS } from "./mis-shared";
import { RANGE_PRESETS, str } from "./shared";

const lineValue = (data: ReportResponse, id: string) => {
  const row = data.rows.find((candidate) => candidate.id === id);
  return row ? Number(row.total ?? 0) : null;
};

const managementInformation: ReportConfig = {
  slug: "management-information",
  title: "Management information report",
  description: "The branch scorecard: workshop, counter sale, stock, parts profit, billing, transfers, purchases and outstanding — one column per branch for cross-branch users.",
  category: "Service MIS",
  subgroup: MIS_GROUPS.management,
  permission: "report:management-information",
  width: 80,
  icon: LayoutDashboard,
  period: { kind: "range", label: "Period", presets: RANGE_PRESETS, defaultPreset: "lastMonth", hint: "Choose All branches to get one column per branch and a total (cross-branch users)." },
  filters: [],
  options: [
    { kind: "checkbox", key: "stockAtDealerRate", label: "Stock based on dealer rate" },
    { kind: "checkbox", key: "profitAtDealerRate", label: "Profitability based on dealer rate", hint: "Stock and profit are valued at FIFO cost unless dealer rate is ticked, as in the parts reports." },
  ],
  columns: [labelColumn("Particulars")],
  columnsFor: (data) => [
    labelColumn("Particulars"),
    ...(data.columns ?? []).map(
      (column): ReportColumn => ({
        key: column.key,
        label: column.label,
        format: "number",
        align: "right",
        text: (row) => (row.kind === "note" ? "Not recorded" : formatValue(row[column.key], str(row, "format") as ColumnFormat)),
      }),
    ),
  ],
  rowStyle: matrixRowStyle,
  hideSubtotals: true,
  hideGrandTotal: true,
  noun: ["line", "lines"],
  summaryCards: (data) => {
    const billing = lineValue(data, "e-total");
    const outstanding = lineValue(data, "o-total");
    const profit = lineValue(data, "d-profit");
    return [
      { label: "Total billing", value: fmtMoney(billing ?? 0), sub: "Workshop + counter sale", tone: "blue" },
      { label: "Vehicles", value: fmtNumber(Number(data.summary?.vehicles ?? 0), "integer"), sub: "Delivered in the period", tone: "emerald" },
      { label: "Labour (net)", value: fmtMoney(lineValue(data, "a1-labour") ?? 0), tone: "purple" },
      profit === null ? { label: "Parts profit", value: "—", sub: "Needs stock:read", tone: "gray", muted: true } : { label: "Parts profit", value: fmtMoney(profit), tone: "amber" },
      outstanding === null
        ? { label: "Outstanding", value: "—", sub: "Needs the age-wise outstanding permission", tone: "gray", muted: true }
        : { label: "Outstanding", value: fmtMoney(outstanding), sub: `${fmtNumber(lineValue(data, "o-pct") ?? 0, "percent")} of billing`, tone: "red" },
    ];
  },
  extra: (data) =>
    Number(data.summary?.hidden ?? 0) > 0 ? (
      <p role="note" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        Some sections are hidden because they come from reports you do not have access to (closing stock and parts profit need stock:read; outstanding needs the age-wise party outstanding report).
      </p>
    ) : null,
  footnote: "Each section is read from the report that owns it: workshop figures from the MIS job aggregation (jobs delivered, all charge types), counter sale from the counter sales summary, stock and profit from the parts reports, transfers from the STN register, purchases from vendor MRNs, outstanding from the age-wise party outstanding as on the end date. A6 (PSF satisfaction) is not recorded yet.",
};

export const MIS_MANAGEMENT_CONFIGS: ReportConfig[] = [managementInformation];

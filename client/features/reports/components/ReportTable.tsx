"use client";

import { Fragment, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatValue, isNumericFormat, plural } from "../lib/report-format";
import type { ReportColumn, ReportConfig, ReportGroup, ReportResponse, ReportRow, RowStyle } from "../types";

/** The columns shown: the report's own, or the data-driven ones once the data is in. */
export function visibleColumns<Row extends ReportRow>(config: ReportConfig<Row>, options: Record<string, string>, data?: ReportResponse<Row>): ReportColumn<Row>[] {
  const columns = data && config.columnsFor ? config.columnsFor(data, options) : config.columns;
  return columns.filter(
    (column) =>
      (!column.whenOption || options[column.whenOption] === "true") &&
      (!column.showWhen || column.showWhen.values.includes(options[column.showWhen.key] ?? "")),
  );
}

export function cellValue<Row extends ReportRow>(column: ReportColumn<Row>, row: Row) {
  return column.value ? column.value(row) : (row[column.key] as string | number | null | undefined);
}

export function cellText<Row extends ReportRow>(column: ReportColumn<Row>, row: Row): string {
  return column.text ? column.text(row) : formatValue(cellValue(column, row), column.format);
}

/** Formatted subtotal/total for a column, or "" when the column has none. */
export function totalText<Row extends ReportRow>(column: ReportColumn<Row>, totals: Record<string, number>): string {
  const key = column.totalKey ?? column.key;
  return key in totals ? formatValue(totals[key], column.totalFormat ?? column.format) : "";
}

function alignOf(column: ReportColumn<ReportRow>) {
  return column.align ?? (isNumericFormat(column.format) ? "right" : "left");
}

/** Screen classes for matrix rows (print and Excel make them bold). */
export const ROW_STYLE: Record<RowStyle, string> = {
  heading: "bg-slate-50/70 font-semibold text-slate-800",
  subtotal: "bg-slate-50 font-semibold text-slate-900",
  total: "bg-muted font-bold text-slate-900",
  memo: "italic text-muted-foreground",
  note: "italic text-muted-foreground",
};

export const INDENT = ["", "pl-7", "pl-12"] as const;

const TONE: Record<string, string> = {
  red: "bg-red-50/60 shadow-[inset_3px_0_0_#ef4444]",
  amber: "bg-amber-50/50 shadow-[inset_3px_0_0_#f59e0b]",
  orange: "bg-orange-50/50 shadow-[inset_3px_0_0_#f97316]",
};

type Sort = { key: string; dir: "asc" | "desc" } | null;

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined || a === "") return 1;
  if (b === null || b === undefined || b === "") return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en", { numeric: true, sensitivity: "base" });
}

interface ReportTableProps<Row extends ReportRow> {
  config: ReportConfig<Row>;
  data: ReportResponse<Row>;
  options: Record<string, string>;
}

export function ReportTable<Row extends ReportRow>({ config, data, options }: ReportTableProps<Row>) {
  const [sort, setSort] = useState<Sort>(null);
  const columns = visibleColumns(config, options, data);
  const mode = options.mode ?? "both";
  const showSubtotals = !config.hideSubtotals && mode !== "detail" && data.groups.length > 0;
  const showRows = mode !== "summary";

  const rowsByGroup = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of data.rows) {
      const key = row.groupKey ?? "";
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    if (sort) {
      const column = columns.find((c) => c.key === sort.key);
      for (const [key, rows] of map) {
        map.set(
          key,
          [...rows].sort((a, b) => {
            const result = compare(column ? cellValue(column, a) : a[sort.key], column ? cellValue(column, b) : b[sort.key]);
            return sort.dir === "asc" ? result : -result;
          }),
        );
      }
    }
    return map;
  }, [data.rows, sort, columns]);

  const groups: ReportGroup[] = data.groups.length ? data.groups : [{ key: "", label: "", count: data.rows.length, totals: data.totals }];
  const grouped = data.groups.length > 0;

  function toggleSort(key: string) {
    setSort((current) => (current?.key !== key ? { key, dir: "asc" } : current.dir === "asc" ? { key, dir: "desc" } : null));
  }

  function totalCells(totals: Record<string, number>, label: string, labelClass: string) {
    // The label spans the leading non-total columns.
    const firstTotal = columns.findIndex((column) => (column.totalKey ?? column.key) in totals);
    const span = firstTotal === -1 ? columns.length : Math.max(firstTotal, 1);
    return (
      <>
        <td colSpan={span} className={cn("px-3 py-2.5", labelClass)}>{label}</td>
        {columns.slice(span).map((column) => {
          const key = column.totalKey ?? column.key;
          return (
            <td key={column.key} className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
              {column.renderTotal && key in totals ? column.renderTotal(totals[key]) : totalText(column, totals)}
            </td>
          );
        })}
      </>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" style={{ minWidth: Math.max(columns.length * 110, 720) }}>
        <thead className="sticky top-0 z-10 bg-muted">
          <tr className="border-b border-border">
            {columns.map((column) => {
              const active = sort?.key === column.key;
              const align = alignOf(column as ReportColumn<ReportRow>);
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
                  className={cn("whitespace-nowrap px-3 py-2.5 font-semibold text-slate-500", align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left")}
                >
                  {showRows ? (
                    <button type="button" onClick={() => toggleSort(column.key)} className={cn("inline-flex items-center gap-1 hover:text-foreground", align === "right" && "flex-row-reverse")}>
                      {column.label}
                      {active ? sort!.dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" /> : <ChevronsUpDown className="size-3.5 opacity-40" />}
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const rows = rowsByGroup.get(group.key) ?? [];
            return (
              <Fragment key={group.key || "all"}>
                {grouped && showRows && (
                  <tr className="border-b border-border bg-slate-50">
                    <th colSpan={columns.length} scope="colgroup" className="px-3 py-2 text-left font-semibold text-slate-800">
                      {group.label} <span className="font-normal text-muted-foreground">({group.count})</span>
                    </th>
                  </tr>
                )}
                {showRows && grouped && rows.length === 0 && (
                  <tr className="border-b border-border">
                    <td colSpan={columns.length} className="px-3 py-2.5 text-sm text-muted-foreground">No {config.noun[1]} in this group.</td>
                  </tr>
                )}
                {showRows &&
                  rows.map((row, index) => {
                    const tone = config.rowTone?.(row);
                    const style = config.rowStyle?.(row);
                    const indent = INDENT[Math.min(config.rowIndent?.(row) ?? 0, 2)];
                    const detail = config.rowDetail?.(row, options);
                    return (
                      // Several rows can share a job (one per labour line or technician), so the index is part of the key.
                      <Fragment key={`${group.key}-${String(row.id ?? row.lineId ?? row.jobId ?? "")}-${index}`}>
                        <tr className={cn("border-b border-border hover:bg-muted/30", tone && TONE[tone], style && ROW_STYLE[style])}>
                          {columns.map((column, columnIndex) => {
                            const align = alignOf(column as ReportColumn<ReportRow>);
                            return (
                              <td
                                key={column.key}
                                className={cn(
                                  "px-3 py-2.5 align-top",
                                  align === "right" && "whitespace-nowrap text-right tabular-nums",
                                  align === "center" && "text-center",
                                  columnIndex === 0 && indent,
                                  column.className,
                                )}
                              >
                                {column.render ? column.render(row) : cellText(column, row) || <span className="text-slate-300">—</span>}
                              </td>
                            );
                          })}
                        </tr>
                        {detail && (
                          <tr className="border-b border-border bg-slate-50/60">
                            <td colSpan={columns.length} className="px-3 py-2 pl-8">{detail}</td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                {showSubtotals && grouped && (
                  <tr className="border-b border-border bg-muted font-semibold text-slate-800">
                    {totalCells(group.totals, config.subtotalLabel?.(group) ?? `Subtotal — ${group.label} · ${plural(group.count, config.noun)}`, "")}
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
        {!config.hideGrandTotal && (
          <tfoot>
            <tr className="bg-primary font-semibold text-primary-foreground">
              {totalCells(data.totals, config.totalLabel?.(data) ?? `Grand total · ${plural(data.totals.count ?? data.meta.rowCount, config.noun)}`, "")}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

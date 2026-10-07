"use client";

import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDateTime, formatValue, isNumericFormat, plural } from "../lib/report-format";
import type { ReportBranch, ReportConfig, ReportGroup, ReportResponse, ReportRow } from "../types";
import { cellText, visibleColumns } from "./ReportTable";

export const COMPANY_NAME = "DANA MOTORS LTD.";

function cssString(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function branchAddress(branch: ReportBranch | "ALL"): string {
  if (branch === "ALL") return "All branches";
  return [branch.address, branch.city, branch.state].filter(Boolean).join(", ") || branch.name;
}

export function periodText(config: Pick<ReportConfig, "period">, data: Pick<ReportResponse, "filters">): string {
  const query = data.filters.query as Record<string, string>;
  if (config.period.kind === "date") return `${config.period.dateLabel ?? config.period.label} ${fmtDate(`${query.date}T12:00:00Z`)}`;
  return `${config.period.label} ${fmtDate(`${query.from}T12:00:00Z`)} to ${fmtDate(`${query.to}T12:00:00Z`)}`;
}

export function appliedText(data: Pick<ReportResponse, "filters">): string {
  return data.filters.applied.map((filter) => `${filter.label}: ${filter.values.length ? filter.values.join(", ") : "All"}`).join(" · ");
}

interface ReportPrintLayoutProps<Row extends ReportRow> {
  config: ReportConfig<Row>;
  data: ReportResponse<Row>;
  options: Record<string, string>;
  printedBy: string;
}

/**
 * Print-only rendering: 80-column reports on A4 portrait, 132-column on A4 landscape, with the
 * company and branch header, filters applied, page numbers and totals.
 */
export function ReportPrintLayout<Row extends ReportRow>({ config, data, options, printedBy }: ReportPrintLayoutProps<Row>) {
  const columns = visibleColumns(config, options).filter((column) => !column.printHidden);
  const mode = options.mode ?? "both";
  const showRows = mode !== "summary";
  const showSubtotals = mode !== "detail" && data.groups.length > 0;
  const groups: ReportGroup[] = data.groups.length ? data.groups : [{ key: "", label: "", count: data.rows.length, totals: data.totals }];
  const printed = `Printed ${fmtDateTime(new Date())} by ${printedBy}`;
  const landscape = config.width === 132;
  const branch = data.meta.branch;

  const pageCss = `@page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 12mm 10mm 14mm;
    @bottom-left { content: ${cssString(printed)}; font: 8pt sans-serif; color: #475569; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt sans-serif; color: #475569; } }`;

  function totalRow(totals: Record<string, number>, label: string, className: string) {
    const firstTotal = columns.findIndex((column) => (column.totalKey ?? column.key) in totals);
    const span = firstTotal === -1 ? columns.length : Math.max(firstTotal, 1);
    return (
      <tr className={className}>
        <td colSpan={span} className="px-1 py-1 font-bold uppercase">{label}</td>
        {columns.slice(span).map((column) => {
          const key = column.totalKey ?? column.key;
          return <td key={column.key} className="whitespace-nowrap px-1 py-1 text-right font-bold">{key in totals ? formatValue(totals[key], column.format) : ""}</td>;
        })}
      </tr>
    );
  }

  return (
    <div className="hidden text-black print:block">
      <style>{pageCss}</style>
      <header className="flex items-start justify-between gap-6 border-b-2 border-[#05141F] pb-2">
        <div className="min-w-0">
          <p className="text-lg font-bold tracking-tight">{COMPANY_NAME}</p>
          <p className="text-[9pt]">{branchAddress(branch)}</p>
          {branch !== "ALL" && branch.phoneNumber && <p className="text-[9pt]">Phone: {branch.phoneNumber}</p>}
        </div>
        <div className="text-center">
          <p className="text-base font-bold uppercase">{config.title}</p>
          <p className="text-[9pt] font-semibold">{periodText(config, data)}</p>
          {branch !== "ALL" && <p className="text-[9pt]">{branch.name}</p>}
        </div>
        <div className="w-24" aria-hidden />
      </header>
      <p className="mb-2 mt-1.5 text-[8.5pt] text-slate-600">{appliedText(data) || "No filters"}</p>

      <table className={cn("w-full border-collapse", landscape ? "text-[7.5pt]" : "text-[8.5pt]")}>
        <thead className="[display:table-header-group]">
          <tr className="border-y border-black">
            {columns.map((column) => (
              <th key={column.key} className={cn("px-1 py-1 align-bottom font-bold", isNumericFormat(column.format) ? "text-right" : "text-left")}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const rows = data.rows.filter((row) => (row.groupKey ?? "") === group.key);
            return (
              <Fragment key={group.key || "all"}>
                {group.label && showRows && (
                  <tr className="break-after-avoid">
                    <td colSpan={columns.length} className="px-1 pb-0.5 pt-2 font-bold uppercase">{group.label}</td>
                  </tr>
                )}
                {showRows &&
                  rows.map((row, index) => (
                    <tr key={index} className="break-inside-avoid border-b border-slate-300">
                      {columns.map((column) => (
                        <td key={column.key} className={cn("px-1 py-0.5 align-top", isNumericFormat(column.format) && "whitespace-nowrap text-right")}>
                          {cellText(column, row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                {showSubtotals && group.label && totalRow(group.totals, config.subtotalLabel?.(group) ?? `Total ${group.label} · ${plural(group.count, config.noun)}`, "border-t border-black")}
              </Fragment>
            );
          })}
          {totalRow(data.totals, config.totalLabel?.(data) ?? `Grand total · ${plural(data.totals.count ?? data.meta.rowCount, config.noun)}`, "border-y-[3px] border-double border-black")}
        </tbody>
      </table>
      {config.footnote && <p className="mt-2 text-[8pt] text-slate-600">{config.footnote}</p>}
    </div>
  );
}

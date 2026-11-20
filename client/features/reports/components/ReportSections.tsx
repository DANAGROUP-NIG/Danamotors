"use client";

import { cn } from "@/lib/utils";
import { formatValue, isNumericFormat } from "../lib/report-format";
import type { ReportSection } from "../types";

type SectionColumn = ReportSection["columns"][number];

/** Formatted cell of a section row (blank for missing values). */
export function sectionCell(column: SectionColumn, row: Record<string, unknown>): string {
  return formatValue(row[column.key], column.format ?? "text");
}

function PercentCell({ value, text }: { value: unknown; text: string }) {
  const pct = typeof value === "number" ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <span className="flex items-center justify-end gap-2">
      <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 sm:block" aria-hidden>
        <span className="block h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
      </span>
      <span className="w-14 text-right">{text}</span>
    </span>
  );
}

/** Summary tables after the detail on screen (cards with compact tables and % bars). */
export function ReportSections({ sections }: { sections: ReportSection[] }) {
  if (!sections.length) return null;
  return (
    <section aria-label="Summary tables" className="grid gap-4 xl:grid-cols-2 print:hidden">
      {sections.map((section) => (
        <div key={section.key} className={cn("overflow-hidden rounded-xl border border-border bg-white shadow-sm", section.rows.length > 8 && "xl:col-span-2")}>
          <h3 className="border-b border-border bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800">{section.title}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  {section.columns.map((column) => (
                    <th key={column.key} scope="col" className={cn("whitespace-nowrap px-4 py-2 font-medium", isNumericFormat(column.format) ? "text-right" : "text-left")}>
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.rows.length === 0 && (
                  <tr>
                    <td colSpan={section.columns.length} className="px-4 py-6 text-center text-muted-foreground">Nothing to summarise</td>
                  </tr>
                )}
                {section.rows.map((row, index) => (
                  <tr key={String(row.key ?? row.id ?? index)} className="border-b border-border last:border-0 hover:bg-slate-50/70">
                    {section.columns.map((column) => {
                      const text = sectionCell(column, row);
                      return (
                        <td key={column.key} className={cn("px-4 py-2 tabular-nums", isNumericFormat(column.format) ? "text-right" : "text-left text-slate-800")}>
                          {column.format === "percent" ? <PercentCell value={row[column.key]} text={text} /> : text}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              {section.total && (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                    {section.columns.map((column) => (
                      <td key={column.key} className={cn("px-4 py-2 tabular-nums", isNumericFormat(column.format) ? "text-right" : "text-left")}>
                        {sectionCell(column, section.total!)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}

/** The same tables for the paper printout, after the detail. */
export function PrintSections({ sections, landscape }: { sections: ReportSection[]; landscape: boolean }) {
  if (!sections.length) return null;
  return (
    <div className="mt-4 space-y-3">
      <p className="text-[9pt] font-bold uppercase">Summary</p>
      {sections.map((section) => (
        <table key={section.key} className={cn("w-full break-inside-avoid border-collapse", landscape ? "text-[7.5pt]" : "text-[8.5pt]")}>
          <caption className="pb-0.5 text-left font-bold">{section.title}</caption>
          <thead>
            <tr className="border-y border-black">
              {section.columns.map((column) => (
                <th key={column.key} className={cn("px-1 py-0.5 font-bold", isNumericFormat(column.format) ? "text-right" : "text-left")}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row, index) => (
              <tr key={index} className="border-b border-slate-300">
                {section.columns.map((column) => (
                  <td key={column.key} className={cn("px-1 py-0.5", isNumericFormat(column.format) && "whitespace-nowrap text-right")}>{sectionCell(column, row)}</td>
                ))}
              </tr>
            ))}
            {section.total && (
              <tr className="border-y border-black font-bold">
                {section.columns.map((column) => (
                  <td key={column.key} className={cn("px-1 py-0.5", isNumericFormat(column.format) && "whitespace-nowrap text-right")}>{sectionCell(column, section.total!)}</td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      ))}
    </div>
  );
}

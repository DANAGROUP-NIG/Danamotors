"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Printer, ArrowUpDown } from "lucide-react";
import { useBranchStore } from "@/store/branch.store";
export type ReportRow = Record<string, string | number | null>;
export type ReportSection = {
  title: string;
  rows: ReportRow[];
  totals?: ReportRow;
  pageBreak?: boolean;
  columns?: string[];
  columnGroups?: { title: string; columns: string[] }[];
  columnLabels?: Record<string, string>;
};
export type ReportResult = {
  exportSummary?: boolean;
  summaryKeys?: string[];
  rows: ReportRow[];
  groups: ReportSection[];
  totals: ReportRow;
  filters: Record<string, unknown>;
  columns?: string[];
  columnLabels?: Record<string, string>;
  columnGroups?: { title: string; columns: string[] }[];
  warnings?: string[];
};
const label = (key: string) =>
  key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
const formatted = (v: string | number | null, key = "") =>
  typeof v === "number"
    ? new Intl.NumberFormat("en-NG", {
        minimumFractionDigits:
          /amount|vat|discount|taxable|labour|parts|spares|oil|accessories|charge|roundOff|rate|outstanding|cost|expense|total|upst|wct/i.test(
            key,
          )
            ? 2
            : 0,
        maximumFractionDigits: 2,
      }).format(v)
    : v && /^\d{4}-\d{2}-\d{2}$/.test(v)
      ? v.split("-").reverse().join("/")
      : (v ?? "-");
export function ReportTable({
  rows,
  totals,
  columns,
  onPick,
  columnGroups,
  columnLabels,
}: {
  rows: ReportRow[];
  totals?: ReportRow;
  columns?: string[];
  onPick?: (row: ReportRow) => void;
  columnGroups?: { title: string; columns: string[] }[];
  columnLabels?: Record<string, string>;
}) {
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);
  const keys =
    columns ??
    [...new Set(rows.flatMap((r) => Object.keys(r)))].filter(
      (k) => k !== "vehicleId",
    );

  const numericColumns = new Set(
    keys.filter(
      (k) =>
        rows.some((r) => typeof r[k] === "number") ||
        (totals != null && typeof totals[k] === "number"),
    ),
  );
  const isNumericColumn = (key: string) => numericColumns.has(key);
  const ordered = sort
    ? [...rows].sort(
        (a, b) =>
          (typeof a[sort.key] === "number" && typeof b[sort.key] === "number"
            ? (a[sort.key] as number) - (b[sort.key] as number)
            : String(a[sort.key] ?? "").localeCompare(
                String(b[sort.key] ?? ""),
              )) * (sort.desc ? -1 : 1),
      )
    : rows;
  return (
    <div className="min-w-0 max-w-full overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <colgroup>{keys.map(k => <col key={k} style={{ width: `${100 / (keys.length + (onPick ? 1 : 0))}%` }} />)}{onPick && <col />}</colgroup>
        <thead className="bg-muted/40 text-left">
          {columnGroups && <tr>{columnGroups.map(g => <th key={g.title} colSpan={g.columns.filter(k => keys.includes(k)).length} scope="colgroup" className="border-b border-r bg-muted/60 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">{g.title}</th>)}</tr>}
          <tr>
            {keys.map((k) => (
              <th
                key={k}
                scope="col"
                className={
                  "whitespace-nowrap px-4 py-3 font-medium " +
                  (isNumericColumn(k) ? "text-right" : "")
                }
              >
                <button
                  onClick={() =>
                    setSort({ key: k, desc: sort?.key === k && !sort.desc })
                  }
                  className={
                    "flex w-full items-center gap-2 " +
                    (isNumericColumn(k) ? "justify-center" : "justify-start")
                  }
                >
                  {columnLabels?.[k] ?? label(k)}
                  <ArrowUpDown className="size-3 print:hidden" />
                </button>
              </th>
            ))}
            {onPick && (
              <th className="whitespace-nowrap px-4 py-3 font-medium">Card</th>
            )}
          </tr>
        </thead>
        <tbody>
          {ordered.map((row, i) => (
            <tr key={i} className="border-t hover:bg-muted/20">
              {keys.map((k) => (
                <td
                  key={k}
                  className={
                    "px-4 py-3 " +
                    (typeof row[k] === "number"
                      ? "text-right tabular-nums"
                      : ""
                    )
                  }
                >
                  {formatted(row[k], k)}
                </td>
              ))}
              {onPick && (
                <td className="whitespace-nowrap px-4 py-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPick(row)}
                  >
                    Open history
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {totals && Object.keys(totals).length > 0 && (
          <tfoot className="border-t bg-muted/40 font-semibold">
            <tr>
              {keys.map((k, i) => (
                <td
                  key={k}
                  className={
                    "px-4 py-3 " +
                    (totals[k] == null && i === 0
                      ? "text-left"
                      : isNumericColumn(k)
                        ? "text-right tabular-nums"
                        : "text-left")
                  }
                >
                  {totals[k] != null
                    ? formatted(totals[k], k)
                    : i === 0
                      ? "Total"
                      : ""}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
export function ReportOutput({
  result,
  title,
  wide,
  branch,
  onPick,
}: {
  result: ReportResult;
  title: string;
  wide: boolean;
  branch: string;
  onPick?: (row: ReportRow) => void;
}) {
  const activeBranch = useBranchStore(s => s.activeBranch);
  const branchDetails = activeBranch?.name === branch ? activeBranch : null;
  const details = result.groups.find(g => g.columnGroups);
  const totalColumns = details?.columns?.filter(k => result.totals[k] !== undefined);
  const totalColumnGroups = details?.columnGroups?.map(g => ({ ...g, columns: g.columns.filter(k => totalColumns?.includes(k)) })).filter(g => g.columns.length);
  async function excel() {
    const XLSX = await import("xlsx");
    const book = XLSX.utils.book_new();
    const sections = [
      ...(result.rows.length
        ? [{ title: "Report", rows: result.rows, totals: result.totals, columns: result.columns, columnLabels: result.columnLabels, columnGroups: result.columnGroups }]
        : []),
      ...result.groups,
      ...(result.exportSummary !== false && !result.rows.length && result.groups.length
        ? [{ title: "Grand totals", rows: [result.totals], columns: totalColumns ?? result.summaryKeys, columnGroups: totalColumnGroups, columnLabels: details?.columnLabels }]
        : []),
    ];
    sections.forEach((g, i) => {
      const keys = ('columns' in g && g.columns) || [
        ...new Set([
          ...g.rows.flatMap((r) => Object.keys(r)),
          ...Object.keys(g.totals ?? {}),
        ]),
      ].filter((k) => k !== "vehicleId");
      const metadata = [
        ["Dana Motors", branch],
        [title, g.title],
        ["Report period", `${result.filters.from ?? ''} to ${result.filters.to ?? ''}`],
        ...[branchDetails?.address, branchDetails?.phoneNumber].filter(Boolean).map(v => [v]),
        ...(result.warnings ?? []).map(w => ["Note", w]),
        [],
      ];
      const values = [
        ...metadata,
        ...('columnGroups' in g && g.columnGroups ? [keys.map(k => g.columnGroups?.find(group => group.columns.includes(k))?.title ?? '')] : []),
        keys.map(k => ('columnLabels' in g && g.columnLabels?.[k]) || label(k)),
        ...(!g.rows.length && !g.totals ? [["No records in this section."]] : []),
        ...g.rows.map((r) =>
          keys.map((k) =>
            typeof r[k] === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(r[k] as string)
              ? formatted(r[k], k)
              : (r[k] ?? ""),
          ),
        ),
        ...(g.totals
          ? [keys.map((k, i) => g.totals?.[k] ?? (i === 0 ? "Total" : ""))]
          : []),
      ];
      const sheet = XLSX.utils.aoa_to_sheet(values);
      if ('columnGroups' in g && g.columnGroups) {
        sheet['!merges'] = g.columnGroups.flatMap(group => {
          const positions = group.columns.map(k => keys.indexOf(k)).filter(i => i >= 0);
          return positions.length > 1 ? [{ s: { r: metadata.length, c: positions[0] }, e: { r: metadata.length, c: positions[positions.length - 1] } }] : [];
        });
        sheet['!cols'] = keys.map(k => ({ wch: k === 'customer' ? 30 : 18 }));
      }
      XLSX.utils.book_append_sheet(
        book,
        sheet,
        `${i + 1} ${g.title}`.slice(0, 31).replace(/[\[\]*?/\\:]/g, " "),
      );
    });
    if (!sections.length)
      XLSX.utils.book_append_sheet(
        book,
        XLSX.utils.json_to_sheet([result.totals]),
        "Totals",
      );
    XLSX.writeFile(book, title.replaceAll(" ", "-") + ".xlsx");
  }
  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap gap-4">
          {Object.entries(result.totals).filter(([k]) => !result.summaryKeys || result.summaryKeys.includes(k)).sort(([a], [b]) => result.summaryKeys ? result.summaryKeys.indexOf(a) - result.summaryKeys.indexOf(b) : 0).map(([k, v]) => (
            <div key={k}>
              <span className="block text-xs text-muted-foreground">
                {result.columnGroups ? label(k) : result.columnLabels?.[k] ?? label(k)}
              </span>
              <strong className="text-lg tabular-nums">
                {formatted(v, k)}
              </strong>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" />
            Print
          </Button>
          <Button variant="outline" onClick={excel}>
            <Download className="size-4" />
            Excel
          </Button>
        </div>
      </div>
      <style>{`@media print { body * { visibility:hidden } body *:has(#workshop-report) { display:block!important; height:auto!important; max-height:none!important; overflow:visible!important } body *:has(#workshop-report)>*:not(:has(#workshop-report)):not(#workshop-report) { display:none!important } #workshop-report, #workshop-report * { visibility:visible } #workshop-report { position:static;width:100%;background:white;color:black } #workshop-report .print\\:hidden { display:none!important } #workshop-report .overflow-x-auto { overflow:visible!important } table { table-layout:fixed;width:100%;font-size:${wide ? "8" : "10"}px } th,td { white-space:normal!important;overflow-wrap:anywhere } th,td { padding:5px!important } thead { display:table-header-group } tr { break-inside:avoid } .section-break { break-before:page } .report-page-footer { position:fixed;bottom:0 } } @page { size:A4 ${wide ? "landscape" : "portrait"}; margin:12mm; @bottom-right { content: "Page " counter(page) " of " counter(pages); } }`}</style>
      <article id="workshop-report" className="space-y-6">
        <style>{`@media print { #workshop-report .tax-register-section table { table-layout:fixed; width:100% } #workshop-report .tax-register-section th, #workshop-report .tax-register-section td { white-space:normal!important; overflow-wrap:anywhere; font-size:7px; padding:3px!important } #workshop-report .tax-register-section button { gap:0 } }`}</style>
        <header className="rounded-xl border bg-card p-5 print:rounded-none print:border-0 print:p-0">
          {branchDetails?.address && <p className="text-xs text-muted-foreground">{branchDetails.address}</p>}
          {branchDetails?.phoneNumber && <p className="text-xs text-muted-foreground">{branchDetails.phoneNumber}</p>}
          <p>Dana Motors | {branch}</p>
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-xs">
            {Object.entries(result.filters)
              .filter(([k, v]) => k !== "branchId" && !k.endsWith("Id") && v != null && v !== "")
              .map(
                ([k, v]) =>
                  label(k) +
                  ": " +
                  (k.endsWith("Ids") ? String(v).split(",").length + " selected" : v === "true" || v === true ? "Yes" : v === "false" || v === false ? "No" : typeof v === "string" && /^[A-Z_]+$/.test(v) ? v.toLowerCase().replaceAll("_", " ") : typeof v === "string" ? formatted(v, k) : String(v)),
              )
              .join(" | ")}
          </p>
        </header>
        {result.warnings?.map((w) => (
          <p
            key={w}
            className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
          >
            {w}
          </p>
        ))}
        {result.rows.length > 0 && (
          <ReportTable
            rows={result.rows}
            totals={result.totals}
            columns={result.columns}
            columnLabels={result.columnLabels}
            columnGroups={result.columnGroups}
            onPick={onPick}
          />
        )}
        {result.groups.map((g, i) => (
          <section
            key={i}
            className={"space-y-3 " + (g.columnGroups ? "tax-register-section " : "") + (g.pageBreak ? "section-break" : "")}
          >
            <h2 className="font-semibold">{g.title}</h2>
            {g.columnGroups && <p className="text-xs text-muted-foreground print:hidden">Scroll horizontally to view all tax columns.</p>}
            {g.rows.length ? (
              <ReportTable rows={g.rows} totals={g.totals} columns={g.columns} columnGroups={g.columnGroups} columnLabels={g.columnLabels} />
            ) : g.totals ? (
              <ReportTable rows={[g.totals]} columns={g.columns} columnGroups={g.columnGroups} columnLabels={g.columnLabels} />
            ) : (
              <p className="text-sm text-muted-foreground">
                No records in this section.
              </p>
            )}
          </section>
        ))}
        {!result.rows.length && !result.groups.length && (
          <div className="rounded-xl border bg-card py-16 text-center">
            <p className="font-medium">No records match these filters</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different date range or clear a filter.
            </p>
          </div>
        )}
        {result.groups.length > 0 && !result.rows.length && (
          <section className="space-y-3 border-t pt-4">
            <h2 className="font-semibold">Grand totals</h2>
            {details ? <div className="tax-register-section"><ReportTable rows={[]} totals={result.totals} columns={totalColumns} columnGroups={totalColumnGroups} columnLabels={details.columnLabels} /></div> : <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Object.entries(result.totals).filter(([k]) => !result.summaryKeys || result.summaryKeys.includes(k)).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{result.columnGroups ? label(k) : result.columnLabels?.[k] ?? label(k)}</dt>
                  <dd className="font-semibold tabular-nums">
                    {formatted(v, k)}
                  </dd>
                </div>
              ))}
            </dl>}
          </section>
        )}
      </article>
    </div>
  );
}

import { toast } from "sonner";
import type { ReportColumn, ReportResult, ReportRow } from "../api/parts-reports.api";

type Cell = string | number | Date | null;

const numeric = (c: ReportColumn) => c.type === "money" || c.type === "qty" || c.type === "percent";
const NUMBER_FORMAT: Partial<Record<ReportColumn["type"], string>> = { money: "#,##0.00", qty: "#,##0.##", percent: "0.00\"%\"" };

function cellValue(column: ReportColumn, value: ReportRow[string] | undefined): Cell {
  if (value === null || value === undefined || value === "") return null;
  if (column.type === "date") return new Date(String(value));
  if (numeric(column)) return Number(value);
  return String(value);
}

function sum(rows: ReportRow[], column: ReportColumn) {
  return rows.reduce((s, r) => s + (r.status === "Cancelled" ? 0 : Number(r[column.key] ?? 0)), 0);
}

/**
 * Writes the report as a real .xlsx, laid out like the legacy registers: company and report
 * heading, period and branch, S.No. column, group headings with subtotals, and a total line.
 */
export async function exportReportXlsx(
  result: ReportResult,
  meta: { subtitle?: string; scope: string; period: string; filename: string },
) {
  const XLSX = await import("xlsx");
  const columns = result.columns;
  const width = columns.length + 1;
  const aoa: Cell[][] = [
    ["DANA MOTORS LTD."],
    [result.title.toUpperCase() + (meta.subtitle ? ` (${meta.subtitle})` : "")],
    [`${meta.scope} · ${meta.period}`],
    [],
    ["S.No.", ...columns.map((c) => c.label)],
  ];
  const headerRow = aoa.length - 1;

  let serial = 0;
  let current: string | null | undefined;
  let groupRows: ReportRow[] = [];
  const closeGroup = () => {
    if (current == null) return;
    aoa.push(["", ...columns.map((c, i) => (i === 0 ? "Subtotal" : c.total ? sum(groupRows, c) : null))]);
  };
  for (const row of result.rows) {
    const group = result.grouped && row.group != null ? String(row.group) : null;
    if (result.grouped && group !== current) {
      closeGroup();
      current = group;
      groupRows = [];
      if (group !== null) aoa.push([group]);
    }
    groupRows.push(row);
    aoa.push([++serial, ...columns.map((c) => cellValue(c, row[c.key]))]);
  }
  if (result.grouped) closeGroup();
  aoa.push(["", ...columns.map((c, i) => (i === 0 ? "TOTAL" : c.key in result.totals ? result.totals[c.key] : null))]);
  if (result.truncated) aoa.push([], ["Only the first 5,000 lines are listed; the total covers every line."]);

  const sheet = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true, dateNF: "dd/mm/yyyy" });
  // Number formats per column, below the column header.
  columns.forEach((c, i) => {
    const format = NUMBER_FORMAT[c.type] ?? (c.type === "date" ? "dd/mm/yyyy" : undefined);
    if (!format) return;
    for (let r = headerRow + 1; r < aoa.length; r++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c: i + 1 })];
      if (cell && (cell.t === "n" || cell.t === "d")) cell.z = format;
    }
  });
  sheet["!cols"] = [{ wch: 6 }, ...columns.map((c) => ({ wch: c.type === "text" ? (c.key === "description" || c.key === "address" ? 36 : 18) : 14 }))];
  sheet["!merges"] = [0, 1, 2].map((r) => ({ s: { r, c: 0 }, e: { r, c: width - 1 } }));

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, result.title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
  XLSX.writeFile(book, `${meta.filename}.xlsx`, { compression: true });
  toast.success(`Downloaded ${meta.filename}.xlsx`);
}

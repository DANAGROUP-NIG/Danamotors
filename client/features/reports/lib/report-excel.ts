import { toast } from "sonner";
import type { ReportConfig, ReportGroup, ReportResponse, ReportRow } from "../types";
import { cellValue, visibleColumns } from "../components/ReportTable";
import { COMPANY_NAME, appliedText, branchAddress, periodText } from "../components/ReportPrintLayout";
import { fmtDate, fmtDateTime, fmtTime, isNumericFormat, plural } from "./report-format";

type Cell = string | number | null;

/**
 * Exports exactly what is on screen (every row, groups, subtotals and the grand total) as a
 * real .xlsx workbook. SheetJS is loaded only when a user exports.
 */
export async function exportReportExcel<Row extends ReportRow>(config: ReportConfig<Row>, data: ReportResponse<Row>, options: Record<string, string>) {
  const XLSX = await import("xlsx");
  const columns = visibleColumns(config, options);
  const mode = options.mode ?? "both";
  const showRows = mode !== "summary";
  const showSubtotals = mode !== "detail" && data.groups.length > 0;
  const groups: ReportGroup[] = data.groups.length ? data.groups : [{ key: "", label: "", count: data.rows.length, totals: data.totals }];

  const value = (column: (typeof columns)[number], row: Row): Cell => {
    const raw = cellValue(column, row);
    if (column.text && !isNumericFormat(column.format)) return column.text(row) || null;
    if (raw === null || raw === undefined || raw === "") return null;
    if (isNumericFormat(column.format)) return typeof raw === "number" ? raw : Number(raw);
    if (column.format === "date") return fmtDate(raw);
    if (column.format === "datetime") return fmtDateTime(raw);
    if (column.format === "time") return fmtTime(raw);
    return column.text ? column.text(row) : String(raw);
  };
  const totalsRow = (totals: Record<string, number>, label: string): Cell[] => {
    const firstTotal = columns.findIndex((column) => (column.totalKey ?? column.key) in totals);
    const span = firstTotal === -1 ? columns.length : Math.max(firstTotal, 1);
    return columns.map((column, index) => {
      if (index === 0) return label;
      if (index < span) return null;
      const key = column.totalKey ?? column.key;
      return key in totals ? totals[key] : null;
    });
  };

  const sheet: Cell[][] = [
    [COMPANY_NAME],
    [branchAddress(data.meta.branch)],
    [config.title.toUpperCase()],
    [periodText(config, data)],
    [appliedText(data)],
    [],
    columns.map((column) => column.label),
  ];
  const headerRow = sheet.length - 1;
  const numericRows: number[] = [];

  for (const group of groups) {
    const rows = data.rows.filter((row) => (row.groupKey ?? "") === group.key);
    if (group.label && showRows) sheet.push([group.label]);
    if (showRows)
      for (const row of rows) {
        numericRows.push(sheet.length);
        sheet.push(columns.map((column) => value(column, row)));
      }
    if (showSubtotals && group.label) {
      numericRows.push(sheet.length);
      sheet.push(totalsRow(group.totals, config.subtotalLabel?.(group) ?? `Total ${group.label} · ${plural(group.count, config.noun)}`));
    }
  }
  numericRows.push(sheet.length);
  sheet.push(totalsRow(data.totals, config.totalLabel?.(data) ?? `Grand total · ${plural(data.totals.count ?? data.meta.rowCount, config.noun)}`));

  const worksheet = XLSX.utils.aoa_to_sheet(sheet);
  // Number formats so amounts stay numeric (sum/filter in Excel) but read like the screen.
  columns.forEach((column, columnIndex) => {
    const totalFormat = column.totalFormat ?? column.format;
    if (!isNumericFormat(column.format) && !isNumericFormat(totalFormat)) return;
    const format = (column.format === "money" || totalFormat === "money") ? "#,##0.00" : totalFormat === "integer" || column.format === "integer" ? "#,##0" : "#,##0.00";
    for (const rowIndex of numericRows) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
      if (cell && typeof cell.v === "number") cell.z = format;
    }
  });
  worksheet["!cols"] = columns.map((column) => {
    const widest = Math.max(column.label.length, ...data.rows.slice(0, 500).map((row) => String(value(column, row) ?? "").length));
    return { wch: Math.min(Math.max(widest + 2, 8), 40) };
  });
  worksheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: headerRow, c: Math.max(columns.length - 1, 0) } }) };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, config.title.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
  const query = data.filters.query as Record<string, string>;
  const stamp = config.period.kind === "date" ? query.date : `${query.from}_to_${query.to}`;
  const filename = `${config.slug}-${stamp}.xlsx`;
  XLSX.writeFile(workbook, filename);
  toast.success(`Downloaded ${filename}`);
}

/**
 * Reads a Mobis price bulletin as Mobis sends it ("KIA - Irregular Price Adjustment dd-mm-yyyy - Others.xlsx"):
 *
 *   KIA Irregular Price Adjustment Bulletin - MPME MPA 06112026
 *   Brand | Part No. | Part Name | Product Type | List Price ($) [Others] |      | Go Live [New List Price]
 *         |          |           |              | Old                     | New  |
 *   K     | 223112X200 | GASKET-CYLINDER HEAD | PT | 29.33               | 32.26 | 06-Nov-2026
 *
 * Every sheet with that header is read (MAIN and NO SALES). Only the part number and the new USD list
 * price are used; the server turns the price into naira at Finance's rate. Columns are found by their
 * headers, so extra or reordered columns do not matter.
 */
import * as XLSX from "xlsx";

export type BulletinLine = { partNumber: string; listPrice: number };

export type ParsedBulletin = {
  /** First title cell, e.g. "KIA Irregular Price Adjustment Bulletin - MPME MPA 06112026". */
  title: string;
  /** Go Live date as yyyy-mm-dd, when the file gives one. */
  effectiveDate?: string;
  sheets: { name: string; lines: number }[];
  /** One line per part; a part listed twice keeps its higher price. */
  lines: BulletinLine[];
  /** Rows left out, and parts listed twice at different prices. */
  problems: string[];
};

const text = (v: unknown) => String(v ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "06-Nov-2026", a JS Date or an Excel serial → yyyy-mm-dd. */
function toIsoDate(v: unknown): string | undefined {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : undefined;
  }
  const m = text(v).match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/ ](\d{4})$/);
  if (!m) return undefined;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  return month < 0 ? undefined : `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

const price = (v: unknown) => {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN;
  const s = text(v).replace(/[$,]/g, "");
  const n = Number(s);
  return s !== "" && Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};

type SheetResult = { title: string; effectiveDate?: string; lines: BulletinLine[]; problems: string[] } | null;

/** One sheet's rows (as sheet_to_json header:1 gives them). Null when the sheet is not a bulletin. */
export function parseBulletinSheet(rows: unknown[][], sheetName = "Sheet"): SheetResult {
  const headerIndex = rows.findIndex((r) => (r ?? []).some((c) => /^part\s*no\.?$/i.test(text(c))));
  if (headerIndex < 0) return null;
  const header = rows[headerIndex].map(text);
  const sub = (rows[headerIndex + 1] ?? []).map(text);
  const partCol = header.findIndex((c) => /^part\s*no\.?$/i.test(c));
  // The new price sits under "List Price ($)" in the "New" sub-column; older layouts may name it in the header.
  const subNew = sub.findIndex((c) => /^new$/i.test(c));
  const priceCol = subNew >= 0 ? subNew : header.findIndex((c) => /^(new\s*(list\s*)?price|nlp)\b/i.test(c));
  if (priceCol < 0) throw new Error(`${sheetName}: no "New" list price column under "List Price ($)"`);
  const goLiveCol = header.findIndex((c) => /go\s*live/i.test(c));
  const title = text(rows.slice(0, headerIndex).flat().find((c) => text(c)) ?? "");
  // Data starts under the Old/New sub-header row when there is one.
  const firstData = headerIndex + (subNew >= 0 ? 2 : 1);

  const lines: BulletinLine[] = [];
  const problems: string[] = [];
  let effectiveDate: string | undefined;
  rows.slice(firstData).forEach((r, i) => {
    const partNumber = text(r?.[partCol]).replace(/\s+/g, "").toUpperCase();
    if (!partNumber) return;
    const listPrice = price(r?.[priceCol]);
    if (!(listPrice > 0)) {
      problems.push(`${sheetName} row ${firstData + i + 1} (${partNumber}): the new list price could not be read`);
      return;
    }
    effectiveDate ??= goLiveCol >= 0 ? toIsoDate(r?.[goLiveCol]) : undefined;
    lines.push({ partNumber, listPrice });
  });
  return { title, effectiveDate, lines, problems };
}

/** Merges sheets: one line per part, keeping the higher price when a part appears twice at different prices. */
export function mergeBulletinSheets(sheets: { name: string; result: NonNullable<SheetResult> }[]): ParsedBulletin {
  const byNumber = new Map<string, BulletinLine>();
  const problems: string[] = [];
  for (const { result } of sheets) {
    problems.push(...result.problems);
    for (const line of result.lines) {
      const seen = byNumber.get(line.partNumber);
      if (seen && seen.listPrice !== line.listPrice) {
        problems.push(`${line.partNumber} is listed at $${seen.listPrice} and $${line.listPrice}; the higher price is used`);
      }
      if (!seen || line.listPrice > seen.listPrice) byNumber.set(line.partNumber, line);
    }
  }
  if (byNumber.size === 0) throw new Error("The bulletin has a header but no parts with a new list price.");
  return {
    title: sheets.find((s) => s.result.title)?.result.title ?? "",
    effectiveDate: sheets.find((s) => s.result.effectiveDate)?.result.effectiveDate,
    sheets: sheets.map((s) => ({ name: s.name, lines: s.result.lines.length })),
    lines: [...byNumber.values()],
    problems,
  };
}

export async function parseBulletinFile(file: File): Promise<ParsedBulletin> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheets: { name: string; result: NonNullable<SheetResult> }[] = [];
  for (const name of workbook.SheetNames) {
    // raw: prices stay full numbers whatever the cell format; part numbers are read as text below.
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, raw: true, defval: "", blankrows: false });
    const result = parseBulletinSheet(rows, name);
    if (result) sheets.push({ name, result });
  }
  if (!sheets.length) throw new Error('This is not a Mobis price bulletin: no sheet has a "Part No." header.');
  return mergeBulletinSheets(sheets);
}

/**
 * Reads a Mobis price list for the catalogue (legacy FullpartList), e.g.
 *
 *   SL# NO | PARTNO      | PARTNAME     | FLAG | PARTCATEGORY | FINALDR  | NEW MARK-UP | NEW RR (NAIRA)
 *   55314  | K9934914250 | HOSE-SUCTION | O    | C            | 3639.636 | 3.33        | 12119.98788
 *
 * Part number, part name and dealer rate are required; flag, price category and retail rate are
 * optional. Columns are found by their header names, so extra or reordered columns do not matter.
 * Works with .xls, .xlsx, .csv and tab-separated text.
 */
import * as XLSX from "xlsx";
import type { PriceListRow } from "../types/inventory.types";

export type ParsedPriceList = {
  rows: PriceListRow[];
  /** Rows that looked like data but could not be read; they are left out. */
  problems: string[];
};

type Column = "partNumber" | "name" | "partFlag" | "priceCategoryCode" | "dealerRate" | "retailRate";

const HEADERS: { key: Column; match: RegExp }[] = [
  { key: "partNumber", match: /^part\s*(no\.?|number)$/i },
  { key: "name", match: /^(part\s*name|part\s*desc(ription)?|description)$/i },
  { key: "partFlag", match: /^(part\s*)?flag$/i },
  { key: "priceCategoryCode", match: /^(part\s*|price\s*)?category$/i },
  { key: "dealerRate", match: /^(final\s*dr|dr|dealer\s*rate|dlr\s*rate)$/i },
  { key: "retailRate", match: /^((new\s*)?rr(\s*\(naira\))?|retail\s*rate|rtl\s*rate)$/i },
];

const clean = (v: unknown) => String(v ?? "").replace(/ /g, " ").trim();
const num = (v: string) => {
  const n = Number(v.replace(/,/g, ""));
  return v !== "" && Number.isFinite(n) ? n : NaN;
};

export function parsePriceListRows(rawRows: unknown[][]): ParsedPriceList {
  const rows = rawRows.map((r) => (r ?? []).map(clean));
  const isPartNo = (c: string) => HEADERS[0].match.test(c);
  const headerIndex = rows.findIndex((r) => r.some(isPartNo));
  if (headerIndex < 0) {
    throw new Error('This is not a price list: no header row with "Part No" was found.');
  }
  const header = rows[headerIndex];
  const col = new Map<Column, number>();
  for (const { key, match } of HEADERS) {
    const idx = header.findIndex((h) => match.test(h));
    if (idx >= 0) col.set(key, idx);
  }
  if (!col.has("name")) throw new Error('The price list header is missing the "Part Name" column.');
  if (!col.has("dealerRate")) throw new Error('The price list header is missing the dealer rate ("DR" or "Final DR") column.');
  const get = (r: string[], key: Column) => (col.has(key) ? (r[col.get(key)!] ?? "") : "");

  const result: PriceListRow[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  rows.slice(headerIndex + 1).forEach((r, i) => {
    const rowNumber = headerIndex + i + 2; // 1-based spreadsheet row
    const partNumber = get(r, "partNumber").toUpperCase();
    if (!partNumber) return; // blank or trailing rows
    const name = get(r, "name");
    const dealerRate = num(get(r, "dealerRate"));
    const retailText = get(r, "retailRate");
    const retailRate = retailText ? num(retailText) : null;
    if (seen.has(partNumber)) {
      problems.push(`Row ${rowNumber} (${partNumber}): the part is already listed above`);
      return;
    }
    if (!name || !(dealerRate > 0) || (retailRate !== null && Number.isNaN(retailRate))) {
      problems.push(`Row ${rowNumber} (${partNumber}): part name, dealer rate or retail rate could not be read`);
      return;
    }
    seen.add(partNumber);
    result.push({
      partNumber,
      name,
      partFlag: get(r, "partFlag").toUpperCase() || undefined,
      priceCategoryCode: get(r, "priceCategoryCode").toUpperCase() || null,
      dealerRate,
      retailRate,
    });
  });
  if (result.length === 0) throw new Error("The file has a price list header but no parts.");
  return { rows: result, problems };
}

export async function parsePriceListFile(file: File): Promise<ParsedPriceList> {
  const buffer = await file.arrayBuffer();
  // raw: keep text as text, so part numbers like 0001217203 keep their leading zeros.
  const workbook = XLSX.read(buffer, { type: "array", raw: true, cellText: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("The file has no sheets.");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "", blankrows: false });
  return parsePriceListRows(rows);
}

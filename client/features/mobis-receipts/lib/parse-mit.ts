/**
 * Reads a Mobis invoice in MIT format:
 *
 *   Invoice Detail
 *   Invoice No:      A6EA0567A
 *   Order No | L / I | Part No | Part Name | QTY | Unit Price | Amount Extended | Case No. | INT | WEIGHT | HS CODE
 *   AV10K6Q01R | 0001 | 84710Q6020WK | CRASH PAD ASSY-MAIN | 1 | 165.08 | 165.08 | SPD2APE00210 | | |
 *
 * Works with .xls, .xlsx, .csv and tab-separated text. Columns are found by
 * their header names, so extra or reordered columns do not matter.
 */
import * as XLSX from "xlsx";

export type MitFileLine = {
  row: number;
  orderNumber: string;
  lineNumber: string;
  partNumber: string;
  partName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  caseNumber: string;
  intRef: string;
  weight: number | null;
  hsCode: string;
};

export type ParsedMitFile = {
  invoiceNumber: string;
  lines: MitFileLine[];
  /** Rows that looked like data but could not be read; they are left out. */
  problems: string[];
};

type Column = keyof Omit<MitFileLine, "row">;

const HEADERS: { key: Column; match: RegExp }[] = [
  { key: "orderNumber", match: /^order\s*no\.?$/i },
  { key: "lineNumber", match: /^l\s*\/\s*i$/i },
  { key: "partNumber", match: /^part\s*no\.?$/i },
  { key: "partName", match: /^part\s*name$/i },
  { key: "quantity", match: /^(qty|quantity)$/i },
  { key: "unitPrice", match: /^unit\s*price$/i },
  { key: "amount", match: /^amount(\s*extended)?$/i },
  { key: "caseNumber", match: /^case\s*no\.?$/i },
  { key: "intRef", match: /^int$/i },
  { key: "weight", match: /^weight$/i },
  { key: "hsCode", match: /^hs\s*code$/i },
];

const clean = (v: unknown) => String(v ?? "").replace(/ /g, " ").trim();
const num = (v: string) => {
  const n = Number(v.replace(/,/g, ""));
  return v !== "" && Number.isFinite(n) ? n : NaN;
};

function findInvoiceNumber(rows: string[][]): string {
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const cell = row[i];
      const m = cell.match(/invoice\s*no\.?\s*:?\s*(.*)$/i);
      if (!m) continue;
      if (m[1].trim()) return m[1].trim();
      const next = row.slice(i + 1).find((c) => c);
      if (next) return next;
    }
  }
  return "";
}

export function parseMitRows(rawRows: unknown[][]): ParsedMitFile {
  const rows = rawRows.map((r) => (r ?? []).map(clean));
  const invoiceNumber = findInvoiceNumber(rows);

  const headerIndex = rows.findIndex(
    (r) => r.some((c) => /^order\s*no\.?$/i.test(c)) && r.some((c) => /^part\s*no\.?$/i.test(c)),
  );
  if (headerIndex < 0) {
    throw new Error('This file is not in MIT format: no header row with "Order No" and "Part No" was found.');
  }
  const header = rows[headerIndex];
  const col = new Map<Column, number>();
  for (const { key, match } of HEADERS) {
    const idx = header.findIndex((h) => match.test(h));
    if (idx >= 0) col.set(key, idx);
  }
  for (const required of ["partNumber", "quantity", "unitPrice"] as Column[]) {
    if (!col.has(required)) throw new Error(`The MIT header is missing the "${required}" column.`);
  }
  const get = (r: string[], key: Column) => (col.has(key) ? (r[col.get(key)!] ?? "") : "");

  const lines: MitFileLine[] = [];
  const problems: string[] = [];
  rows.slice(headerIndex + 1).forEach((r, i) => {
    const rowNumber = headerIndex + i + 2; // 1-based spreadsheet row
    const partNumber = get(r, "partNumber").toUpperCase();
    if (!partNumber) return; // blank or trailing rows
    const quantity = num(get(r, "quantity"));
    const unitPrice = num(get(r, "unitPrice"));
    const amountText = get(r, "amount");
    const amount = amountText ? num(amountText) : Math.round(quantity * unitPrice * 100) / 100;
    if (!Number.isInteger(quantity) || quantity <= 0 || Number.isNaN(unitPrice) || Number.isNaN(amount)) {
      problems.push(`Row ${rowNumber} (${partNumber}): quantity, unit price or amount could not be read`);
      return;
    }
    const weight = num(get(r, "weight"));
    lines.push({
      row: rowNumber,
      orderNumber: get(r, "orderNumber"),
      lineNumber: get(r, "lineNumber"),
      partNumber,
      partName: get(r, "partName"),
      quantity,
      unitPrice,
      amount,
      caseNumber: get(r, "caseNumber"),
      intRef: get(r, "intRef"),
      weight: Number.isNaN(weight) ? null : weight,
      hsCode: get(r, "hsCode"),
    });
  });
  if (lines.length === 0) throw new Error("The file has an MIT header but no invoice lines.");
  return { invoiceNumber, lines, problems };
}

export async function parseMitFile(file: File): Promise<ParsedMitFile> {
  const buffer = await file.arrayBuffer();
  // raw: keep text as text, so part numbers like 0001217203 keep their leading zeros.
  const workbook = XLSX.read(buffer, { type: "array", raw: true, cellText: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("The file has no sheets.");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "", blankrows: false });
  return parseMitRows(rows);
}

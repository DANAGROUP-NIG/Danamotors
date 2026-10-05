/**
 * Pure helpers for importing warranty data from legacy AutoEnhancer CSV exports
 * (model, vehiclemaster, warrdef, warrcomp, warrpos, warrrej, partmast).
 * Used by prisma/legacy/warranty-migrate.ts; database-free so it is unit tested.
 */

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes. Returns rows of cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export type CsvRecord = Record<string, string>;

/** Rows as objects keyed by lower-cased header. */
export function csvRecords(text: string): { headers: string[]; records: CsvRecord[] } {
  const [head, ...body] = parseCsv(text);
  if (!head) return { headers: [], records: [] };
  const headers = head.map((h) => h.trim().toLowerCase());
  return {
    headers,
    records: body.map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()]))),
  };
}

/** First non-empty value among the given column aliases (case-insensitive). */
export function pick(record: CsvRecord, ...aliases: string[]): string | null {
  for (const alias of aliases) {
    const value = record[alias.toLowerCase()];
    if (value !== undefined && value !== "") return value;
  }
  return null;
}

/** Which of the alias groups are missing from the headers, for the report. */
export function missingColumns(headers: string[], groups: Record<string, string[]>): string[] {
  const set = new Set(headers);
  return Object.entries(groups)
    .filter(([, aliases]) => !aliases.some((a) => set.has(a.toLowerCase())))
    .map(([name]) => name);
}

/**
 * Legacy dates: DD/MM/YYYY (with optional time), YYYY-MM-DD, or DD-MMM-YYYY (12-Mar-2023).
 * Returns a UTC-midnight Date, or null for blank, placeholder or impossible dates.
 */
export function parseLegacyDate(value: string | null): Date | null {
  if (!value) return null;
  const v = value.trim();
  if (!v || /^0?0[/-]0?0[/-]0{2,4}/.test(v) || v.startsWith("1900-01-01") || v.startsWith("01/01/1900")) return null;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  let y: number;
  let m: number;
  let d: number;
  let match: RegExpMatchArray | null;
  if ((match = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = v.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/))) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = v.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/))) {
    d = Number(match[1]);
    m = months.indexOf(match[2].toLowerCase()) + 1;
    y = Number(match[3]);
    if (y < 100) y += 2000;
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1980 || y > 2100) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 ? date : null;
}

/** Y/N, 1/0, T/F, TRUE/FALSE. Unknown values return null. */
export function parseLegacyFlag(value: string | null): boolean | null {
  if (value == null) return null;
  const v = value.trim().toUpperCase();
  if (["Y", "YES", "1", "T", "TRUE", "W"].includes(v)) return true;
  if (["N", "NO", "0", "F", "FALSE", ""].includes(v)) return false;
  return null;
}

/** A positive whole number (days, km), or null. Accepts "100,000". */
export function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export function parseMoney(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value.replace(/[,\s₦]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/** Normalises part numbers for matching (legacy stores them with and without dashes). */
export function partKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Normalises model names for matching Vehicle.model free text to a model master row. */
export function modelKey(value: string): string {
  return value
    .toUpperCase()
    .replace(/^KIA\s+/, "")
    .replace(/[^A-Z0-9]/g, "");
}

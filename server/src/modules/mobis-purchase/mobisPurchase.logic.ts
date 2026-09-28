/**
 * Pure rules for Mobis purchase receiving (issue #62, Process B):
 *   Mobis invoice file (MIT format) -> MIT -> MRN -> CPD stock.
 * Database-free so it can be unit tested directly.
 */
import { BadRequestError } from "../../shared/errors/appError";

export const MOBIS_VENDOR = "MOBIS";
export const DEFAULT_CONVERSION_RATE = 2700;
export const MRN_TAX_FORM = "P";

export interface ImportLineInput {
  orderNumber?: string;
  lineNumber?: number | string;
  partNumber: string;
  partName?: string;
  quantity: number;
  unitPrice: number;
  amount?: number;
  caseNumber?: string;
  intRef?: string;
  weight?: number;
  hsCode?: string;
}

export interface CleanImportLine {
  orderNumber: string | null;
  lineNumber: number | null;
  partNumber: string;
  partName: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  caseNumber: string | null;
  intRef: string | null;
  weight: number | null;
  hsCode: string | null;
}

const text = (v?: string | null) => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Part numbers on Mobis files are padded with spaces; compare them trimmed and upper-cased. */
export function normalizePartNumber(partNumber: string): string {
  return partNumber.trim().toUpperCase();
}

/**
 * Clean and validate invoice lines. The extended amount must agree with
 * quantity x unit price (to the cent) so a mis-read file is caught before stock moves.
 */
export function cleanImportLines(lines: ImportLineInput[]): CleanImportLine[] {
  if (!lines.length) throw new BadRequestError("The invoice has no lines");
  const errors: string[] = [];
  const clean = lines.map((line, index) => {
    const row = index + 1;
    const partNumber = normalizePartNumber(line.partNumber ?? "");
    if (!partNumber) errors.push(`Line ${row}: part number is missing`);
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      errors.push(`Line ${row} (${partNumber || "?"}): quantity must be a whole number above zero`);
    }
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
      errors.push(`Line ${row} (${partNumber || "?"}): unit price must be zero or more`);
    }
    const expected = round2(line.quantity * line.unitPrice);
    const amount = line.amount === undefined || line.amount === null ? expected : round2(line.amount);
    if (Math.abs(amount - expected) > 0.01) {
      errors.push(`Line ${row} (${partNumber}): amount ${amount} does not equal ${line.quantity} x ${line.unitPrice}`);
    }
    const ln = typeof line.lineNumber === "string" ? parseInt(line.lineNumber, 10) : line.lineNumber;
    return {
      orderNumber: text(line.orderNumber),
      lineNumber: Number.isInteger(ln) ? (ln as number) : null,
      partNumber,
      partName: text(line.partName),
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount,
      caseNumber: text(line.caseNumber),
      intRef: text(line.intRef),
      weight: line.weight === undefined || line.weight === null || Number.isNaN(line.weight) ? null : line.weight,
      hsCode: text(line.hsCode),
    };
  });
  if (errors.length) {
    throw new BadRequestError(`The invoice has ${errors.length} problem(s): ${errors.slice(0, 10).join("; ")}`);
  }
  return clean;
}

export function importTotals(lines: CleanImportLine[]) {
  return {
    totalQuantity: lines.reduce((s, l) => s + l.quantity, 0),
    totalAmount: round2(lines.reduce((s, l) => s + l.amount, 0)),
    totalCases: new Set(lines.map((l) => l.caseNumber).filter(Boolean)).size,
  };
}

/** Local (naira) unit cost from the vendor unit price. */
export function unitCost(unitPrice: number, conversionRate: number): number {
  return round2(unitPrice * conversionRate);
}

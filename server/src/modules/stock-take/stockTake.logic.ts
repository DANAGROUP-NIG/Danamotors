/**
 * Physical stock taking rules (legacy PSTbatch.dll and PhysicalStock.dll).
 * Database-free so it can be unit tested directly.
 */
import { BadRequestError } from "../../shared/errors/appError";
import { money } from "../finance/money";

/** How batch parts and sheet parts are chosen: by part number or by bin location (legacy radio buttons). */
export type Basis = "PART" | "BIN";

/**
 * Physical counts (annual, perpetual) or stock audits (legacy TranType P and S). An audit is counted
 * the same way but only reports: it never adjusts stock or bins and never holds parts against a
 * physical count.
 */
export type Kind = "COUNT" | "AUDIT";
export const kindOf = (type: string): Kind => (type === "AUDIT" ? "AUDIT" : "COUNT");

/** What happens to parts left blank on an uploaded sheet: counted as none, or back to the pool. */
export type UncountedOnSheet = "ZERO" | "RELEASE";

/** What completing a count does with parts nobody counted: counted as none, or dropped from the count. */
export type UncountedOnComplete = "ZERO" | "REMOVE";

export interface CountedLine {
  countedQuantity: number | null;
  damagedQuantity: number;
  stockAtCount: number | null;
  systemStock: number;
}

/**
 * Physical stock (good + damaged) minus system stock when the part was counted; null until counted.
 * Legacy: (QTY + DamageQty) - CurrStock. Positive is excess, negative is shortage.
 */
export function discrepancy(line: CountedLine): number | null {
  if (line.countedQuantity == null) return null;
  return line.countedQuantity + line.damagedQuantity - (line.stockAtCount ?? line.systemStock);
}

/** Inclusive range check, ignoring case; a blank end leaves that side open. */
export function inRange(value: string | null | undefined, from?: string, to?: string): boolean {
  const v = (value ?? "").trim().toUpperCase();
  if (from?.trim() && v < from.trim().toUpperCase()) return false;
  if (to?.trim() && v > to.trim().toUpperCase()) return false;
  return true;
}

/**
 * Longest bin location a branch can hold (legacy PARTBAL.bincard). Bins merged from a count can run
 * past it ("29B3/63A3/67B2/..."); the store must pick one before updating bins.
 */
export const BIN_LIMIT = 40;

/** Every bin a part was found in, each once, joined with "/" (legacy FinalBin, e.g. "N-3D3/QSB"). */
export function mergeBins(existing: string | null | undefined, added: (string | null | undefined)[]): string | null {
  const bins: string[] = [];
  for (const bin of [...(existing ?? "").split("/"), ...added]) {
    const b = bin?.trim().toUpperCase();
    if (b && !bins.includes(b)) bins.push(b);
  }
  return bins.length ? bins.join("/") : null;
}

/** Sheet criteria as shown on the sheet, e.g. "Bins N-3A1 to N-3Z9". */
export function describeCriteria(c: { basis?: Basis; from?: string; to?: string; picked?: number }): string {
  if (c.picked) return `${c.picked} part(s) picked by hand`;
  const from = c.from?.trim();
  const to = c.to?.trim();
  const what = c.basis === "BIN" ? "Bins" : "Parts";
  if (from && to) return `${what} ${from} to ${to}`;
  if (from) return `${what} from ${from}`;
  if (to) return `${what} up to ${to}`;
  return "All remaining parts";
}

export interface CountEntry {
  partId?: string;
  partNumber?: string;
  binLocation?: string;
  quantity: number;
  damagedQuantity?: number;
  remarks?: string;
  countedAt?: Date;
}

export interface GroupedCount {
  /** partId when known, else the upper-case part number. */
  key: string;
  partId?: string;
  partNumber?: string;
  quantity: number;
  damagedQuantity: number;
  bins: string[];
  remarks: string[];
  countedAt?: Date;
  entries: CountEntry[];
}

/** Scans of the same part (several bins, several checkers) add up, as legacy merges them. */
export function groupCounts(entries: CountEntry[]): GroupedCount[] {
  const groups = new Map<string, GroupedCount>();
  for (const entry of entries) {
    const number = entry.partNumber?.trim().toUpperCase();
    const key = entry.partId ?? number;
    if (!key) throw new BadRequestError("Each count needs a part");
    if (entry.quantity < 0 || (entry.damagedQuantity ?? 0) < 0) throw new BadRequestError("Counted quantities cannot be negative");
    const group = groups.get(key) ?? {
      key,
      partId: entry.partId,
      partNumber: number,
      quantity: 0,
      damagedQuantity: 0,
      bins: [],
      remarks: [],
      entries: [],
    };
    group.quantity += entry.quantity;
    group.damagedQuantity += entry.damagedQuantity ?? 0;
    if (entry.binLocation?.trim()) group.bins.push(entry.binLocation.trim());
    if (entry.remarks?.trim() && !group.remarks.includes(entry.remarks.trim())) group.remarks.push(entry.remarks.trim());
    if (entry.countedAt && (!group.countedAt || entry.countedAt > group.countedAt)) group.countedAt = entry.countedAt;
    group.entries.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Remarks kept on a line: earlier ones first, each once. */
export function mergeRemarks(existing: string | null | undefined, added: string[]): string | null {
  const all = [...(existing ? existing.split("; ") : []), ...added].filter(Boolean);
  const unique = [...new Set(all)];
  return unique.length ? unique.join("; ").slice(0, 500) : null;
}

/**
 * Stock after the S/E adjustment. The discrepancy was measured when the part was counted, so it is
 * added to today's stock; anything that moved since stays. Refused if stock would go below zero or
 * below what is reserved.
 */
export function adjustedStock(current: { quantity: number; reservedQuantity: number }, adjustment: number) {
  const quantity = current.quantity + adjustment;
  if (quantity < 0) return { quantity, problem: `stock would fall to ${quantity}` };
  if (quantity < current.reservedQuantity) return { quantity, problem: `${current.reservedQuantity} unit(s) are reserved` };
  return { quantity };
}

export interface SummaryLine extends CountedLine {
  partId: string | null;
  notRequired: boolean;
  onOpenSheet: boolean;
  /** Dealer rate the shortage and excess are valued at. */
  rate: number;
}

export interface StockTakeSummary {
  lines: number;
  counted: number;
  uncounted: number;
  onOpenSheets: number;
  unknown: number;
  systemQuantity: number;
  physicalQuantity: number;
  damagedQuantity: number;
  discrepancies: number;
  excessQuantity: number;
  excessValue: number;
  shortageQuantity: number;
  shortageValue: number;
}

/** Totals shown on the count (legacy Total Items, Total Phy. Stk. Qty, Total Damage Qty, S/E values). */
export function summarise(lines: SummaryLine[]): StockTakeSummary {
  const s: StockTakeSummary = {
    lines: lines.length,
    counted: 0,
    uncounted: 0,
    onOpenSheets: 0,
    unknown: 0,
    systemQuantity: 0,
    physicalQuantity: 0,
    damagedQuantity: 0,
    discrepancies: 0,
    excessQuantity: 0,
    excessValue: 0,
    shortageQuantity: 0,
    shortageValue: 0,
  };
  for (const line of lines) {
    if (line.onOpenSheet) s.onOpenSheets++;
    if (!line.partId) {
      if (!line.notRequired) s.unknown++;
      continue;
    }
    s.systemQuantity += line.stockAtCount ?? line.systemStock;
    const diff = discrepancy(line);
    if (diff == null) {
      s.uncounted++;
      continue;
    }
    s.counted++;
    s.physicalQuantity += line.countedQuantity ?? 0;
    s.damagedQuantity += line.damagedQuantity;
    if (diff === 0) continue;
    s.discrepancies++;
    if (diff > 0) {
      s.excessQuantity += diff;
      s.excessValue += diff * line.rate;
    } else {
      s.shortageQuantity -= diff;
      s.shortageValue -= diff * line.rate;
    }
  }
  s.excessValue = money(s.excessValue);
  s.shortageValue = money(s.shortageValue);
  return s;
}

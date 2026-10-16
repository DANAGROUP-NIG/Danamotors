/**
 * Vendor receipts: local, used and repaired parts (and CPD's direct non-Mobis purchases) bought
 * from a vendor and posted to branch stock on an MRN. Pure helpers, kept apart for unit tests.
 */
import { BadRequestError } from "../../shared/errors/appError";
import { round2 } from "../mobis-purchase/mobisPurchase.logic";

export interface VendorReceiptLineInput {
  partId: string;
  quantity: number;
  unitCost: number;
  remarks?: string;
}

/** Mobis invoices come in through the MIT upload (Mobis receipts), never as a vendor receipt. */
export const isMobisVendor = (name: string) => /\bmobis\b/i.test(name);

/** One line per part record; whole, positive quantities and a cost above zero. */
export function checkReceiptLines(lines: VendorReceiptLineInput[]) {
  if (!lines.length) throw new BadRequestError("Add at least one part to the receipt");
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.partId)) throw new BadRequestError("Each part can appear only once on a receipt; add the quantities together");
    seen.add(line.partId);
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) throw new BadRequestError("Quantities must be whole numbers above zero");
    if (!(line.unitCost > 0)) throw new BadRequestError("Unit cost must be greater than zero");
  }
  return lines.map((line) => ({ ...line, unitCost: round2(line.unitCost), amount: round2(round2(line.unitCost) * line.quantity) }));
}

export const receiptTotals = (lines: { quantity: number; amount: number }[]) => ({
  totalReceived: lines.reduce((sum, line) => sum + line.quantity, 0),
  totalValue: round2(lines.reduce((sum, line) => sum + line.amount, 0)),
});

/** Retail follows the Mobis method: dealer rate x price category multiplier; no category keeps the current retail. */
export const retailFromMultiplier = (dealerRate: number, multiplier: number | null | undefined, current: number | null) =>
  multiplier == null ? current : Math.round(dealerRate * multiplier * 100) / 100;

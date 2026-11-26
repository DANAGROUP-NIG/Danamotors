/**
 * Vendor receipts: local, used and repaired parts (and CPD's direct non-Mobis purchases) bought
 * from a vendor and posted to branch stock on an MRN. Pure helpers, kept apart for unit tests.
 */
import { BadRequestError } from "../../shared/errors/appError";
import { round2 } from "../mobis-purchase/mobisPurchase.logic";
import { BRANCH_BOUGHT_SOURCES } from "../inventory/partSource";
import { STN_TAX_FORMS } from "../stock-transfer/stockTransfer.logic";

export interface VendorReceiptLineInput {
  partId: string;
  quantity: number;
  /** Price on the vendor invoice, in the invoice currency (naira unless a conversion rate is given). */
  unitPrice: number;
  remarks?: string;
}

/** Mobis invoices come in through the MIT upload (Mobis receipts), never as a vendor receipt. */
export const isMobisVendor = (name: string) => /\bmobis\b/i.test(name);

// ── Tax form ────────────────────────────────────────────────────────────────

/**
 * Tax forms a vendor MRN can carry (legacy `mrnhead.formtype`, chosen per MRN). Since 2024: Lagos Y and X,
 * CPD P and X, Abuja Y, X and Z. L (sale) was never used on an MRN.
 */
export const MRN_TAX_FORM_CODES = ["P", "Y", "Z", "X"] as const;
export type MrnTaxForm = (typeof MRN_TAX_FORM_CODES)[number];
export const MRN_TAX_FORMS: Record<MrnTaxForm, string> = {
  P: STN_TAX_FORMS.P,
  Y: STN_TAX_FORMS.Y,
  Z: STN_TAX_FORMS.Z,
  X: STN_TAX_FORMS.X,
};

/** Legacy MRNs followed the vendor type: imported vendors P, local or untyped vendors Y. */
export const defaultMrnTaxForm = (vendorType: string | null | undefined): MrnTaxForm =>
  vendorType?.trim().toUpperCase() === "IMP" ? "P" : "Y";

/**
 * Legacy charged VAT on an MRN only under form Z (ABJ 2021000231 and 2025000002, 7.5% on every line);
 * no Y, X or P MRN carried any. Like sales, only taxable parts carry it.
 */
export function mrnLineVat(taxForm: string, taxable: boolean, amount: number, vatRate: number) {
  const vatPercent = taxForm === "Z" && taxable ? vatRate : 0;
  return { vatPercent, taxAmount: round2((amount * vatPercent) / 100) };
}

// ── Lines and totals ──────────────────────────────────────────────────────────

/** One line per part record; whole, positive quantities and a price above zero; naira cost at the rate. */
export function checkReceiptLines(lines: VendorReceiptLineInput[], conversionRate = 1) {
  if (!lines.length) throw new BadRequestError("Add at least one part to the receipt");
  if (!(conversionRate > 0)) throw new BadRequestError("The conversion rate must be above zero");
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.partId)) throw new BadRequestError("Each part can appear only once on a receipt; add the quantities together");
    seen.add(line.partId);
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) throw new BadRequestError("Quantities must be whole numbers above zero");
    if (!(line.unitPrice > 0)) throw new BadRequestError("Unit price must be greater than zero");
  }
  return lines.map((line) => {
    const unitPrice = round2(line.unitPrice);
    const unitCost = round2(unitPrice * conversionRate);
    return { ...line, unitPrice, unitCost, amount: round2(unitCost * line.quantity) };
  });
}

/**
 * Goods value, VAT and the amount payable. With `roundToNaira` (legacy control1.roundmrn, on at CPD and
 * Abuja) the payable is rounded to the naira and the difference kept as round-off, e.g. ABJ 2025000002:
 * ₦184,500 + ₦13,837.50 VAT = ₦198,337.50 → ₦198,338, round-off ₦0.50.
 */
export function receiptTotals(lines: { quantity: number; amount: number; taxAmount?: number }[], roundToNaira: boolean) {
  const totalValue = round2(lines.reduce((sum, line) => sum + line.amount, 0));
  const taxAmount = round2(lines.reduce((sum, line) => sum + (line.taxAmount ?? 0), 0));
  const beforeRound = round2(totalValue + taxAmount);
  const netAmount = roundToNaira ? Math.round(beforeRound) : beforeRound;
  return {
    totalReceived: lines.reduce((sum, line) => sum + line.quantity, 0),
    totalValue,
    taxAmount,
    roundOff: round2(netAmount - beforeRound),
    netAmount,
  };
}

// ── Part rates ────────────────────────────────────────────────────────────────

/**
 * Whether a receipt re-prices the part. Legacy set the dealer rate from the MRN for branch-bought (L)
 * records only: Lagos parts last received in 2025+ match the MRN rate on 98 of 112 L parts but 4 of 212
 * O parts, which local vendors sell at about 0.6x the Mobis price. Mobis records (O/A/F) keep Finance's price.
 */
export const repricesOnReceipt = (partFlag: string) => BRANCH_BOUGHT_SOURCES.includes(partFlag);

/** Retail follows the legacy method: dealer rate x price category multiplier; no category keeps the current retail. */
export const retailFromMultiplier = (dealerRate: number, multiplier: number | null | undefined, current: number | null) =>
  multiplier == null ? current : Math.round(dealerRate * multiplier * 100) / 100;

// ── Edit ──────────────────────────────────────────────────────────────────────

export interface ExistingLine {
  id: string;
  partId: string;
  partNumber: string;
  receivedQuantity: number;
  unitPrice: number;
  returnedQuantity: number;
}

/**
 * Compares a vendor MRN's lines with the corrected set: which lines are added, changed or removed, and
 * the stock each change moves (positive: more received). A line already returned in part cannot drop
 * below what went back to the vendor.
 */
export function diffReceiptLines(existing: ExistingLine[], next: { partId: string; quantity: number; unitPrice: number }[]) {
  const nextByPart = new Map(next.map((l) => [l.partId, l]));
  const changes: { partId: string; lineId: string | null; partNumber: string | null; oldQuantity: number; newQuantity: number; oldPrice: number | null; newPrice: number | null; delta: number }[] = [];
  for (const line of existing) {
    const n = nextByPart.get(line.partId);
    const newQuantity = n?.quantity ?? 0;
    if (newQuantity < line.returnedQuantity) {
      throw new BadRequestError(`${line.partNumber}: ${line.returnedQuantity} already went back to the vendor; the quantity cannot be lower`);
    }
    if (newQuantity !== line.receivedQuantity || (n && round2(n.unitPrice) !== line.unitPrice)) {
      changes.push({
        partId: line.partId,
        lineId: line.id,
        partNumber: line.partNumber,
        oldQuantity: line.receivedQuantity,
        newQuantity,
        oldPrice: line.unitPrice,
        newPrice: n ? round2(n.unitPrice) : null,
        delta: newQuantity - line.receivedQuantity,
      });
    }
  }
  const known = new Set(existing.map((l) => l.partId));
  for (const n of next) {
    if (!known.has(n.partId)) {
      changes.push({ partId: n.partId, lineId: null, partNumber: null, oldQuantity: 0, newQuantity: n.quantity, oldPrice: null, newPrice: round2(n.unitPrice), delta: n.quantity });
    }
  }
  return changes;
}

// ── Return to vendor ─────────────────────────────────────────────────────────

/** What can still go back on an MRN line: received less already returned. */
export const returnableQuantity = (line: { receivedQuantity: number; returnedQuantity: number }) =>
  Math.max(line.receivedQuantity - line.returnedQuantity, 0);

/**
 * The lines of a return: every returnable unit on a full return (legacy "Full Return"), else the
 * quantities asked for, each within what is left on its MRN line. Amount and VAT follow the MRN line.
 */
export function planReturn(
  mrnLines: { id: string; partId: string; partNumber: string; receivedQuantity: number; returnedQuantity: number; unitCost: number; vatPercent: number }[],
  request: { fullReturn?: boolean; lines?: { mrnLineId: string; quantity: number }[] },
) {
  const asked = new Map((request.lines ?? []).map((l) => [l.mrnLineId, l.quantity]));
  for (const id of asked.keys()) {
    if (!mrnLines.some((l) => l.id === id)) throw new BadRequestError("A line to return is not on this MRN");
  }
  const planned = mrnLines
    .map((line) => {
      const left = returnableQuantity(line);
      const quantity = request.fullReturn ? left : asked.get(line.id) ?? 0;
      if (!Number.isInteger(quantity) || quantity < 0) throw new BadRequestError(`${line.partNumber}: the quantity must be a whole number`);
      if (quantity > left) throw new BadRequestError(`${line.partNumber}: only ${left} can still be returned on this MRN`);
      const amount = round2(line.unitCost * quantity);
      return { mrnLineId: line.id, partId: line.partId, partNumber: line.partNumber, quantity, unitCost: line.unitCost, amount, vatPercent: line.vatPercent, taxAmount: round2((amount * line.vatPercent) / 100) };
    })
    .filter((l) => l.quantity > 0);
  if (!planned.length) throw new BadRequestError(request.fullReturn ? "Everything on this MRN has already been returned" : "Enter a quantity to return");
  return planned;
}

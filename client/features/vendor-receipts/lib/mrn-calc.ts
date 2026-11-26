import type { MrnTaxForm } from "../types/vendor-receipt.types";

/** Legacy `taxform` master as an MRN uses it. Only Z carries VAT on an MRN. */
export const MRN_TAX_FORM_LABELS: Record<MrnTaxForm, string> = {
  Y: "Y · Purchase local (no VAT)",
  Z: "Z · Purchase local with VAT 7.5%",
  P: "P · Purchase imported",
  X: "X · Transfer without VAT",
};

export const VAT_PERCENT = 7.5;
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Same rules as the server (vendorReceipt.logic.ts): VAT under Z on taxable parts; optional round-off to the naira. */
export function mrnTotals(lines: { quantity: number; unitPrice: number; taxable: boolean }[], taxForm: MrnTaxForm, conversionRate: number, roundToNaira: boolean) {
  let totalValue = 0;
  let taxAmount = 0;
  for (const line of lines) {
    const amount = round2(round2(round2(line.unitPrice) * conversionRate) * line.quantity);
    totalValue += amount;
    if (taxForm === "Z" && line.taxable) taxAmount += round2((amount * VAT_PERCENT) / 100);
  }
  totalValue = round2(totalValue);
  taxAmount = round2(taxAmount);
  const beforeRound = round2(totalValue + taxAmount);
  const netAmount = roundToNaira ? Math.round(beforeRound) : beforeRound;
  return { totalValue, taxAmount, roundOff: round2(netAmount - beforeRound), netAmount };
}

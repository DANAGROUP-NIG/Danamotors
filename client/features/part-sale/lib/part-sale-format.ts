import type { StatusTone } from "@/components/ui/table-components/StatusBadge";
import type { CustomerOrderStatus, OrderLineCounts, SaleCustomer, SaleTaxForm, TransportMode } from "../types/part-sale.types";

export { fmtCurrency } from "@/features/stock-transfers/lib/indent-status";
export { fmtDate, isCpd } from "@/features/mobis-receipts/lib/mobis-labels";

// Legacy CPO status: A = active, E = executed, C = cancelled.
export const ORDER_STATUS_LABELS: Record<CustomerOrderStatus, string> = {
  OPEN: "Open",
  PARTLY_BILLED: "Partly billed",
  BILLED: "Billed",
  CANCELLED: "Cancelled",
};

export const ORDER_STATUS_TONES: Record<CustomerOrderStatus, StatusTone> = {
  OPEN: "blue",
  PARTLY_BILLED: "amber",
  BILLED: "emerald",
  CANCELLED: "gray",
};

export const BILL_STATUS_TONES: Record<string, StatusTone> = {
  Unpaid: "amber",
  "Partially Paid": "orange",
  Paid: "emerald",
  Overdue: "red",
  Cancelled: "gray",
};

export const TRANSPORT_MODE_LABELS: Record<TransportMode, string> = {
  ROAD: "Road",
  AIR: "Air",
  SEA: "Ship",
  COURIER: "Courier",
  HAND_DELIVERY: "Hand delivery",
  DOOR_DELIVERY: "Door delivery",
};

export const TAX_FORM_LABELS: Record<SaleTaxForm, string> = {
  VAT_SALE: "Sale (VAT)",
  TRANSFER_WITHOUT_VAT: "Transfer without VAT (TRNSFR WO/V)",
};

/** VAT % on a bill line: none on a transfer without VAT (legacy form X), else 7.5% on taxable parts. */
export const lineVatPercent = (taxForm: SaleTaxForm, taxable: boolean | undefined) =>
  taxForm === "TRANSFER_WITHOUT_VAT" || !taxable ? 0 : VAT_RATE;

export const customerName = (c: Pick<SaleCustomer, "companyName" | "firstName" | "lastName">) =>
  c.companyName || `${c.firstName} ${c.lastName}`.trim();

export const customerAddress = (c: SaleCustomer) =>
  [c.house, c.street, c.address, c.city, c.state].filter(Boolean).join(", ");

export const openQuantity = (l: OrderLineCounts) =>
  l.orderedQuantity - l.pickedQuantity - l.billedQuantity - l.cancelledQuantity;
export const billableQuantity = (l: OrderLineCounts) => l.orderedQuantity - l.billedQuantity - l.cancelledQuantity;

/** CPD counter sales charge 7.5% VAT on taxable parts; the server applies the configured rate. */
export const VAT_RATE = 7.5;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Preview of the server's bill and return pricing (legacy counter sale), per line:
 * gross, less the line trade discount %, less the bill cash discount %, plus the line handling %,
 * plus VAT on what is left; the bill is rounded down to the nearest 10 naira.
 * The server recomputes everything when the document is saved.
 */
export function previewSale(
  lines: { quantity: number; rate: number; vatPercent: number; tradeDiscountPercent?: number; handlingPercent?: number }[],
  discountPercent: number,
) {
  let gross = 0;
  let tradeDiscount = 0;
  let discount = 0;
  let handling = 0;
  let vat = 0;
  for (const l of lines) {
    const g = round2(l.quantity * l.rate);
    const t = round2((g * (l.tradeDiscountPercent ?? 0)) / 100);
    const d = round2(((g - t) * discountPercent) / 100);
    const h = round2(((g - t - d) * (l.handlingPercent ?? 0)) / 100);
    gross += g;
    tradeDiscount += t;
    discount += d;
    handling += h;
    vat += round2(((g - t - d + h) * l.vatPercent) / 100);
  }
  const beforeRoundOff = round2(gross - tradeDiscount - discount + handling + vat);
  const total = Math.floor(beforeRoundOff / 10) * 10;
  return {
    gross: round2(gross),
    tradeDiscount: round2(tradeDiscount),
    discount: round2(discount),
    handling: round2(handling),
    vat: round2(vat),
    roundOff: round2(total - beforeRoundOff),
    total,
  };
}

import type { StatusTone } from "@/components/ui/table-components/StatusBadge";
import type { CustomerOrderStatus, OrderLineCounts, SaleCustomer, TransportMode } from "../types/part-sale.types";

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
 * Preview of the server's bill and return pricing (legacy CPD counter sale):
 * gross - cash discount, plus VAT on taxable lines, rounded down to the nearest 10 naira.
 * The server recomputes everything when the document is saved.
 */
export function previewSale(lines: { quantity: number; rate: number; vatPercent: number }[], discountPercent: number) {
  let gross = 0;
  let discount = 0;
  let vat = 0;
  for (const l of lines) {
    const g = round2(l.quantity * l.rate);
    const d = round2((g * discountPercent) / 100);
    gross += g;
    discount += d;
    vat += round2(((g - d) * l.vatPercent) / 100);
  }
  const beforeRoundOff = round2(gross - discount + vat);
  const total = Math.floor(beforeRoundOff / 10) * 10;
  return { gross: round2(gross), discount: round2(discount), vat: round2(vat), roundOff: round2(total - beforeRoundOff), total };
}

import { NOT_PROVIDED } from "@/lib/format";

const documentLabels: Record<string, string> = {
  CUSTOMER: "Customer",
  WARRANTY: "Warranty",
  GOODWILL: "Goodwill",
  FREE: "Free",
  ISSUED: "Issued",
  REQUESTED: "Requested",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
  RETURNED: "Returned",
  POSTED: "Posted",
  DRAFT: "Draft",
  LABOUR: "Labour",
};
export function serviceDocumentLabel(value?: string | null): string {
  return value
    ? (documentLabels[value.toUpperCase()] ?? "Unknown status")
    : NOT_PROVIDED;
}

export function lagosInput(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}
export function lagosIso(value: string) {
  return new Date(
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}+01:00`,
  ).toISOString();
}
export function remainingReturn(line: {
  quantityIssued?: number;
  returns?: { quantity: number; status: string }[];
}) {
  return Math.max(
    0,
    (line.quantityIssued ?? 0) -
      (line.returns ?? [])
        .filter(
          (row) =>
            !["CANCELLED", "REJECTED"].includes(row.status.toUpperCase()),
        )
        .reduce((total, row) => total + row.quantity, 0),
  );
}
export function canEditBooking(booking: {
  bookingStatus?: string;
  status: string;
  jobCards?: unknown[];
}) {
  return (
    (booking.bookingStatus ?? "BOOKED") === "BOOKED" &&
    !["COMPLETED", "CLOSED", "CANCELLED", "CANCELED", "NO SHOW"].includes(
      booking.status.trim().toUpperCase().replace(/[_-]+/g, " "),
    ) &&
    !booking.jobCards?.length
  );
}

const SLIP_TOTAL_LABELS: Record<string, { label: string; money: boolean }> = {
  numberOfItems: { label: "Number of items", money: false },
  netQuantityIssued: { label: "Net quantity issued", money: false },
  netQuantityReturned: { label: "Net quantity returned", money: false },
  approvedAmount: { label: "Approved amount", money: true },
  warrantyAmount: { label: "Warranty amount", money: true },
  nonWarrantyAmount: { label: "Customer amount", money: true },
  freeAmount: { label: "Free amount", money: true },
  goodwillAmount: { label: "Goodwill amount", money: true },
  totalAmount: { label: "Total amount", money: true },
};

/** A slip's footer totals as labelled rows, in a fixed order. Totals the screen has no label for are left out. */
export function slipTotals(totals: Record<string, number> | undefined): { key: string; label: string; value: number; money: boolean }[] {
  if (!totals) return [];
  return Object.entries(SLIP_TOTAL_LABELS)
    .filter(([key]) => typeof totals[key] === "number")
    .map(([key, { label, money }]) => ({ key, label, value: totals[key], money }));
}

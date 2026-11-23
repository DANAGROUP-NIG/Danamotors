import type { LabourDraft } from "./document.types";
import type { DocumentLine } from "./hooks/use-service-transactions";

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
    : "Not recorded";
}

export type RequisitionPartDraft = {
  sparePartId: string;
  requestedSparePartId?: string;
  substitutionReason?: string;
  quantityRequired: number;
  quantityIssued: number;
  approvalPercent: number;
  customerPercent: number;
};
export function chooseRequisitionSupply(
  row: RequisitionPartDraft,
  id: string,
): RequisitionPartDraft {
  if (id === row.sparePartId) return row;
  return {
    ...row,
    requestedSparePartId: row.requestedSparePartId || row.sparePartId,
    sparePartId: id,
    quantityIssued: 0,
    substitutionReason: "",
  };
}
export function requisitionLinePayload(
  row: RequisitionPartDraft,
  chargeType: string,
) {
  const changed =
    !!row.requestedSparePartId && row.requestedSparePartId !== row.sparePartId;
  return {
    sparePartId: row.sparePartId,
    requestedSparePartId: row.requestedSparePartId || undefined,
    substitutionReason: changed
      ? row.substitutionReason?.trim() || undefined
      : undefined,
    quantityRequired: row.quantityRequired,
    quantityIssued: row.quantityIssued,
    approvalPercent:
      chargeType === "GOODWILL" ? row.approvalPercent : undefined,
    customerPercent:
      chargeType === "GOODWILL" ? row.customerPercent : undefined,
  };
}
export function lagosDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Africa/Lagos",
    dateStyle: "medium",
    timeStyle: "short",
  });
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
export function canWriteTransactions(job: {
  status: string;
  billedAt?: string | null;
  invoices?: { status: string }[];
}) {
  return (
    !job.billedAt &&
    !["BILLED", "DELIVERED", "CANCELLED", "CANCELED", "CLOSED"].includes(
      job.status.toUpperCase(),
    ) &&
    !(job.invoices ?? []).some(
      (bill) =>
        !["CANCELLED", "CANCELED", "VOID"].includes(bill.status.toUpperCase()),
    )
  );
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
export const moneyText = (
  value: string | number | null | undefined,
  currency = "NGN",
) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(
    Number(value ?? 0),
  );
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
export function labourBody(row: LabourDraft) {
  return {
    ...row,
    technicianId: row.technicianId || undefined,
    mechanicId: row.mechanicId || undefined,
    groupId: row.groupId || undefined,
    campaignId: row.chargeType === "FREE" ? row.campaignId : undefined,
    reason: row.chargeType === "GOODWILL" ? row.reason?.trim() : undefined,
  };
}

/** Restore the saved payer context and represent an employee's login as one assignee. */
export function savedLabourDraft(line: DocumentLine): LabourDraft {
  return {
    labourItemId: line.labourItemId ?? "",
    technicianId: line.mechanicId
      ? undefined
      : (line.technicianId ?? undefined),
    mechanicId: line.mechanicId ?? undefined,
    groupId: line.groupId ?? undefined,
    chargedHours: line.chargedHours ?? line.hours,
    chargeType: (line.chargeLine?.chargeType ??
      "CUSTOMER") as LabourDraft["chargeType"],
    campaignId: line.chargeLine?.campaignId ?? undefined,
    reason: line.chargeLine?.chargeTypeReason ?? undefined,
  };
}

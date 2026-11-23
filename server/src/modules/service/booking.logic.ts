import { AppointmentRequest, ServiceAppointment } from "@prisma/client";
import { sumMoney } from "../finance/money";
import { BadRequestError, ConflictError } from "../../shared/errors/appError";

export function bookingView<T extends { requests: AppointmentRequest[] }>(
  booking: T,
) {
  const estimatedParts = sumMoney(
    booking.requests.map((row) => row.estimatedParts.toNumber()),
  );
  const estimatedOil = sumMoney(
    booking.requests.map((row) => row.estimatedOil.toNumber()),
  );
  const estimatedLabour = sumMoney(
    booking.requests.map((row) => row.estimatedLabour.toNumber()),
  );
  return {
    ...booking,
    totals: {
      estimatedParts,
      estimatedOil,
      estimatedLabour,
      estimatedTotal: sumMoney([estimatedParts, estimatedOil, estimatedLabour]),
    },
  };
}

export function bookingComplaints(requests: AppointmentRequest[]) {
  return requests.map((row) => ({
    complaintCodeId: row.complaintCodeId ?? undefined,
    defectCode: row.defectCode ?? undefined,
    description: row.description,
    spare: row.estimatedParts.toNumber(),
    oil: row.estimatedOil.toNumber(),
    labour: row.estimatedLabour.toNumber(),
  }));
}

export function assertPromisedDate(promisedAt: string, bookedAt: Date) {
  const promised = new Date(promisedAt);
  const day = (value: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(value);
  if (
    !Number.isFinite(promised.getTime()) ||
    promised <= bookedAt ||
    day(promised) <= day(bookedAt)
  ) {
    throw new BadRequestError(
      "Promised date must be after the booked date",
    ).withCode("FIELD_VALIDATION", { field: "promisedAt" });
  }
}

const legacyBookingStatus = (status: string) =>
  status.trim().toUpperCase().replace(/[_-]+/g, " ");

export function isTerminalBookingStatus(status: string) {
  return ["CANCELLED", "CANCELED", "COMPLETED", "CLOSED", "NO SHOW"].includes(
    legacyBookingStatus(status),
  );
}

export function assertBookable(
  booking: Pick<ServiceAppointment, "bookingStatus" | "status">,
) {
  if (
    booking.bookingStatus !== "BOOKED" ||
    isTerminalBookingStatus(booking.status)
  )
    throw new ConflictError("Booking is no longer open");
}

export function bookingState(
  booking: Pick<ServiceAppointment, "bookingStatus" | "status">,
  status?: string,
  bookingStatus?: "BOOKED" | "CANCELLED" | "NO_SHOW",
  cancelReason?: string,
) {
  const legacy = status === undefined ? undefined : legacyBookingStatus(status);
  const cancelled = legacy === "CANCELLED" || legacy === "CANCELED";
  const noShow = legacy === "NO SHOW";
  const next =
    bookingStatus ?? (cancelled ? "CANCELLED" : noShow ? "NO_SHOW" : undefined);
  if (next && next !== booking.bookingStatus) assertBookable(booking);
  if (next === "CANCELLED" && !cancelReason?.trim())
    throw new BadRequestError("A cancellation reason is required");
  if (
    bookingStatus &&
    status &&
    ((bookingStatus === "CANCELLED" && !cancelled) ||
      (bookingStatus === "NO_SHOW" && !noShow) ||
      (bookingStatus === "BOOKED" && (cancelled || noShow)))
  )
    throw new BadRequestError("Booking statuses disagree");
  return {
    bookingStatus: next,
    status:
      next === "CANCELLED"
        ? "Cancelled"
        : next === "NO_SHOW"
          ? "No Show"
          : status,
    cancelReason: next === "CANCELLED" ? cancelReason?.trim() : undefined,
  };
}

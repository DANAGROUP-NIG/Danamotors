import { BookingStatus } from '@prisma/client';

export interface AppointmentRequestInput {
  complaintCodeId?: string;
  description: string;
  estimatedParts?: number;
  estimatedLabour?: number;
  estimatedOil?: number;
}

/**
 * The reporting status of a booking for an appointment workflow status. Converted (a job was
 * opened) is set by job opening and is never undone by a later status change.
 */
export function bookingStatusFor(status: string | null | undefined, current?: BookingStatus): BookingStatus {
  if (current === BookingStatus.CONVERTED) return BookingStatus.CONVERTED;
  const normalised = (status ?? '').trim().toLowerCase().replace(/[-_]/g, ' ');
  if (normalised === 'cancelled' || normalised === 'canceled') return BookingStatus.CANCELLED;
  if (normalised === 'no show' || normalised === 'noshow') return BookingStatus.NO_SHOW;
  return BookingStatus.BOOKED;
}

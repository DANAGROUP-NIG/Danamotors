import { AppointmentRequest, ServiceAppointment } from '@prisma/client';
import { sumMoney } from '../finance/money';
import { BadRequestError, ConflictError } from '../../shared/errors/appError';

export function bookingView<T extends { requests: AppointmentRequest[] }>(booking: T) {
  const estimatedParts = sumMoney(booking.requests.map(row => row.estimatedParts.toNumber()));
  const estimatedOil = sumMoney(booking.requests.map(row => row.estimatedOil.toNumber()));
  const estimatedLabour = sumMoney(booking.requests.map(row => row.estimatedLabour.toNumber()));
  return { ...booking, totals: { estimatedParts, estimatedOil, estimatedLabour, estimatedTotal: sumMoney([estimatedParts, estimatedOil, estimatedLabour]) } };
}

export function bookingComplaints(requests: AppointmentRequest[]) {
  return requests.map(row => ({ complaintCodeId: row.complaintCodeId ?? undefined, defectCode: row.defectCode ?? undefined, description: row.description, spare: row.estimatedParts.toNumber(), oil: row.estimatedOil.toNumber(), labour: row.estimatedLabour.toNumber() }));
}

export function assertBookable(booking: Pick<ServiceAppointment, 'bookingStatus' | 'status'>) {
  if (booking.bookingStatus !== 'BOOKED' || ['Cancelled', 'Completed', 'Closed', 'No Show'].includes(booking.status)) throw new ConflictError('Booking is no longer open');
}

export function bookingState(booking: Pick<ServiceAppointment, 'bookingStatus' | 'status'>, status?: string, bookingStatus?: 'BOOKED' | 'CANCELLED' | 'NO_SHOW', cancelReason?: string) {
  const next = bookingStatus ?? (status === 'Cancelled' ? 'CANCELLED' : status === 'No Show' ? 'NO_SHOW' : undefined);
  if (next && next !== booking.bookingStatus) assertBookable(booking);
  if (next === 'CANCELLED' && !cancelReason?.trim()) throw new BadRequestError('A cancellation reason is required');
  if (bookingStatus && status && ((bookingStatus === 'CANCELLED' && status !== 'Cancelled') || (bookingStatus === 'NO_SHOW' && status !== 'No Show') || (bookingStatus === 'BOOKED' && ['Cancelled', 'No Show'].includes(status)))) throw new BadRequestError('Booking statuses disagree');
  return { bookingStatus: next, status: next === 'CANCELLED' ? 'Cancelled' : next === 'NO_SHOW' ? 'No Show' : status, cancelReason: next === 'CANCELLED' ? cancelReason?.trim() : undefined };
}

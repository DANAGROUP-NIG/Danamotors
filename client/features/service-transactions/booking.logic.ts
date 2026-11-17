import type { Appointment, BookingExtra, BookingRequest } from '@/features/appointments/types/appointment.types';
import type { CreateJobCardFormValues } from '@/features/job-cards/schemas/job-card.schema';
/** Preserve detailed stored rows rather than flattening away codes or amounts. */
export function bookingExtras(appointment: Appointment): BookingExtra {
  const rows: BookingRequest[] = (appointment.requests ?? []).map(row => ({ description: row.description, complaintCodeId: row.complaintCodeId ?? '', defectCode: row.defectCode ?? undefined, spare: Number(row.estimatedParts), oil: Number(row.estimatedOil), labour: Number(row.estimatedLabour) }));
  const detailed = rows.length > 1 || rows.some(row => row.complaintCodeId || row.defectCode || row.spare || row.oil || row.labour);
  return { mileage: appointment.mileage ?? undefined, acFitted: appointment.acFitted ?? false, followUpJobId: appointment.followUpJobId, requests: detailed ? rows : rows[0]?.description ?? '' };
}

export function bookingRequestPayload(requests: BookingExtra['requests']) {
  if (typeof requests === 'string') return requests.trim();
  return requests?.map(row => ({ description: row.description.trim(), complaintCodeId: row.complaintCodeId || undefined, defectCode: row.defectCode?.trim() || undefined, spare: row.spare, oil: row.oil, labour: row.labour }));
}

export function bookingRequestsEqual(left: BookingExtra['requests'], right: BookingExtra['requests']) {
  const comparable = (value: BookingExtra['requests']) => {
    const payload = bookingRequestPayload(value);
    return typeof payload === 'string' ? [{ description: payload, spare: 0, oil: 0, labour: 0 }] : payload;
  };
  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

export function bookingRequestsValid(requests: BookingExtra['requests']) {
  if (typeof requests === 'string') return !!requests.trim();
  return !!requests?.length && requests.length <= 100 && requests.every(row => !!row.description.trim() || !!row.complaintCodeId || !!row.defectCode);
}

export function bookingOpeningValues(appointment: Appointment): Partial<CreateJobCardFormValues> {
  const extra = bookingExtras(appointment);
  return { appointmentId: appointment.id, customerId: appointment.customerId, vehicleId: appointment.vehicleId, branchName: appointment.branch?.name, serviceTypeId: appointment.serviceTypeId ?? undefined, serviceId: appointment.serviceId ?? undefined, mileage: extra.mileage, acFitted: extra.acFitted, complaints: appointment.requests?.length ? appointment.requests.map(row => ({ description: row.description, defectCode: row.defectCode ?? undefined, complaintCodeId: row.complaintCodeId ?? '', spare: Number(row.estimatedParts), oil: Number(row.estimatedOil), labour: Number(row.estimatedLabour) })) : [{ description: '', complaintCodeId: '', spare: 0, oil: 0, labour: 0 }] };
}

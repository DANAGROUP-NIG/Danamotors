import type { Appointment, BookingExtra } from '@/features/appointments/types/appointment.types';
import type { CreateJobCardFormValues } from '@/features/job-cards/schemas/job-card.schema';
export function bookingExtras(appointment: Appointment): BookingExtra {
  return { mileage: appointment.mileage ?? undefined, acFitted: appointment.acFitted ?? false, followUpJobId: appointment.followUpJobId, requests: (appointment.requests ?? []).map(row => ({ complaintCodeId: row.complaintCodeId ?? undefined, defectCode: row.defectCode ?? undefined, description: row.description, spare: Number(row.estimatedParts), oil: Number(row.estimatedOil), labour: Number(row.estimatedLabour) })) };
}
export function bookingOpeningValues(appointment: Appointment): Partial<CreateJobCardFormValues> {
  const extra = bookingExtras(appointment);
  return { appointmentId: appointment.id, customerId: appointment.customerId, vehicleId: appointment.vehicleId, branchName: appointment.branch?.name, serviceTypeId: appointment.serviceTypeId ?? undefined, serviceId: appointment.serviceId ?? undefined, mileage: extra.mileage, acFitted: extra.acFitted, complaints: extra.requests?.length ? extra.requests.map(row => ({ ...row, complaintCodeId: row.complaintCodeId ?? '', spare: row.spare ?? 0, oil: row.oil ?? 0, labour: row.labour ?? 0 })) : [{ description: '', complaintCodeId: '', spare: 0, oil: 0, labour: 0 }] };
}

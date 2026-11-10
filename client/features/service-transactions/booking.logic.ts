import type { Appointment, BookingExtra } from '@/features/appointments/types/appointment.types';
import type { CreateJobCardFormValues } from '@/features/job-cards/schemas/job-card.schema';
export function bookingExtras(appointment: Appointment): BookingExtra {
  return { mileage: appointment.mileage ?? undefined, acFitted: appointment.acFitted ?? false, followUpJobId: appointment.followUpJobId, requests: (appointment.requests ?? []).map(row => row.description).join('\n') };
}
export function bookingOpeningValues(appointment: Appointment): Partial<CreateJobCardFormValues> {
  const extra = bookingExtras(appointment);
  return { appointmentId: appointment.id, customerId: appointment.customerId, vehicleId: appointment.vehicleId, branchName: appointment.branch?.name, serviceTypeId: appointment.serviceTypeId ?? undefined, serviceId: appointment.serviceId ?? undefined, mileage: extra.mileage, acFitted: extra.acFitted, complaints: appointment.requests?.length ? appointment.requests.map(row => ({ description: row.description, defectCode: row.defectCode ?? undefined, complaintCodeId: row.complaintCodeId ?? '', spare: Number(row.estimatedParts), oil: Number(row.estimatedOil), labour: Number(row.estimatedLabour) })) : [{ description: '', complaintCodeId: '', spare: 0, oil: 0, labour: 0 }] };
}

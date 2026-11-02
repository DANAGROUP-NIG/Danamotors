import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../prisma/client';
import { nextSequenceNumber } from '../../shared/db/documentSequence';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/appError';
import { bookingRequestBody } from './service.validation';
import { resolveJobComplaints } from './job-card-complaints';
import { bookingView } from './booking.logic';

export type BookingFields = { serviceId?: string; serviceTypeId?: string; mileage?: number; acFitted?: boolean; followUpJobId?: string | null; requests?: z.infer<typeof bookingRequestBody>[] };
export type BookingCreate = BookingFields & { customerId: string; vehicleId: string; branchId: string; createdById?: string; scheduledAt: Date; durationMins?: number; notes?: string; status?: string; source?: string };

export async function bookingRelations(tx: Prisma.TransactionClient, data: BookingFields, vehicleId: string, branchId: string) {
  if (data.serviceTypeId && !await tx.workshopMaster.findFirst({ where: { id: data.serviceTypeId, kind: 'SERVICE_TYPE', active: true } })) throw new BadRequestError('Select an active workshop service type');
  if (data.serviceId && !await tx.service.findFirst({ where: { id: data.serviceId, isActive: true } })) throw new BadRequestError('Select an active appointment service');
  if (data.followUpJobId && !await tx.jobCard.findFirst({ where: { id: data.followUpJobId, vehicleId, branchId, createdAt: { lte: new Date() }, status: { notIn: ['CANCELLED', 'Cancelled'] } } })) throw new BadRequestError('Follow-up job must be an earlier job for this vehicle and branch');
  const rows = await resolveJobComplaints(tx, data.requests ?? []);
  return rows.map(row => ({ complaintCodeId: row.complaintCodeId, defectCode: row.defectCode, description: row.description, estimatedParts: row.spare, estimatedOil: row.oil, estimatedLabour: row.labour }));
}

export async function createBooking(data: BookingCreate) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${data.vehicleId} FOR UPDATE`;
    if (!await tx.vehicle.findUnique({ where: { id: data.vehicleId } })) throw new NotFoundError('Vehicle not found');
    if (!await tx.customer.findFirst({ where: { id: data.customerId, mergedIntoId: null } })) throw new NotFoundError('Customer not found');
    if (!await tx.branch.findFirst({ where: { id: data.branchId, isActive: true } })) throw new NotFoundError('Active branch not found');
    if (data.status && data.status !== 'Pending') throw new BadRequestError('New bookings must start as booked');
    if (await tx.serviceAppointment.findFirst({ where: { customerId: data.customerId, vehicleId: data.vehicleId, bookingStatus: 'BOOKED', status: { notIn: ['Closed', 'Cancelled', 'Completed', 'No Show'] } } })) throw new ConflictError('This vehicle already has an active booking for this customer');
    const requests = await bookingRelations(tx, data, data.vehicleId, data.branchId);
    const { requests: _requests, ...fields } = data;
    const year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Africa/Lagos', year: 'numeric' }).format(new Date()));
    const number = await nextSequenceNumber(tx, `BOOKING_${data.branchId}`, new Date(year, 6, 1));
    const booking = await tx.serviceAppointment.create({ data: { ...fields, source: data.source ?? 'WalkIn', bookingNumber: `${data.branchId}/${number}`, bookingStatus: 'BOOKED', requests: { create: requests } }, include: { requests: true, service: true } });
    await tx.auditLog.create({ data: { userId: data.createdById, action: 'BOOKING_CREATED', details: JSON.stringify({ bookingId: booking.id, branchId: data.branchId, bookingNumber: booking.bookingNumber }) } });
    return bookingView(booking);
  });
}

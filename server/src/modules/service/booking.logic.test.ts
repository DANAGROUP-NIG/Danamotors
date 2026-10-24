import { Prisma } from '@prisma/client';
import { bookingView, bookingState } from './booking.logic';
import { bookingRequestBody, createAppointmentSchema, updateAppointmentSchema } from './service.validation';

it('adds estimates using decimal arithmetic and returns zero for an empty booking', () => {
  expect(bookingView({ requests: [] }).totals.estimatedTotal).toBe(0);
  const row = { id: 'r', appointmentId: 'a', complaintCodeId: null, defectCode: null, description: 'Noise', createdAt: new Date(), estimatedParts: new Prisma.Decimal('0.10'), estimatedOil: new Prisma.Decimal('0.20'), estimatedLabour: new Prisma.Decimal('12.35') };
  expect(bookingView({ requests: [row] }).totals).toEqual({ estimatedParts: 0.1, estimatedOil: 0.2, estimatedLabour: 12.35, estimatedTotal: 12.65 });
});
it('requires a reason on both cancellation paths and prevents reopening terminal bookings', () => {
  const booked = { bookingStatus: 'BOOKED' as const, status: 'Pending' };
  expect(() => bookingState(booked, 'Cancelled')).toThrow('reason');
  expect(() => bookingState(booked, undefined, 'CANCELLED')).toThrow('reason');
  expect(bookingState(booked, undefined, 'CANCELLED', 'Customer request')).toMatchObject({ bookingStatus: 'CANCELLED', status: 'Cancelled', cancelReason: 'Customer request' });
  expect(() => bookingState({ bookingStatus: 'CONVERTED', status: 'Pending' }, undefined, 'BOOKED')).toThrow('no longer open');
  expect(() => bookingState(booked, 'Cancelled', 'BOOKED', 'reason')).toThrow('disagree');
});
it('allows optional requests and service catalogue while rejecting invalid request amounts', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  expect(createAppointmentSchema.safeParse({ body: { customerId: id, vehicleId: id, branchName: 'Synthetic', scheduledAt: '2026-11-01T09:00:00Z' } }).success).toBe(true);
  for (const spare of [-1, NaN, Infinity, 0.001, 1e13]) expect(bookingRequestBody.safeParse({ description: 'Noise', spare }).success).toBe(false);
  expect(bookingRequestBody.safeParse({}).success).toBe(false);
  expect(updateAppointmentSchema.safeParse({ params: { id }, body: { bookingStatus: 'CONVERTED' } }).success).toBe(false);
});

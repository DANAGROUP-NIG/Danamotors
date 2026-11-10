jest.mock('../../prisma/client', () => ({
  __esModule: true,
  default: { $transaction: jest.fn() },
}));

import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { BookingCreate, bookingRelations, createBooking } from './booking.persistence';
import { createAppointmentSchema } from './service.validation';

const input: BookingCreate = {
  customerId: 'customer', vehicleId: 'vehicle', branchId: 'branch',
  scheduledAt: new Date('2026-11-01T09:00:00Z'),
  requests: [{ description: 'Synthetic request' }],
};
const transaction = jest.mocked(prisma.$transaction);

beforeEach(() => transaction.mockReset());

it('persists submitted request text as a single plain description', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const { body } = createAppointmentSchema.parse({ body: {
    customerId: id, vehicleId: id, branchName: 'Synthetic',
    scheduledAt: '2026-11-01T09:00:00Z', requests: '  Engine noise\nCheck brakes  ',
  } });
  const rows = await bookingRelations({} as Prisma.TransactionClient, body, id, id);
  expect(rows).toHaveLength(1);
  expect(rows[0].description).toBe('Engine noise\nCheck brakes');
});

it('rejects invalid initial status before acquiring a connection or lock', async () => {
  await expect(createBooking({ ...input, status: 'Completed' })).rejects.toThrow('New bookings');
  expect(transaction).not.toHaveBeenCalled();
});

it('uses the locking read to reject missing vehicles before any subsequent query', async () => {
  const lock = jest.fn().mockResolvedValue([]);
  transaction.mockImplementation(async callback => {
    if (typeof callback !== 'function') throw new Error('Expected interactive transaction');
    return callback({ $queryRaw: lock } as unknown as Prisma.TransactionClient);
  });
  await expect(createBooking(input)).rejects.toThrow('Vehicle not found');
  expect(lock).toHaveBeenCalledTimes(1);
});

it('rejects a duplicate under the vehicle lock before allocating a number or writing', async () => {
  const lock = jest.fn().mockResolvedValue([{ id: input.vehicleId }]);
  const duplicate = jest.fn().mockImplementation(async () => {
    expect(lock).toHaveBeenCalledTimes(1);
    return { id: 'existing-booking' };
  });
  transaction.mockImplementation(async callback => {
    if (typeof callback !== 'function') throw new Error('Expected interactive transaction');
    return callback({
      $queryRaw: lock,
      customer: { findFirst: jest.fn().mockResolvedValue({ id: input.customerId }) },
      branch: { findFirst: jest.fn().mockResolvedValue({ id: input.branchId }) },
      serviceAppointment: { findFirst: duplicate },
    } as unknown as Prisma.TransactionClient);
  });
  await expect(createBooking(input)).rejects.toThrow('already has an active booking');
  expect(duplicate).toHaveBeenCalledTimes(1);
});

it('propagates audit failure from inside the transaction after booking creation', async () => {
  const create = jest.fn().mockResolvedValue({ id: 'booking', bookingNumber: 'branch/2026000001' });
  const audit = jest.fn().mockImplementation(async () => {
    expect(create).toHaveBeenCalledTimes(1);
    throw new Error('Synthetic audit failure');
  });
  transaction.mockImplementation(async callback => {
    if (typeof callback !== 'function') throw new Error('Expected interactive transaction');
    return callback({
      $queryRaw: jest.fn().mockResolvedValue([{ id: input.vehicleId }]),
      customer: { findFirst: jest.fn().mockResolvedValue({ id: input.customerId }) },
      branch: { findFirst: jest.fn().mockResolvedValue({ id: input.branchId }) },
      serviceAppointment: { findFirst: jest.fn().mockResolvedValue(null), create },
      documentSequence: { upsert: jest.fn().mockResolvedValue({ value: 1 }) },
      auditLog: { create: audit },
    } as unknown as Prisma.TransactionClient);
  });
  await expect(createBooking(input)).rejects.toThrow('Synthetic audit failure');
  expect(audit).toHaveBeenCalledTimes(1);
});

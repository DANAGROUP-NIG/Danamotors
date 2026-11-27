jest.mock('../../prisma/client', () => ({
  __esModule: true,
  default: { $transaction: jest.fn() },
}));

import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { BookingCreate, bookingRelations, createBooking } from './booking.persistence';
import { bookingCustomerFieldsToComplete } from '../../shared/booking-customer-details';
import { scopeJobCard } from './job-card-visibility';
import { createAppointmentSchema } from './service.validation';

const input: BookingCreate = {
  customerId: 'customer', vehicleId: 'vehicle', branchId: 'branch',
  scheduledAt: new Date('2026-11-01T09:00:00Z'),
  requests: [{ description: 'Synthetic request' }],
};
const completeCustomer = {
  id: input.customerId, branchId: input.branchId,
  tin: 'TEST-144', nin: null, email: 'booking@example.test',
  address: 'Synthetic address', postalCode: '100001', phoneNumber: '08012345678',
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

it('uses the vehicle lock to reject missing vehicles before reading related records', async () => {
  const lock = jest.fn().mockResolvedValue([]);
  transaction.mockImplementation(async callback => {
    if (typeof callback !== 'function') throw new Error('Expected interactive transaction');
    return callback({ $queryRaw: lock } as unknown as Prisma.TransactionClient);
  });
  await expect(createBooking(input)).rejects.toThrow('Vehicle not found');
  expect(lock).toHaveBeenCalledTimes(2);
});

it('rejects a duplicate under the vehicle lock before allocating a number or writing', async () => {
  const lock = jest.fn().mockResolvedValue([{ id: input.vehicleId }]);
  const duplicate = jest.fn().mockImplementation(async () => {
    expect(lock).toHaveBeenCalledTimes(2);
    return { id: 'existing-booking' };
  });
  transaction.mockImplementation(async callback => {
    if (typeof callback !== 'function') throw new Error('Expected interactive transaction');
    return callback({
      $queryRaw: lock,
      customer: { findFirst: jest.fn().mockResolvedValue(completeCustomer) },
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
      customer: { findFirst: jest.fn().mockResolvedValue(completeCustomer) },
      branch: { findFirst: jest.fn().mockResolvedValue({ id: input.branchId }) },
      serviceAppointment: { findFirst: jest.fn().mockResolvedValue(null), create },
      documentSequence: { upsert: jest.fn().mockResolvedValue({ value: 1 }) },
      auditLog: { create: audit },
    } as unknown as Prisma.TransactionClient);
  });
  await expect(createBooking(input)).rejects.toThrow('Synthetic audit failure');
  expect(audit).toHaveBeenCalledTimes(1);
});

describe.each(["OnlineBooking", "WalkIn"])("%s customer details", (source) => {
  function mockWrite(customer: object) {
    const update = jest.fn().mockResolvedValue({ id: input.customerId });
    const create = jest.fn().mockResolvedValue({
      id: "booking", bookingNumber: "branch/2026000001", requests: [],
    });
    transaction.mockImplementation(async (callback) => {
      if (typeof callback !== "function") throw new Error("Expected interactive transaction");
      return callback({
        $queryRaw: jest.fn().mockResolvedValue([{ id: input.vehicleId }]),
        customer: { findFirst: jest.fn().mockResolvedValueOnce(customer).mockResolvedValue(null), update },
        branch: { findFirst: jest.fn().mockResolvedValue({ id: input.branchId }) },
        serviceAppointment: { findFirst: jest.fn().mockResolvedValue(null), create },
        documentSequence: { upsert: jest.fn().mockResolvedValue({ value: 1 }) },
        auditLog: { create: jest.fn() },
      } as unknown as Prisma.TransactionClient);
    });
    return { update, create };
  }

  it.each(["tin", "email", "address", "postalCode", "phoneNumber"] as const)(
    "rejects missing %s without writing",
    async (field) => {
      const { create, update } = mockWrite({ ...completeCustomer, [field]: " " });
      await expect(createBooking({ ...input, source })).rejects.toMatchObject({
        statusCode: 400,
        details: { customerDetails: { [field]: expect.any(String) } },
      });
      expect(update).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["nin", "1234567890"], ["nin", "123456789012"], ["nin", "1234567890A"],
    ["email", "bad@"], ["phoneNumber", "+440123456789"],
  ])("rejects an invalid %s", async (field, value) => {
    mockWrite({ ...completeCustomer, [field]: value });
    await expect(createBooking({ ...input, source })).rejects.toMatchObject({
      details: { customerDetails: { [field]: expect.any(String) } },
    });
  });

  it.each([
    { tin: "TEST-144", nin: null },
    { tin: null, nin: "00000000001" },
  ])("accepts a single identifier", async (identity) => {
    const { update, create } = mockWrite({ ...completeCustomer, ...identity });
    await expect(createBooking({ ...input, source })).resolves.toMatchObject({ id: "booking" });
    expect(update).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("completes only missing fields before creating the booking", async () => {
    const stored = { ...completeCustomer, tin: null, postalCode: null, phoneNumber: null };
    expect(bookingCustomerFieldsToComplete(stored)).toEqual(["tin", "nin", "postalCode", "phoneNumber"]);
    const { update, create } = mockWrite(stored);
    const customerDetails = {
      nin: "00000000001", postalCode: " 100001 ", phoneNumber: "+234 (801) 234-5678",
      email: "ignore-existing-field@example.test",
    };
    await createBooking({ ...input, source, customerDetails });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: { nin: "00000000001", postalCode: "100001", phoneNumber: "08012345678" },
    }));
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[0]);
    expect(create.mock.calls[0][0].data).not.toHaveProperty("customerDetails");
  });

  it("returns a field error when a completion email is already in use", async () => {
    const { update, create } = mockWrite({ ...completeCustomer, email: null });
    update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Unique constraint", {
      code: "P2002", clientVersion: "test", meta: { target: ["email"] },
    }));
    await expect(createBooking({ ...input, source, customerDetails: { email: completeCustomer.email } }))
      .rejects.toMatchObject({
        statusCode: 409,
        details: { customerDetails: { email: "This email address already belongs to another customer" } },
      });
    expect(create).not.toHaveBeenCalled();
  });
});

it("only includes job card identifiers with permission to read customer details", () => {
  const card = { customer: { firstName: "Synthetic", tin: "TEST-TIN", nin: "00000000001" } };
  expect(scopeJobCard(card, ["jobcard:read"])).toEqual({ customer: { firstName: "Synthetic" } });
  expect(scopeJobCard(card, ["jobcard:read", "customer:read"])).toEqual(card);
});

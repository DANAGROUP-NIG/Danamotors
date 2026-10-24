import { PrismaClient } from '@prisma/client';
import type { ServiceService } from './service.service';
import type { BookingCreate } from './booking.persistence';
import type { JobCardWorkflowService } from './job-card-workflow.service';

jest.mock('../notification/notification.service', () => ({ NotificationService: jest.fn().mockImplementation(() => ({ notifyRole: jest.fn().mockResolvedValue(undefined), notifyUsers: jest.fn().mockResolvedValue(undefined), createNotification: jest.fn().mockResolvedValue(undefined) })), NOTIFICATION_TYPES: {} }));
jest.setTimeout(60000);
const database = process.env.TEST_DATABASE_URL;
const suite = database ? describe : describe.skip;
suite('booking transactions on disposable localhost', () => {
  let db: PrismaClient;
  let service: ServiceService;
  let createBooking: typeof import('./booking.persistence').createBooking;
  let workflow: JobCardWorkflowService;
  let branchId: string, otherBranchId: string, customerId: string, advisorId: string, teamId: string, bayId: string, typeId: string, modelId: string;
  const run = Date.now().toString();
  let sequence = 0;
  beforeAll(async () => {
    if (!database || !['localhost', '127.0.0.1'].includes(new URL(database).hostname)) throw new Error('Booking tests require disposable localhost');
    process.env.DATABASE_URL = database;
    db = require('../../prisma/client').default;
    service = new (require('./service.service').ServiceService)();
    workflow = new (require('./job-card-workflow.service').JobCardWorkflowService)();
    createBooking = require('./booking.persistence').createBooking;
    branchId = (await db.branch.create({ data: { name: `Booking fixture ${run}` } })).id;
    otherBranchId = (await db.branch.create({ data: { name: `Booking other ${run}` } })).id;
    const role = await db.role.upsert({ where: { name: 'ServiceAdviser' }, update: {}, create: { name: 'ServiceAdviser' } });
    advisorId = (await db.user.create({ data: { firstName: 'Synthetic', lastName: 'Advisor', email: `booking-${run}@example.test`, passwordHash: 'test-fixture-not-a-login-hash', roleId: role.id, branchId } })).id;
    customerId = (await db.customer.create({ data: { firstName: 'Synthetic', lastName: 'Booking', branchId } })).id;
    modelId = (await db.workshopMaster.create({ data: { kind: 'MODEL', code: `BM-${run}`, description: 'Booking model' } })).id;
    teamId = (await db.workshopMaster.create({ data: { kind: 'TEAM', code: `BT-${run}`, description: 'Booking team' } })).id;
    bayId = (await db.workshopMaster.create({ data: { kind: 'BAY', code: `BB-${run}`, description: 'Booking bay' } })).id;
    typeId = (await db.workshopMaster.create({ data: { kind: 'SERVICE_TYPE', code: `BS-${run}`, description: 'Booking service' } })).id;
    await db.serviceTypeModelSetting.create({ data: { serviceTypeId: typeId, modelId, serviceCharge: 0 } });
  });
  afterAll(async () => { await db?.$disconnect(); });
  async function input(extra: Partial<BookingCreate> = {}): Promise<BookingCreate> {
    const vehicleId = (await db.vehicle.create({ data: { vin: `BOOKING-${run}-${++sequence}`, customerId, catalogueId: modelId } })).id;
    return { customerId, vehicleId, branchId, serviceTypeId: typeId, mileage: 100, scheduledAt: new Date(Date.now() + 86400000), createdById: advisorId, ...extra };
  }
  const jobInput = () => ({ bayId, serviceAdvisorId: advisorId, teamId, promisedAt: new Date(Date.now() + 172800000).toISOString(), description: 'Synthetic job', complaints: [{ description: 'Caller complaint' }] });

  it('numbers all creation paths by branch, uses automatic creation time and keeps linked vehicle data', async () => {
    const data = await input();
    const before = Date.now();
    const booking = await service.createAppointment({ ...data, branchName: `Booking fixture ${run}`, scheduledAt: data.scheduledAt.toISOString(), requests: [{ description: 'Noise', spare: 0.1, oil: 0.2, labour: 12.35 }], acFitted: true });
    expect(booking.bookingNumber).toBe(`${branchId}/${new Date().getFullYear()}000001`);
    expect(booking.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(booking.scheduledAt).toEqual(data.scheduledAt);
    const detail = await service.getAppointment(booking.id);
    expect(detail.vehicle.vin).toContain('BOOKING-');
    expect(detail.totals.estimatedTotal).toBe(12.65);
    const other = await createBooking(await input({ branchId: otherBranchId }));
    expect(other.bookingNumber).toBe(`${otherBranchId}/${new Date().getFullYear()}000001`);
    expect((await service.listAppointments({ page: 1, limit: 10, search: booking.bookingNumber! })).appointments[0].totals.estimatedTotal).toBe(12.65);
  });
  it('serializes duplicate creations and rolls back numbering on invalid requests', async () => {
    const data = await input();
    const results = await Promise.allSettled([createBooking(data), createBooking(data)]);
    expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(row => row.status === 'rejected')).toHaveLength(1);
    const key = `BOOKING_${branchId}_${new Date().getFullYear()}`;
    const before = await db.documentSequence.findUniqueOrThrow({ where: { key } });
    await expect(createBooking(await input({ requests: [{ complaintCodeId: '00000000-0000-4000-8000-000000000001' }] }))).rejects.toThrow();
    expect((await db.documentSequence.findUniqueOrThrow({ where: { key } })).value).toBe(before.value);
  });
  it('edits requests with derived totals and does not record booking mileage as actual mileage', async () => {
    const booking = await createBooking(await input());
    const edited = await service.updateAppointment(booking.id, { actorId: advisorId, mileage: 120, acFitted: true, requests: [{ description: 'New request', spare: 10.11, oil: 20.22 }] });
    expect(edited.totals.estimatedTotal).toBe(30.33);
    expect((await db.vehicle.findUniqueOrThrow({ where: { id: booking.vehicleId } })).lastRecordedMileage).toBeNull();
    const cleared = await service.updateAppointment(booking.id, { requests: [], actorId: advisorId });
    expect(cleared.totals.estimatedTotal).toBe(0);
    expect(await db.auditLog.count({ where: { action: 'BOOKING_UPDATED', details: { contains: booking.id } } })).toBe(2);
  });
  it('requires cancellation reason, prevents reopening and allows a new booking after cancellation or no-show', async () => {
    const data = await input();
    const booking = await createBooking(data);
    await expect(service.updateAppointment(booking.id, { status: 'Cancelled' })).rejects.toThrow('reason');
    await service.updateAppointment(booking.id, { bookingStatus: 'CANCELLED', cancelReason: 'Customer requested', actorId: advisorId });
    await expect(service.updateAppointment(booking.id, { bookingStatus: 'BOOKED' })).rejects.toThrow('no longer open');
    await expect(service.convertAppointment(booking.id, jobInput(), advisorId)).rejects.toThrow('no longer open');
    const next = await createBooking(data);
    await service.updateAppointment(next.id, { bookingStatus: 'NO_SHOW', actorId: advisorId });
    expect((await createBooking(data)).bookingStatus).toBe('BOOKED');
    await expect(service.deleteAppointment(booking.id)).rejects.toThrow('Cancel');
  });
  it('accepts only follow-up jobs for the same vehicle and branch', async () => {
    const data = await input();
    const job = await db.jobCard.create({ data: { jobNumber: `BOOK-PREV-${run}-${++sequence}`, branchId, vehicleId: data.vehicleId, customerId, description: 'Earlier job', status: 'COMPLETED' } });
    const booking = await createBooking({ ...data, followUpJobId: job.id });
    expect((await service.getAppointment(booking.id)).followUpJob?.id).toBe(job.id);
    await expect(createBooking(await input({ followUpJobId: job.id }))).rejects.toThrow('Follow-up');
    await expect(service.updateAppointment(booking.id, { followUpJobId: (await db.jobCard.create({ data: { jobNumber: `BOOK-OTHER-${run}-${++sequence}`, branchId: otherBranchId, vehicleId: data.vehicleId, description: 'Wrong branch' } })).id })).rejects.toThrow('Follow-up');
  });
  it('copies customer, vehicle, service and every request; concurrent conversion creates exactly one linked job', async () => {
    const booking = await createBooking(await input({ acFitted: true, requests: [{ description: 'Booking noise', spare: 0.1, oil: 0.2, labour: 12.35 }] }));
    const results = await Promise.allSettled([service.convertAppointment(booking.id, jobInput(), advisorId), service.convertAppointment(booking.id, jobInput(), advisorId)]);
    expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    const linked = await db.jobCard.findMany({ where: { appointmentId: booking.id }, include: { complaints: true } });
    expect(linked).toHaveLength(1);
    expect(linked[0]).toMatchObject({ customerId, vehicleId: booking.vehicleId, serviceTypeId: typeId, acFitted: true, estimatedParts: 0.1, estimatedOil: 0.2, estimatedLabour: 12.35 });
    expect(linked[0].complaints.map(row => row.description)).toEqual(['Booking noise']);
    const detail = await service.getAppointment(booking.id);
    expect(detail.bookingStatus).toBe('CONVERTED');
    expect(detail.jobCards[0].id).toBe(linked[0].id);
    await expect(service.updateAppointment(booking.id, { requests: [] })).rejects.toThrow('no longer open');
    await db.jobCard.update({ where: { id: linked[0].id }, data: { status: 'CANCELLED' } });
    await expect(service.convertAppointment(booking.id, jobInput(), advisorId)).rejects.toThrow('no longer open');
  });
  it('keeps requests optional but requires a complaint before opening a job', async () => {
    const booking = await createBooking(await input());
    const { complaints: _complaints, ...empty } = jobInput();
    await expect(service.convertAppointment(booking.id, empty, advisorId)).rejects.toThrow();
    expect((await service.getAppointment(booking.id)).bookingStatus).toBe('BOOKED');
    expect((await service.convertAppointment(booking.id, jobInput(), advisorId)).appointmentId).toBe(booking.id);
  });
  it('uses the same single conversion guard on the legacy job-opening endpoint and rejects mismatched customer', async () => {
    const booking = await createBooking(await input({ requests: [{ description: 'Saved request', spare: 25 }] }));
    const data = { ...jobInput(), appointmentId: booking.id, branchName: `Booking fixture ${run}`, serviceTypeId: typeId, customerId, vehicleId: booking.vehicleId, mileage: 100, createdById: advisorId };
    const other = await db.customer.create({ data: { firstName: 'Synthetic', lastName: 'Other', branchId } });
    await expect(workflow.open({ ...data, customerId: other.id })).rejects.toThrow('match');
    const card = await workflow.open(data);
    expect(card.estimatedParts).toBe(25);
    expect((await service.getAppointment(booking.id)).bookingStatus).toBe('CONVERTED');
    await expect(workflow.open(data)).rejects.toThrow('no longer open');
  });
  it('rolls conversion back when job validation fails, preserving requests and mileage', async () => {
    const booking = await createBooking(await input({ requests: [{ description: 'Retained request' }] }));
    await expect(service.convertAppointment(booking.id, { ...jobInput(), bayId: teamId }, advisorId)).rejects.toThrow();
    expect(await db.jobCard.count({ where: { appointmentId: booking.id } })).toBe(0);
    expect((await service.getAppointment(booking.id)).bookingStatus).toBe('BOOKED');
    expect((await service.getAppointment(booking.id)).requests).toHaveLength(1);
    expect((await db.vehicle.findUniqueOrThrow({ where: { id: booking.vehicleId } })).lastRecordedMileage).toBeNull();
  });
  it('preserves decreasing-mileage protection at check-in and conversion', async () => {
    const booking = await createBooking(await input());
    await db.vehicle.update({ where: { id: booking.vehicleId }, data: { lastRecordedMileage: 200 } });
    await expect(service.updateAppointment(booking.id, { status: 'Checked In', mileage: 100 })).rejects.toThrow();
    await expect(service.convertAppointment(booking.id, jobInput(), advisorId)).rejects.toThrow();
    expect((await service.getAppointment(booking.id)).bookingStatus).toBe('BOOKED');
    await service.updateAppointment(booking.id, { status: 'Checked In', mileage: 220 });
    expect((await db.vehicle.findUniqueOrThrow({ where: { id: booking.vehicleId } })).lastRecordedMileage).toBe(220);
  });
  it('preserves warranty and campaign acknowledgement before check-in or conversion', async () => {
    const booking = await createBooking(await input({ requests: [{ description: 'Covered fault' }] }));
    const policy = await db.vehicleModel.create({ data: { code: `BP-${run}`, name: `Booking warranty ${run}`, warrantyDays: 365, warrantyKm: 100000 } });
    const vehicle = await db.vehicle.update({ where: { id: booking.vehicleId }, data: { vehicleModelId: policy.id, saleDate: new Date() } });
    const campaign = await db.campaign.create({ data: { code: `BC-${run}`, title: 'Synthetic recall', type: 'RECALL', status: 'ACTIVE', startDate: new Date(Date.now() - 86400000) } });
    await db.campaignVehicle.create({ data: { campaignId: campaign.id, vehicleId: vehicle.id, vin: vehicle.vin } });
    await expect(service.updateAppointment(booking.id, { status: 'Checked In', mileage: 100 })).rejects.toMatchObject({ code: 'WARRANTY_ACK_REQUIRED' });
    await expect(service.convertAppointment(booking.id, jobInput(), advisorId)).rejects.toMatchObject({ code: 'WARRANTY_ACK_REQUIRED' });
    await expect(service.convertAppointment(booking.id, { ...jobInput(), warrantyAcknowledged: true }, advisorId)).rejects.toMatchObject({ code: 'WARRANTY_ACK_REQUIRED' });
    expect((await service.getAppointment(booking.id)).bookingStatus).toBe('BOOKED');
    const card = await service.convertAppointment(booking.id, { ...jobInput(), warrantyAcknowledged: true, acknowledgedCampaignIds: [campaign.id] }, advisorId);
    expect(card.warrantyStatusAtCreation).toBe('ACTIVE');
    expect(card.warrantyAcknowledgedById).toBe(advisorId);
    expect(await db.jobCardCampaign.count({ where: { jobCardId: card.id, campaignId: campaign.id } })).toBe(1);
  });

  it('rolls back the job, link, vehicle mileage and sequence when the conversion audit fails', async () => {
    const booking = await createBooking(await input({ requests: [{ description: 'Audited conversion' }] }));
    await db.$executeRawUnsafe(`CREATE FUNCTION booking_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'BOOKING_CONVERTED' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe('CREATE TRIGGER booking_test_failure BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION booking_test_failure()');
    try {
      await expect(service.convertAppointment(booking.id, jobInput(), advisorId)).rejects.toThrow('Synthetic audit failure');
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER booking_test_failure ON "AuditLog"');
      await db.$executeRawUnsafe('DROP FUNCTION booking_test_failure()');
    }
    expect(await db.jobCard.count({ where: { appointmentId: booking.id } })).toBe(0);
    expect((await service.getAppointment(booking.id)).bookingStatus).toBe('BOOKED');
    expect((await db.vehicle.findUniqueOrThrow({ where: { id: booking.vehicleId } })).lastRecordedMileage).toBeNull();
    expect((await service.convertAppointment(booking.id, jobInput(), advisorId)).appointmentId).toBe(booking.id);
  });

});

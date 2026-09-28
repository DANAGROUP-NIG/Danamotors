jest.mock('../../prisma/client', () => ({ __esModule: true, default: {
  customer: { findUnique: jest.fn() }, vehicle: { findUnique: jest.fn() },
  branch: { findUnique: jest.fn() }, jobCard: { count: jest.fn() },
  serviceAppointment: { findUnique: jest.fn() },
} }));
jest.mock('../notification/notification.service', () => ({ NotificationService: jest.fn().mockImplementation(() => ({ notifyRole: jest.fn() })) }));

import prisma from '../../prisma/client';
import { ServiceRepository } from './service.repository';
import { ServiceService } from './service.service';
import { createJobCardSchema, updateJobCardSchema, listJobCardsSchema } from './service.validation';

const input = { branchName: 'Test', jobNumber: 'JC-TEST', description: 'Repair' };
describe('JobCard workflow', () => {
  beforeEach(() => { jest.restoreAllMocks(); jest.clearAllMocks(); });

  it('inherits the customer and vehicle from an appointment', async () => {
    jest.spyOn(ServiceRepository.prototype, 'findAppointmentById').mockResolvedValue({ customerId: 'customer', vehicleId: 'vehicle', branch: { name: 'Test' } } as any);
    (prisma.customer.findUnique as jest.Mock).mockResolvedValue({ id: 'customer' });
    (prisma.vehicle.findUnique as jest.Mock).mockResolvedValue({ id: 'vehicle', customerId: 'customer' });
    (prisma.branch.findUnique as jest.Mock).mockResolvedValue({ id: 'branch' });
    const create = jest.spyOn(ServiceRepository.prototype, 'createJobCard').mockResolvedValue({ id: 'card' } as any);
    await new ServiceService().createJobCard({ ...input, appointmentId: 'appointment' });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'customer', vehicleId: 'vehicle', branchId: 'branch' }));
  });

  it('rejects appointments from another branch', async () => {
    jest.spyOn(ServiceRepository.prototype, 'findAppointmentById').mockResolvedValue({ branch: { name: 'Other' } } as any);
    await expect(new ServiceService().createJobCard({ ...input, appointmentId: 'appointment' })).rejects.toThrow('branch');
  });

  it('rejects a vehicle belonging to another customer', async () => {
    (prisma.customer.findUnique as jest.Mock).mockResolvedValue({ id: 'customer' });
    (prisma.vehicle.findUnique as jest.Mock).mockResolvedValue({ customerId: 'other' });
    await expect(new ServiceService().createJobCard({ ...input, customerId: 'customer', vehicleId: 'vehicle' })).rejects.toThrow('Vehicle does not belong');
  });

  it('blocks edits to a billed card', async () => {
    jest.spyOn(ServiceRepository.prototype, 'findJobCardById').mockResolvedValue({ billedAt: new Date() } as any);
    const update = jest.spyOn(ServiceRepository.prototype, 'updateJobCard');
    await expect(new ServiceService().updateJobCard('card', { status: 'Open' })).rejects.toThrow('Billed');
    expect(update).not.toHaveBeenCalled();
  });

  it('counts records through the end of the selected day', async () => {
    jest.spyOn(ServiceRepository.prototype, 'listJobCards').mockResolvedValue([]);
    (prisma.jobCard.count as jest.Mock).mockResolvedValue(0);
    await new ServiceService().listJobCards({ dateTo: '2026-09-28' });
    expect(prisma.jobCard.count).toHaveBeenCalledWith({ where: { createdAt: { lte: new Date('2026-09-28T23:59:59.999Z') } } });
  });

  it('rejects invalid pagination and dates', () => {
    for (const query of [{ page: -1 }, { limit: 0 }, { dateFrom: 'bad' }, { dateFrom: '2026-09-29', dateTo: '2026-09-28' }]) {
      expect(listJobCardsSchema.safeParse({ query }).success).toBe(false);
    }
  });

  it('accepts canonical statuses and rejects invalid values and negative estimates', () => {
    expect(createJobCardSchema.safeParse({ body: { ...input, status: 'Open' } }).success).toBe(true);
    expect(createJobCardSchema.safeParse({ body: { ...input, status: 'anything' } }).success).toBe(false);
    expect(createJobCardSchema.safeParse({ body: { ...input, estimatedCost: -1 } }).success).toBe(false);
    expect(updateJobCardSchema.safeParse({ params: { id: '00000000-0000-4000-8000-000000000001' }, body: { description: ' ' } }).success).toBe(false);
  });
});

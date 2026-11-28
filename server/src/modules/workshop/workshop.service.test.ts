jest.mock('../../prisma/client', () => ({ __esModule: true, default: { user: { findUnique: jest.fn() } } }));
jest.mock('../notification/notification.service', () => ({ NotificationService: jest.fn().mockImplementation(() => ({ notifyUsers: jest.fn() })) }));
import prisma from '../../prisma/client';
import { WorkshopRepository } from './workshop.repository';
import { WorkshopService } from './workshop.service';

describe('JobCard workshop actions', () => {
  beforeEach(() => { jest.restoreAllMocks(); jest.clearAllMocks(); });

  it('blocks assignment after billing', async () => {
    jest.spyOn(WorkshopRepository.prototype, 'findJobCardById').mockResolvedValue({ billedAt: new Date() } as any);
    const service = new WorkshopService();
    await expect(service.assignTechnician('card', 'tech')).rejects.toThrow('Billed');
  });

  it('rejects a technician from another branch', async () => {
    jest.spyOn(WorkshopRepository.prototype, 'findJobCardById').mockResolvedValue({ branchId: 'branch' } as any);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ isActive: true, role: { name: 'Technician' }, branchId: 'other' });
    await expect(new WorkshopService().assignTechnician('card', 'tech')).rejects.toThrow('branch');
  });

  it('rejects assignment to non-technicians', async () => {
    jest.spyOn(WorkshopRepository.prototype, 'findJobCardById').mockResolvedValue({ branchId: 'branch' } as any);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ isActive: true, role: { name: 'Admin' }, branchId: 'branch' });
    await expect(new WorkshopService().assignTechnician('card', 'user')).rejects.toThrow('Technician not found');
  });
});

jest.mock('../../prisma/client', () => ({ __esModule: true, default: { user: { findUnique: jest.fn() } } }));
jest.mock('../notification/notification.service', () => ({ NotificationService: jest.fn().mockImplementation(() => ({ notifyUsers: jest.fn() })) }));
import prisma from '../../prisma/client';
import { WorkshopRepository } from './workshop.repository';
import { WorkshopService } from './workshop.service';
import { ServiceService } from '../service/service.service';

describe('JobCard workshop actions', () => {
  beforeEach(() => { jest.restoreAllMocks(); jest.clearAllMocks(); });

  it('routes legacy status actions through the audited lifecycle', async () => {
    jest.spyOn(WorkshopRepository.prototype, 'findJobCardById').mockResolvedValue({ id: 'card', billedAt: null } as any);
    const update = jest.spyOn(ServiceService.prototype, 'updateJobCard').mockResolvedValue({ id: 'card' } as any);
    await new WorkshopService().updateProgress('card', 100, 'Ready', 'actor');
    expect(update).toHaveBeenCalledWith('card', { status: 'READY' }, 'actor');
  });

  it('blocks progress, QC and assignment after billing', async () => {
    jest.spyOn(WorkshopRepository.prototype, 'findJobCardById').mockResolvedValue({ billedAt: new Date() } as any);
    const service = new WorkshopService();
    await expect(service.updateProgress('card', 50)).rejects.toThrow('Billed');
    await expect(service.updateQC('card', 'Passed')).rejects.toThrow('Billed');
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

jest.mock('../../prisma/client', () => ({ __esModule: true, default: { $transaction: jest.fn() } }));
jest.mock('./estimate-approval', () => ({ assertApprovedOperation: jest.fn() }));
import prisma from '../../prisma/client';
import { LabourService } from './labour.service';

const branchId = 'branch-1';
const tx = {
  $queryRaw: jest.fn(),
  jobCard: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
  labourItem: { findUnique: jest.fn(), findFirst: jest.fn() },
  employee: { findFirst: jest.fn() },
  user: { findUnique: jest.fn() },
  vehicle: { findUnique: jest.fn() },
  labourRate: { findFirst: jest.fn() },
  jobCardLabour: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
};
const service = new LabourService();
beforeEach(() => {
  jest.clearAllMocks();
  (prisma.$transaction as jest.Mock).mockImplementation(callback => callback(tx));
  tx.jobCard.findUnique.mockResolvedValue({ id: 'job', branchId, status: 'IN_PROGRESS', billedAt: null, vehicleId: null, customerId: 'c' });
  tx.jobCard.findUniqueOrThrow.mockResolvedValue({ branchId });
  tx.labourItem.findUnique.mockResolvedValue({ id: 'lab' });
  tx.labourItem.findFirst.mockResolvedValue({ id: 'lab', description: 'SUSPENSION R&R', rate: 1000, defaultHours: 1 });
  tx.jobCardLabour.findMany.mockResolvedValue([]);
});

it('records the employee mechanic and their login as technician', async () => {
  tx.employee.findFirst.mockResolvedValue({ id: 'emp', branchId, userId: 'user-1' });
  await service.addJobCardLine('job', { labourItemId: 'lab', mechanicId: 'emp' });
  expect(tx.employee.findFirst).toHaveBeenCalledWith({ where: expect.objectContaining({ id: 'emp', OR: expect.any(Array) }) });
  expect(tx.jobCardLabour.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ mechanicId: 'emp', technicianId: 'user-1' }) }));
});

it('rejects a mechanic from another branch or who has left', async () => {
  tx.employee.findFirst.mockResolvedValue({ id: 'emp', branchId: 'other', userId: null });
  await expect(service.addJobCardLine('job', { labourItemId: 'lab', mechanicId: 'emp' })).rejects.toMatchObject({ statusCode: 400 });
  tx.employee.findFirst.mockResolvedValue(null);
  await expect(service.addJobCardLine('job', { labourItemId: 'lab', mechanicId: 'emp' })).rejects.toMatchObject({ statusCode: 404 });
  expect(tx.jobCardLabour.create).not.toHaveBeenCalled();
});

it('keeps a mechanic who has since left when only the hours change', async () => {
  tx.jobCardLabour.findUnique.mockResolvedValue({ id: 'line', jobCardId: 'job', labourItemId: 'lab', hours: 1, rate: 1000, mechanicId: 'emp', technicianId: 'user-1' });
  await service.updateJobCardLine('line', { hours: 2 });
  expect(tx.employee.findFirst).not.toHaveBeenCalled();
  expect(tx.user.findUnique).not.toHaveBeenCalled();
  expect(tx.jobCardLabour.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ mechanicId: 'emp', technicianId: 'user-1', hours: 2 }) }));
});

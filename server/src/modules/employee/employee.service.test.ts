jest.mock('../../prisma/client', () => ({ __esModule: true, default: {
  workshopMaster: { findFirst: jest.fn() },
  employee: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
} }));
import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { EmployeeService } from './employee.service';
import { createEmployeeSchema, updateEmployeeSchema } from './employee.validation';

const branchId = '00000000-0000-4000-8000-000000000001';
const teamId = '00000000-0000-4000-8000-000000000002';
const id = '00000000-0000-4000-8000-000000000003';
const service = new EmployeeService();
beforeEach(() => {
  jest.resetAllMocks();
  (prisma.employee.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.employee.count as jest.Mock).mockResolvedValue(0);
});

it('upper-cases the code and rejects leaving before joining', () => {
  expect(createEmployeeSchema.parse({ body: { code: 'e0007', name: 'A', branchId } }).body.code).toBe('E0007');
  expect(createEmployeeSchema.safeParse({ body: { code: 'E1', name: 'A', branchId, joinDate: '2024-05-01', leftDate: '2024-04-30' } }).success).toBe(false);
});

it('keeps code and branch fixed on update', () => {
  expect(updateEmployeeSchema.safeParse({ params: { id }, body: { code: 'X' } }).success).toBe(false);
  expect(updateEmployeeSchema.safeParse({ params: { id }, body: { branchId } }).success).toBe(false);
});

it('lists only current employees by default', async () => {
  await service.list({ status: 'CURRENT', page: 1, limit: 20 }, branchId);
  const where = (prisma.employee.findMany as jest.Mock).mock.calls[0][0].where;
  expect(where.branchId).toBe(branchId);
  expect(where.AND[0].OR).toEqual([{ leftDate: null }, { leftDate: { gt: expect.any(Date) } }]);
});

it('requires the team to be an active TEAM master', async () => {
  (prisma.workshopMaster.findFirst as jest.Mock).mockResolvedValue(null);
  await expect(service.create({ code: 'E1', name: 'A', branchId, teamId })).rejects.toMatchObject({ statusCode: 400 });
  expect(prisma.workshopMaster.findFirst).toHaveBeenCalledWith({ where: { id: teamId, kind: 'TEAM', active: true } });
});

it('checks a new left date against the stored join date', async () => {
  (prisma.employee.findUnique as jest.Mock).mockResolvedValue({ id, branchId, joinDate: new Date('2024-05-01'), leftDate: null });
  await expect(service.update(id, { leftDate: new Date('2024-01-01') })).rejects.toMatchObject({ statusCode: 400 });
  expect(prisma.employee.update).not.toHaveBeenCalled();
});

it('explains duplicate codes and logins', async () => {
  (prisma.employee.create as jest.Mock).mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '6', meta: { target: ['userId'] } }));
  await expect(service.create({ code: 'E1', name: 'A', branchId })).rejects.toMatchObject({ statusCode: 409, message: 'That login is already linked to another employee' });
});

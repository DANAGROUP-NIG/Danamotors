import prisma from '../../prisma/client';
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES } from '../../shared/constants/roles';
import { listMultiJobVehicles, multiJobBranch, multiJobVehicleWhere, multiJobVehiclesQuery } from './multi-job-vehicles';

jest.mock('../../prisma/client', () => ({ __esModule: true, default: { $transaction: jest.fn() } }));

const branchId = '123e4567-e89b-42d3-a456-426614174000';
const otherBranch = '123e4567-e89b-42d3-a456-426614174001';

describe('Multi-job vehicle scope', () => {
  it('grants discovery to the three agreed roles', () => {
    const rolesWithAccess = Object.entries(ROLE_PERMISSIONS)
      .filter(([, permissions]) => permissions.includes(PERMISSIONS.JOBCARD_MULTI_VEHICLE_READ))
      .map(([role]) => role);
    expect(rolesWithAccess).toEqual(expect.arrayContaining([ROLES.BILLING_OFFICER, ROLES.SERVICE_MANAGER, ROLES.WORKSHOP_MANAGER]));
    expect(rolesWithAccess).not.toContain(ROLES.ENGINEER);
  });

  it('blocks a branch override and lets branch-all staff select a branch', () => {
    const user = { branchId, permissions: [], role: ROLES.BILLING_OFFICER, userId: 'actor', email: 'actor@example.invalid' };
    expect(multiJobBranch(user)).toBe(branchId);
    expect(() => multiJobBranch(user, otherBranch)).toThrow('Choose a branch you can access');
    expect(() => multiJobBranch({ ...user, branchId: undefined })).toThrow('Choose a branch you can access');
    expect(multiJobBranch({ ...user, permissions: [PERMISSIONS.BRANCH_ALL] }, otherBranch)).toBe(otherBranch);
  });

  it('validates the complete range and uses inclusive Lagos business dates', () => {
    expect(multiJobVehiclesQuery.safeParse({ closedFrom: '2026-11-20' }).success).toBe(false);
    expect(multiJobVehiclesQuery.safeParse({ closedFrom: '2026-11-20', closedTo: '2026-11-19' }).success).toBe(false);
    expect(multiJobVehiclesQuery.safeParse({ closedFrom: '2025-11-20', closedTo: '2026-11-22' }).success).toBe(false);
    const query = multiJobVehiclesQuery.parse({ closedFrom: '2026-11-20', closedTo: '2026-11-20' });
    const filter = multiJobVehicleWhere(query, branchId);
    expect(filter.branchId).toBe(branchId);
    expect(filter.OR?.[1]?.deliveredAt).toEqual({
      gte: new Date('2026-11-19T23:00:00.000Z'),
      lt: new Date('2026-11-20T23:00:00.000Z'),
    });
  });
});

describe('Multi-job vehicle pagination', () => {
  it('scopes grouping and detail reads and returns visible job links and payers', async () => {
    const vehicle = { id: 'vehicle-a', registrationNumber: 'TEST-01', vin: 'TESTVIN' };
    const card = {
      vehicle, vehicleId: vehicle.id, jobNumber: 'JOB-1', createdAt: new Date('2026-11-20T08:00:00Z'), status: 'OPEN',
      branch: { name: 'Test branch' }, customer: { companyName: 'Test party' }, appointment: null,
      service: null, serviceType: { description: 'General repair', chargedTo: 'CUSTOMER' },
    };
    const tx = {
      jobCard: {
        groupBy: jest.fn().mockResolvedValue([{ vehicleId: vehicle.id }, { vehicleId: 'vehicle-b' }]),
        findMany: jest.fn().mockResolvedValue([{ ...card, id: 'job-a' }, { ...card, id: 'job-b', jobNumber: 'JOB-2' }]),
      },
      jobCardLine: { groupBy: jest.fn().mockResolvedValue([{ jobCardId: 'job-b', chargeType: 'WARRANTY' }]) },
    };
    jest.mocked(prisma.$transaction).mockImplementation(work => Reflect.apply(work, undefined, [tx]));

    const result = await listMultiJobVehicles({ limit: 1 }, branchId);
    expect(tx.jobCard.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ branchId, billedAt: null, deliveredAt: null }),
      having: { vehicleId: { _count: { gt: 1 } } },
      take: 2,
    }));
    expect(tx.jobCard.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ branchId, billedAt: null, vehicleId: { in: [vehicle.id] } }),
    }));
    expect(tx.jobCardLine.groupBy).toHaveBeenCalledTimes(1);
    expect(result.nextCursor).toBe(vehicle.id);
    expect(result.vehicles[0].jobs).toMatchObject([
      { id: 'job-a', payers: ['CUSTOMER'] },
      { id: 'job-b', payers: ['WARRANTY'] },
    ]);
  });
});

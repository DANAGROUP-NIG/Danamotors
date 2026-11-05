const tx = {
  user: { update: jest.fn(async ({ data }: { data: object }) => ({ id: 'target', passwordHash: 'h', resetTokenHash: null, resetTokenExpiry: null, ...data })) },
  auditLog: { create: jest.fn() },
};

jest.mock('../../prisma/client', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn() },
    role: { findUnique: jest.fn() },
    branch: { findUnique: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn((work: (client: unknown) => unknown) => work(tx)),
  },
}));

import prisma from '../../prisma/client';
import { AdminService, assertCanChangeUser } from './admin.service';
import { ROLES } from '../../shared/constants/roles';

const superAdmin = { userId: 'sa', role: ROLES.SUPER_ADMIN, branchId: 'branch-a' };
const admin = { userId: 'ad', role: ROLES.ADMIN, branchId: 'branch-a' };
const target = (role: string, id = 'target') => ({ id, branchId: 'branch-a', role: { name: role } });

describe('Who may change a user', () => {
  it('a super admin may change anyone else, including their role and branch', () => {
    expect(() => assertCanChangeUser(superAdmin, target(ROLES.ADMIN), { roleName: ROLES.SUPER_ADMIN, branchId: 'branch-b' })).not.toThrow();
  });

  it('an admin may change own-branch staff', () => {
    expect(() => assertCanChangeUser(admin, target(ROLES.TECHNICIAN), { roleName: ROLES.SERVICE_ADVISOR, isActive: false })).not.toThrow();
  });

  it.each([
    ['change an admin', target(ROLES.ADMIN), {}, 'Only a super admin can change an administrator'],
    ['change a super admin', target(ROLES.SUPER_ADMIN), {}, 'Only a super admin can change an administrator'],
    ['give the SuperAdmin role', target(ROLES.TECHNICIAN), { roleName: ROLES.SUPER_ADMIN }, 'Only a super admin can give'],
    ['give the Admin role', target(ROLES.TECHNICIAN), { roleName: ROLES.ADMIN }, 'Only a super admin can give'],
    ['move a user to another branch', target(ROLES.TECHNICIAN), { branchId: 'branch-b' }, 'Only a super admin can move'],
  ])('an admin may not %s', (_label, who, change, message) => {
    expect(() => assertCanChangeUser(admin, who, change)).toThrow(message);
  });

  it('an admin may not promote themselves', () => {
    expect(() => assertCanChangeUser(admin, target(ROLES.ADMIN, 'ad'), { roleName: ROLES.SUPER_ADMIN })).toThrow();
  });

  it.each([
    ['deactivate', { isActive: false }],
    ['delete', { delete: true }],
    ['re-role', { roleName: ROLES.TECHNICIAN }],
  ])('nobody may %s their own account', (_label, change) => {
    expect(() => assertCanChangeUser(superAdmin, target(ROLES.SUPER_ADMIN, 'sa'), change)).toThrow('own');
  });
});

describe('Moving a user to another branch', () => {
  beforeEach(() => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'target', email: 'tech@example.test', firstName: 'Ada', lastName: 'Obi', phoneNumber: null, isActive: true,
      roleId: 'role-tech', branchId: 'branch-a', branch: { id: 'branch-a', name: 'Main Branch' }, role: { name: ROLES.TECHNICIAN, permissions: [] },
    });
  });

  it('moves the user and records the old and new branch', async () => {
    (prisma.branch.findUnique as jest.Mock).mockResolvedValue({ id: 'branch-b', name: 'Abuja', isActive: true });
    await new AdminService().updateUser(superAdmin, 'target', { branchId: 'branch-b' });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'target' }, data: { branchId: 'branch-b' } });
    const details = JSON.parse(tx.auditLog.create.mock.calls[0][0].data.details);
    expect(details.changes.branch).toEqual({ from: 'Main Branch', to: 'Abuja' });
    expect(tx.auditLog.create.mock.calls[0][0].data.action).toBe('USER_UPDATED');
  });

  it('refuses an inactive or unknown branch', async () => {
    (prisma.branch.findUnique as jest.Mock).mockResolvedValue({ id: 'branch-b', name: 'Closed', isActive: false });
    await expect(new AdminService().updateUser(superAdmin, 'target', { branchId: 'branch-b' })).rejects.toThrow('inactive');
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('refuses a branch move by an admin', async () => {
    (prisma.branch.findUnique as jest.Mock).mockResolvedValue({ id: 'branch-b', name: 'Abuja', isActive: true });
    await expect(new AdminService().updateUser(admin, 'target', { branchId: 'branch-b' })).rejects.toThrow('Only a super admin can move');
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});

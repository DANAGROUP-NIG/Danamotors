jest.mock('../../prisma/client', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn(), update: jest.fn((args: unknown) => ({ op: 'user.update', args })) },
    refreshToken: { deleteMany: jest.fn((args: unknown) => ({ op: 'refreshToken.deleteMany', args })) },
    auditLog: { create: jest.fn((args: unknown) => ({ op: 'auditLog.create', args })) },
    $transaction: jest.fn(async (ops: unknown[]) => ops),
  },
}));

import bcrypt from 'bcryptjs';
import prisma from '../../prisma/client';
import { AdminService, assertCanResetPassword } from './admin.service';
import { ROLES } from '../../shared/constants/roles';

const BRANCH = 'branch-a';
const OTHER_BRANCH = 'branch-b';
const superAdmin = { userId: 'sa', role: ROLES.SUPER_ADMIN, branchId: BRANCH };
const admin = { userId: 'ad', role: ROLES.ADMIN, branchId: BRANCH };
const user = (role: string, branchId: string | null = BRANCH, id = 'target') => ({ id, branchId, role: { name: role } });

describe('Who may reset a password', () => {
  it.each([
    ['another super admin', user(ROLES.SUPER_ADMIN)],
    ['an admin', user(ROLES.ADMIN)],
    ['staff in another branch', user(ROLES.TECHNICIAN, OTHER_BRANCH)],
    ['staff with no branch', user(ROLES.TECHNICIAN, null)],
  ])('a super admin may reset %s', (_label, target) => {
    expect(() => assertCanResetPassword(superAdmin, target)).not.toThrow();
  });

  it('an admin may reset staff of their own branch', () => {
    expect(() => assertCanResetPassword(admin, user(ROLES.TECHNICIAN))).not.toThrow();
  });

  it.each([
    ['a super admin', user(ROLES.SUPER_ADMIN), "Only a super admin can reset an administrator's password"],
    ['another admin', user(ROLES.ADMIN), "Only a super admin can reset an administrator's password"],
    ['staff of another branch', user(ROLES.TECHNICIAN, OTHER_BRANCH), 'You can only reset passwords of users in your branch'],
    ['staff with no branch', user(ROLES.TECHNICIAN, null), 'You can only reset passwords of users in your branch'],
  ])('an admin may not reset %s', (_label, target, message) => {
    expect(() => assertCanResetPassword(admin, target)).toThrow(message);
  });

  it('nobody resets their own password here', () => {
    expect(() => assertCanResetPassword(superAdmin, user(ROLES.SUPER_ADMIN, BRANCH, 'sa'))).toThrow('profile');
  });

  it('other roles may not reset passwords', () => {
    expect(() => assertCanResetPassword({ userId: 'x', role: ROLES.SERVICE_MANAGER, branchId: BRANCH }, user(ROLES.TECHNICIAN))).toThrow('Only an administrator');
  });
});

describe('Resetting a password', () => {
  beforeEach(() => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'target', email: 'tech@example.test', branchId: BRANCH, role: { name: ROLES.TECHNICIAN, permissions: [] } });
  });

  it('sets the new password, clears any reset token, signs the user out and audits without the password', async () => {
    await new AdminService().resetUserPassword(superAdmin, 'target', 'n3w-secret');

    const [ops] = (prisma.$transaction as jest.Mock).mock.calls[0];
    const update = ops.find((op: { op: string }) => op.op === 'user.update').args;
    expect(update.where).toEqual({ id: 'target' });
    expect(update.data).toMatchObject({ resetTokenHash: null, resetTokenExpiry: null });
    expect(await bcrypt.compare('n3w-secret', update.data.passwordHash)).toBe(true);

    expect(ops).toContainEqual({ op: 'refreshToken.deleteMany', args: { where: { userId: 'target' } } });

    const audit = ops.find((op: { op: string }) => op.op === 'auditLog.create').args.data;
    expect(audit).toMatchObject({ userId: 'sa', action: 'USER_PASSWORD_RESET' });
    expect(audit.details).not.toContain('n3w-secret');
  });

  it('changes nothing when the reset is not allowed', async () => {
    await expect(new AdminService().resetUserPassword({ ...admin, branchId: OTHER_BRANCH }, 'target', 'n3w-secret')).rejects.toThrow('your branch');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reports a missing user', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(new AdminService().resetUserPassword(superAdmin, 'missing', 'n3w-secret')).rejects.toThrow('User not found');
  });
});

describe('Viewing a user', () => {
  it('includes the branch and never the password hash or a reset token', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'target', email: 'tech@example.test', passwordHash: 'hash', resetTokenHash: 'token-hash', resetTokenExpiry: new Date(),
      branchId: BRANCH, branch: { id: BRANCH, name: 'Main Branch' }, role: { id: 'r', name: ROLES.TECHNICIAN, permissions: [] }, permissionOverrides: [],
    });
    const user = await new AdminService().getUser('target');
    expect((prisma.user.findUnique as jest.Mock).mock.calls[0][0].include.branch).toBeTruthy();
    expect(user.branch).toEqual({ id: BRANCH, name: 'Main Branch' });
    expect(user).not.toHaveProperty('passwordHash');
    expect(user).not.toHaveProperty('resetTokenHash');
    expect(user).not.toHaveProperty('resetTokenExpiry');
    expect(user).not.toHaveProperty('permissionOverrides');
    expect(user.overrides).toEqual([]);
  });
});

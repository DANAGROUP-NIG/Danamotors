const findByEmail = jest.fn();
const createAuditLog = jest.fn();
const notifyRole = jest.fn();

jest.mock('./auth.repository', () => ({
  AuthRepository: jest.fn().mockImplementation(() => ({ findByEmail, createAuditLog })),
}));
jest.mock('../notification/notification.service', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({ notifyRole })),
}));
jest.mock('../../prisma/client', () => ({
  __esModule: true,
  default: { user: { update: jest.fn() }, customerAccount: { update: jest.fn() } },
}));

import prisma from '../../prisma/client';
import { AuthService } from './auth.service';
import { ROLES } from '../../shared/constants/roles';

const staff = (role: string, branchId: string | null = 'branch-a') => ({
  id: 'u1', email: 'tech@example.test', firstName: 'Ada', lastName: 'Obi', isActive: true, branchId, role: { name: role, permissions: [] },
});

describe('Forgot password', () => {
  it('returns nothing and creates no reset token: the link used to be handed to whoever typed the email', async () => {
    findByEmail.mockResolvedValue(staff(ROLES.TECHNICIAN));
    await expect(new AuthService().forgotPassword('tech@example.test')).resolves.toBeUndefined();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.customerAccount.update).not.toHaveBeenCalled();
  });

  it('tells the super admins and the branch admins, linking to the user', async () => {
    findByEmail.mockResolvedValue(staff(ROLES.TECHNICIAN));
    await new AuthService().forgotPassword('tech@example.test');
    expect(notifyRole).toHaveBeenCalledWith(ROLES.SUPER_ADMIN, undefined, expect.objectContaining({ link: '/users/u1' }));
    expect(notifyRole).toHaveBeenCalledWith(ROLES.ADMIN, 'branch-a', expect.objectContaining({ link: '/users/u1' }));
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'PASSWORD_RESET_REQUESTED', userId: 'u1' }));
  });

  it("tells only the super admins about an administrator's request", async () => {
    findByEmail.mockResolvedValue(staff(ROLES.ADMIN));
    await new AuthService().forgotPassword('admin@example.test');
    expect(notifyRole).toHaveBeenCalledTimes(1);
    expect(notifyRole).toHaveBeenCalledWith(ROLES.SUPER_ADMIN, undefined, expect.anything());
  });

  it.each([
    ['an unknown email', null],
    ['a deactivated user', { ...staff(ROLES.TECHNICIAN), isActive: false }],
  ])('does nothing for %s', async (_label, found) => {
    findByEmail.mockResolvedValue(found);
    await expect(new AuthService().forgotPassword('who@example.test')).resolves.toBeUndefined();
    expect(notifyRole).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });
});

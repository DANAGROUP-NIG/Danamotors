const tx = {
  user: { create: jest.fn(async ({ data }: { data: object }) => ({ id: 'new-user', passwordHash: 'h', resetTokenHash: null, resetTokenExpiry: null, ...data })) },
  userPermission: { create: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
  auditLog: { create: jest.fn() },
};

jest.mock('../../prisma/client', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn() },
    role: { findUnique: jest.fn() },
    permission: { findMany: jest.fn() },
    branch: { findUnique: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn((work: (client: unknown) => unknown) => work(tx)),
  },
}));

import { PermissionEffect } from '@prisma/client';
import prisma from '../../prisma/client';
import { AdminService, assertCanChangeUser, assertCanGiveAccess, hasAdminLevelAccess } from './admin.service';
import { AUDITOR_PERMISSIONS, PERMISSIONS, ROLES, ROLE_PERMISSIONS } from '../../shared/constants/roles';
import { effectivePermissions, isAdminLevelPermission } from '../../shared/effectivePermissions';

const superAdmin = { userId: 'sa', role: ROLES.SUPER_ADMIN, branchId: 'branch-a' };
const admin = { userId: 'ad', role: ROLES.ADMIN, branchId: 'branch-a', permissions: ['invoice:cancel', 'customer:read'] };
const links = (...names: string[]) => names.map((name) => ({ permission: { name } }));
type Override = { effect: PermissionEffect; permission: { name: string } };
const grant = (name: string): Override => ({ effect: PermissionEffect.GRANT, permission: { name } });
const deny = (name: string): Override => ({ effect: PermissionEffect.DENY, permission: { name } });

describe('Effective permissions', () => {
  it('are the role plus grants minus denials', () => {
    const user = {
      role: { permissions: links('customer:read', 'customer:delete', 'invoice:read') },
      permissionOverrides: [grant('invoice:cancel'), deny('customer:delete')],
    };
    expect(effectivePermissions(user)).toEqual(['customer:read', 'invoice:cancel', 'invoice:read']);
  });

  it('are the role alone when there are no overrides', () => {
    expect(effectivePermissions({ role: { permissions: links('b:read', 'a:read') } })).toEqual(['a:read', 'b:read']);
  });
});

describe('Admin-level access', () => {
  it.each(['user:read', 'user:update', 'role:permission:update', 'audit:read', 'branch:all', 'branch:create', 'branch:delete'])(
    '%s is admin-level', (name) => expect(isAdminLevelPermission(name)).toBe(true));

  it.each(['branch:read', 'customer:delete', 'invoice:cancel', 'inventory:cross-branch', 'report:management-information'])(
    '%s is not admin-level', (name) => expect(isAdminLevelPermission(name)).toBe(false));

  it('covers the Admin and Auditor roles and admin-level grants, not operational roles with branch:all', () => {
    const user = (name: string, perms: string[], overrides: Override[] = []) =>
      ({ id: 'u', branchId: 'branch-a', role: { name, permissions: links(...perms) }, permissionOverrides: overrides });
    expect(hasAdminLevelAccess(user(ROLES.ADMIN, []))).toBe(true);
    expect(hasAdminLevelAccess(user(ROLES.AUDITOR, ROLE_PERMISSIONS[ROLES.AUDITOR]))).toBe(true);
    expect(hasAdminLevelAccess(user(ROLES.TECHNICIAN, [], [grant('branch:all')]))).toBe(true);
    expect(hasAdminLevelAccess(user(ROLES.SERVICE_MANAGER, ROLE_PERMISSIONS[ROLES.SERVICE_MANAGER]))).toBe(false);
    expect(hasAdminLevelAccess(user(ROLES.TECHNICIAN, [], [grant('invoice:read'), deny('user:read')]))).toBe(false);
  });
});

describe('Who may give access', () => {
  const target = (overrides: Override[] = [], id = 'target') =>
    ({ id, branchId: 'branch-a', role: { name: ROLES.TECHNICIAN, permissions: links('jobcard:read') }, permissionOverrides: overrides });

  it('an admin may grant and deny ordinary permissions to own-branch staff', () => {
    expect(() => assertCanChangeUser(admin, target(), { access: true, grants: ['invoice:cancel'] })).not.toThrow();
  });

  it.each(['user:update', 'role:update', 'audit:read', 'branch:all'])('an admin may not grant %s', (name) => {
    expect(() => assertCanChangeUser(admin, target(), { access: true, grants: [name] })).toThrow('Only a super admin can grant admin-level permissions');
  });

  it('an admin may grant only permissions they hold', () => {
    expect(() => assertCanChangeUser(admin, target(), { access: true, grants: ['tally:post'] })).toThrow('only grant permissions you have yourself: tally:post');
  });

  it('a super admin may grant admin-level permissions', () => {
    expect(() => assertCanChangeUser(superAdmin, target(), { access: true, grants: ['audit:read', 'branch:all'] })).not.toThrow();
  });

  it('an admin may not change a user a super admin gave admin-level access', () => {
    expect(() => assertCanChangeUser(admin, target([grant('audit:read')]), { isActive: false })).toThrow('admin-level access');
  });

  it('an admin may not give the Auditor role, which reads the audit log', () => {
    expect(() => assertCanChangeUser(admin, target(), { roleName: ROLES.AUDITOR, rolePermissions: AUDITOR_PERMISSIONS }))
      .toThrow('Only a super admin can give a role with admin-level access');
  });

  it('an admin may still give an operational role that carries branch:all', () => {
    expect(() => assertCanChangeUser(admin, target(), { roleName: ROLES.SERVICE_MANAGER, rolePermissions: ROLE_PERMISSIONS[ROLES.SERVICE_MANAGER] }))
      .not.toThrow();
  });

  it('nobody changes their own access, not even a super admin', () => {
    expect(() => assertCanChangeUser(superAdmin, target([], 'sa'), { access: true })).toThrow('own access');
    expect(() => assertCanChangeUser(admin, target([], 'ad'), { access: true, grants: ['invoice:cancel'] })).toThrow('own access');
  });

  it('an admin may not create a user with an admin role', () => {
    expect(() => assertCanGiveAccess(admin, { roleName: ROLES.SUPER_ADMIN })).toThrow('Only a super admin');
    expect(() => assertCanGiveAccess(admin, { roleName: ROLES.TECHNICIAN, rolePermissions: [] })).not.toThrow();
  });
});

describe('The Auditor role', () => {
  it('reads everything and writes nothing', () => {
    expect(AUDITOR_PERMISSIONS).toEqual(expect.arrayContaining([
      PERMISSIONS.AUDIT_READ, PERMISSIONS.INVOICE_READ, PERMISSIONS.STOCK_READ, PERMISSIONS.SPAREPART_COST_READ,
      PERMISSIONS.MANAGEMENT_INFORMATION_READ, PERMISSIONS.PARTY_LEDGER_READ, PERMISSIONS.FINANCE_REPORT_READ,
    ]));
    for (const name of AUDITOR_PERMISSIONS) expect(name.endsWith(':read') || name.startsWith('report:')).toBe(true);
    expect(AUDITOR_PERMISSIONS).not.toContain(PERMISSIONS.REPORT_SETTINGS);
    expect(AUDITOR_PERMISSIONS.filter((name) => /:(create|update|delete|cancel|manage|approve|post)$/.test(name))).toEqual([]);
    expect(ROLE_PERMISSIONS[ROLES.AUDITOR]).toBe(AUDITOR_PERMISSIONS);
  });
});

describe('Setting a user\'s overrides', () => {
  const technician = (overrides: object[] = []) => ({
    id: 'target', email: 'tech@example.test', firstName: 'Ada', lastName: 'Obi', phoneNumber: null, isActive: true,
    passwordHash: 'h', resetTokenHash: null, resetTokenExpiry: null,
    roleId: 'role-tech', branchId: 'branch-a', branch: { id: 'branch-a', name: 'Main Branch' },
    role: { id: 'role-tech', name: ROLES.TECHNICIAN, permissions: links('jobcard:read', 'customer:read') },
    permissionOverrides: overrides,
  });
  const permissionRows = [
    { id: 'p-cancel', name: 'invoice:cancel' }, { id: 'p-cust', name: 'customer:read' },
    { id: 'p-audit', name: 'audit:read' }, { id: 'p-job', name: 'jobcard:read' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.permission.findMany as jest.Mock).mockImplementation(async ({ where }: { where: { name: { in: string[] } } }) =>
      permissionRows.filter((p) => where.name.in.includes(p.name)));
  });

  it('writes only what changed and records one event', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(technician([
      { permissionId: 'p-job', effect: PermissionEffect.DENY, permission: { name: 'jobcard:read' } },
    ]));
    await new AdminService().setUserPermissions(admin, 'target', { grants: ['invoice:cancel'], denies: ['customer:read'] });
    expect(tx.userPermission.deleteMany).toHaveBeenCalledWith({ where: { userId: 'target', permissionId: { in: ['p-job'] } } });
    expect(tx.userPermission.create.mock.calls.map((c) => c[0].data)).toEqual([
      { userId: 'target', permissionId: 'p-cancel', effect: PermissionEffect.GRANT },
      { userId: 'target', permissionId: 'p-cust', effect: PermissionEffect.DENY },
    ]);
    const event = tx.auditLog.create.mock.calls[0][0].data;
    expect(event.action).toBe('USER_PERMISSIONS_UPDATED');
    expect(JSON.parse(event.details)).toMatchObject({ granted: ['invoice:cancel'], denied: ['customer:read'], undenied: ['jobcard:read'], ungranted: [] });
  });

  it('refuses a grant the role already has and a denial of a permission it lacks', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(technician());
    await expect(new AdminService().setUserPermissions(superAdmin, 'target', { grants: ['customer:read'], denies: [] })).rejects.toThrow('already has');
    await expect(new AdminService().setUserPermissions(superAdmin, 'target', { grants: [], denies: ['invoice:cancel'] })).rejects.toThrow('does not have');
    expect(tx.userPermission.create).not.toHaveBeenCalled();
  });

  it('refuses an admin-level grant by an admin before writing anything', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(technician());
    await expect(new AdminService().setUserPermissions(admin, 'target', { grants: ['audit:read'], denies: [] })).rejects.toThrow('admin-level');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('copies role and overrides from another user on create', async () => {
    const source = { ...technician([{ permissionId: 'p-cancel', effect: PermissionEffect.GRANT, permission: { name: 'invoice:cancel' } }]), id: 'source', email: 'src@example.test' };
    (prisma.user.findUnique as jest.Mock).mockImplementation(async ({ where }: { where: { id?: string; email?: string; name?: string } }) =>
      where.email ? null : where.id === 'source' ? source : null);
    (prisma.branch as unknown as { findUnique: jest.Mock }).findUnique.mockResolvedValue({ id: 'branch-a', name: 'Main Branch' });
    await new AdminService().createUser(admin, {
      email: 'new@example.test', passwordHash: 'secret1', firstName: 'New', lastName: 'User', copyFromUserId: 'source', branchName: 'Main Branch',
    });
    expect(tx.user.create.mock.calls[0][0].data).toMatchObject({ roleId: 'role-tech', branchId: 'branch-a' });
    expect(tx.userPermission.create).toHaveBeenCalledWith({ data: { userId: 'new-user', permissionId: 'p-cancel', effect: PermissionEffect.GRANT } });
    expect(tx.auditLog.create.mock.calls[0][0].data.action).toBe('USER_ACCESS_COPIED');
  });

  it('refuses to copy from a user of another branch unless super admin', async () => {
    (prisma.user.findUnique as jest.Mock).mockImplementation(async ({ where }: { where: { id?: string; email?: string } }) =>
      where.email ? null : { ...technician(), id: 'source', branchId: 'branch-b' });
    await expect(new AdminService().createUser(admin, {
      email: 'new@example.test', passwordHash: 'secret1', firstName: 'New', lastName: 'User', copyFromUserId: 'source', branchName: 'Main Branch',
    })).rejects.toThrow('in your branch');
  });
});

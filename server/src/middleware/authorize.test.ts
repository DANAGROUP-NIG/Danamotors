import { Request, Response } from 'express';
import { assertBranchOwnership, assertInventoryBranchAccess, canAccessAllBranches, requirePermission } from './authorize';
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES } from '../shared/constants/roles';

const request = (role: string, permissions: string[] = [], branchId: string | null = 'home') => ({
  user: { userId: 'staff', email: 'staff@example.test', role, permissions, branchId },
} as Request);

describe('branch authorization', () => {
  it.each(Object.values(ROLES))('%s follows permissions rather than its name', role => {
    const req = request(role);
    if (role === ROLES.SUPER_ADMIN) {
      expect(() => assertBranchOwnership(req, 'other')).not.toThrow();
    } else {
      expect(() => assertBranchOwnership(req, 'other')).toThrow(expect.objectContaining({ statusCode: 403 }));
    }
    req.user!.permissions = [PERMISSIONS.BRANCH_ALL];
    expect(canAccessAllBranches(req.user)).toBe(true);
    expect(() => assertBranchOwnership(req, 'other')).not.toThrow();
  });

  it('allows home records and rejects branchless or unauthenticated users', () => {
    expect(() => assertBranchOwnership(request('Custom'), 'home')).not.toThrow();
    expect(() => assertBranchOwnership(request('Custom', [], null), 'other')).toThrow(expect.objectContaining({ statusCode: 403 }));
    expect(() => assertBranchOwnership({} as Request, 'other')).toThrow(expect.objectContaining({ statusCode: 401 }));
    expect(canAccessAllBranches(undefined)).toBe(false);
  });

  it('keeps inventory access independent of branch:all and role names', () => {
    expect(() => assertInventoryBranchAccess(request(ROLES.GENERAL_STORE_MANAGER, [PERMISSIONS.BRANCH_ALL]), ['other'])).toThrow(expect.objectContaining({ statusCode: 403 }));
    expect(() => assertInventoryBranchAccess(request('Custom', [PERMISSIONS.INVENTORY_CROSS_BRANCH]), ['other'])).not.toThrow();
    expect(() => assertInventoryBranchAccess(request(ROLES.SUPER_ADMIN), ['other'])).not.toThrow();
    expect(() => assertInventoryBranchAccess(request(ROLES.BRANCH_STORE_MANAGER), ['home'])).not.toThrow();
    expect(() => assertInventoryBranchAccess(request(ROLES.BRANCH_STORE_MANAGER), ['other'])).toThrow(expect.objectContaining({ statusCode: 403 }));
  });

  it('does not let branch:all bypass a module permission', () => {
    expect(() => requirePermission(PERMISSIONS.JOBCARD_READ)(request('Custom', [PERMISSIONS.BRANCH_ALL]), {} as Response, jest.fn())).toThrow(expect.objectContaining({ statusCode: 403 }));
  });
});

describe('branch grants', () => {
  const granted = [ROLES.SUPER_ADMIN, ROLES.CCU_MANAGER, ROLES.SERVICE_MANAGER, ROLES.WARRANTY_OFFICER, ROLES.WORKSHOP_MANAGER, ROLES.GENERAL_STORE_MANAGER];
  it.each(Object.values(ROLES))('%s has exactly the requested grants', role => {
    expect(ROLE_PERMISSIONS[role].includes(PERMISSIONS.BRANCH_ALL)).toBe(granted.includes(role as typeof granted[number]));
    if (role !== ROLES.SUPER_ADMIN) {
      expect(ROLE_PERMISSIONS[role].includes(PERMISSIONS.INVENTORY_CROSS_BRANCH)).toBe(role === ROLES.GENERAL_STORE_MANAGER);
    }
  });
});

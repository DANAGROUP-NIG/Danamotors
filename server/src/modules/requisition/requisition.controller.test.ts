import { Request } from 'express';
import { requisitionActor } from './requisition.controller';
import { requirePermission } from '../../middleware/authorize';
import { PERMISSIONS, ROLES } from '../../shared/constants/roles';

const request = (permissions: string[], role: string = 'Custom') => ({
  user: { userId: 'actor', branchId: 'branch', role, permissions },
} as unknown as Request);

it('uses branch:all rather than the inventory cross-branch permission', () => {
  expect(requisitionActor(request([PERMISSIONS.INVENTORY_CROSS_BRANCH])).allBranches).toBe(false);
  expect(requisitionActor(request([PERMISSIONS.BRANCH_ALL])).allBranches).toBe(true);
  expect(requisitionActor(request([], ROLES.SUPER_ADMIN))).toMatchObject({ allBranches: true, goodwill: true });
});

it('requires the requisition goodwill grant, not an unrelated warranty permission', () => {
  expect(requisitionActor(request([PERMISSIONS.WARRANTY_UPDATE])).goodwill).toBe(false);
  expect(requisitionActor(request([PERMISSIONS.REQUISITION_GOODWILL])).goodwill).toBe(true);
});

it.each([PERMISSIONS.REQUISITION_READ, PERMISSIONS.REQUISITION_CREATE, PERMISSIONS.REQUISITION_CANCEL])('denies missing action permission %s', permission => {
  const middleware = requirePermission(permission);
  const next = jest.fn();
  const response = {} as Parameters<typeof middleware>[1];
  expect(() => middleware(request([]), response, next)).toThrow('required permissions');
  middleware(request([permission]), response, next);
  expect(next).toHaveBeenCalledTimes(1);
});

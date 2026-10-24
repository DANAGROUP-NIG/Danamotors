import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Request, Response } from 'express';
import { requirePermission } from '../../middleware/authorize';
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES } from './roles';

it.each([PERMISSIONS.ESTIMATE_SIGN, PERMISSIONS.ESTIMATE_REVISE])('allows ServiceAdviser to use %s', (permission) => {
  const request = { user: { role: ROLES.SERVICE_ADVISOR, permissions: ROLE_PERMISSIONS[ROLES.SERVICE_ADVISOR] } } as unknown as Request;
  const next = jest.fn();
  requirePermission(permission)(request, {} as Response, next);
  expect(next).toHaveBeenCalledTimes(1);
});

it('backfills estimate revise grants for the same roles as the seed defaults', () => {
  const sql = readFileSync(resolve(__dirname, '../../../prisma/migrations/20261023110000_estimate_revise_permissions/migration.sql'), 'utf8');
  const grantedRoles = [...sql.matchAll(/\('([^']+)', 'estimate:revise'\)/g)].map(match => match[1]).sort();
  const defaultRoles = Object.entries(ROLE_PERMISSIONS).filter(([, permissions]) => permissions.includes(PERMISSIONS.ESTIMATE_REVISE)).map(([role]) => role).sort();
  expect(grantedRoles).toEqual(defaultRoles);
});

it('backfills estimate sign grants for the same roles as the seed defaults', () => {
  const sql = readFileSync(resolve(__dirname, '../../../prisma/migrations/20261023100000_estimate_sign_permissions/migration.sql'), 'utf8');
  const grantedRoles = [...sql.matchAll(/\('([^']+)', 'estimate:sign'\)/g)].map(match => match[1]).sort();
  const defaultRoles = Object.entries(ROLE_PERMISSIONS).filter(([, permissions]) => permissions.includes(PERMISSIONS.ESTIMATE_SIGN)).map(([role]) => role).sort();
  expect(grantedRoles).toEqual(defaultRoles);
});

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Request, RequestHandler, Response } from 'express';
import router from './service-document.routes';
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES } from '../../shared/constants/roles';

type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: RequestHandler }[] } };
const req = (permissions: string[]) => ({ user: { userId: 'staff', branchId: 'home', role: 'Custom', permissions } } as unknown as Request);
it.each([
  ['get', '/job-cards/:id/remarks', PERMISSIONS.JOBCARD_READ],
  ['get', '/estimates/:id/remarks', PERMISSIONS.ESTIMATE_READ],
  ['put', '/job-cards/:id/remarks', PERMISSIONS.JOBCARD_REMARKS_UPDATE],
  ['put', '/estimates/:id/remarks', PERMISSIONS.JOBCARD_REMARKS_UPDATE],
  ['get', '/job-cards/:id/picking-list/print', PERMISSIONS.JOBCARD_PICKING_LIST_PRINT],
  ['get', '/estimates/:id/picking-list/print', PERMISSIONS.JOBCARD_PICKING_LIST_PRINT],
])('gates %s %s with its specific permission', (method, path, permission) => {
  const handle = (router.stack as Layer[]).find(layer => layer.route?.path === path && layer.route.methods[method])?.route?.stack[0].handle;
  if (!handle) throw new Error('Missing document permission middleware');
  expect(() => handle(req([PERMISSIONS.JOBCARD_UPDATE, PERMISSIONS.ESTIMATE_PRINT]), {} as Response, jest.fn())).toThrow('required permissions');
  const next = jest.fn(); handle(req([permission]), {} as Response, next); expect(next).toHaveBeenCalledTimes(1);
});
it('keeps default grants in the seed-reset source and excludes technician write access', () => {
  expect(ROLE_PERMISSIONS[ROLES.SUPER_ADMIN]).toContain(PERMISSIONS.JOBCARD_REMARKS_UPDATE);
  expect(ROLE_PERMISSIONS[ROLES.ADMIN]).toContain(PERMISSIONS.JOBCARD_PICKING_LIST_PRINT);
  expect(ROLE_PERMISSIONS[ROLES.SERVICE_ADVISOR]).toContain(PERMISSIONS.JOBCARD_REMARKS_UPDATE);
  expect(ROLE_PERMISSIONS[ROLES.BRANCH_STORE_MANAGER]).toContain(PERMISSIONS.JOBCARD_PICKING_LIST_PRINT);
  expect(ROLE_PERMISSIONS[ROLES.TECHNICIAN]).not.toContain(PERMISSIONS.JOBCARD_REMARKS_UPDATE);
});

it('matches additive migration grants to the role defaults used by seed resets', () => {
  const sql = readFileSync(resolve(__dirname, '../../../prisma/migrations/20261021130000_service_document_permissions/migration.sql'), 'utf8');
  const grants = [...sql.matchAll(/\('([^']+)', '(jobcard:(?:remarks:update|picking-list:print))'\)/g)].map(match => `${match[1]}:${match[2]}`).sort();
  const expected = Object.entries(ROLE_PERMISSIONS).flatMap(([role, permissions]) => [PERMISSIONS.JOBCARD_REMARKS_UPDATE, PERMISSIONS.JOBCARD_PICKING_LIST_PRINT].filter(permission => permissions.includes(permission)).map(permission => `${role}:${permission}`)).sort();
  expect(grants).toEqual(expected);
});

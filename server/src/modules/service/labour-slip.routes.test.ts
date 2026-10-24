import { Request, RequestHandler, Response } from 'express';
import router from './labour-slip.routes';
import { labourSlipActor } from './labour-slip.controller';
import { PERMISSIONS } from '../../shared/constants/roles';

type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: RequestHandler }[] } };
const request = (permissions: string[]) => ({ user: { role: 'Custom', branchId: 'home', userId: 'actor', permissions } } as unknown as Request);

it.each([
  ['get', '/labour-slips', PERMISSIONS.JOBCARD_READ],
  ['get', '/labour-slips/:id', PERMISSIONS.JOBCARD_READ],
  ['get', '/labour-slips/:id/print', PERMISSIONS.JOBCARD_READ],
  ['post', '/labour-slips', PERMISSIONS.JOBLABOUR_UPDATE],
  ['post', '/labour-slips/:id/lines', PERMISSIONS.JOBLABOUR_UPDATE],
  ['put', '/labour-slips/:id/lines/:lineId', PERMISSIONS.JOBLABOUR_UPDATE],
])('gates %s %s', (method, path, permission) => {
  const handler = (router.stack as Layer[]).find(layer => layer.route?.path === path && layer.route.methods[method])?.route?.stack[0].handle;
  if (!handler) throw new Error('Missing action permission middleware');
  const next = jest.fn();
  expect(() => handler(request([]), {} as Response, next)).toThrow('required permissions');
  handler(request([permission]), {} as Response, next);
  expect(next).toHaveBeenCalledTimes(1);
});

it('uses warranty goodwill and branch:all permissions independently of stock permissions', () => {
  expect(labourSlipActor(request([PERMISSIONS.REQUISITION_GOODWILL, PERMISSIONS.INVENTORY_CROSS_BRANCH]))).toMatchObject({ goodwill: false, allBranches: false });
  expect(labourSlipActor(request([PERMISSIONS.WARRANTY_UPDATE, PERMISSIONS.BRANCH_ALL]))).toMatchObject({ goodwill: true, allBranches: true });
});

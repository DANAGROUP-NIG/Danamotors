import { Request, RequestHandler, Response } from 'express';
import router from './return-slip.routes';
import { PERMISSIONS } from '../../shared/constants/roles';

type RouteLayer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: RequestHandler }[] } };

it.each([
  ['get', '/return-slips', PERMISSIONS.REQUISITION_READ],
  ['get', '/return-slips/:id', PERMISSIONS.REQUISITION_READ],
  ['get', '/return-slips/:id/print', PERMISSIONS.REQUISITION_READ],
  ['post', '/return-slips', PERMISSIONS.REQUISITION_CREATE],
  ['post', '/return-slips/:id/cancel', PERMISSIONS.REQUISITION_CANCEL],
])('gates %s %s with the required permission', (method, path, permission) => {
  const layer = (router.stack as RouteLayer[]).find(candidate => candidate.route?.path === path && candidate.route.methods[method]);
  const handler = layer?.route?.stack[0].handle;
  expect(handler).toBeDefined();
  if (!handler) throw new Error('Missing action permission middleware');
  const request = (permissions: string[]) => ({ user: { role: 'Custom', permissions } } as unknown as Request);
  const response = {} as Response;
  const next = jest.fn();
  expect(() => handler(request([]), response, next)).toThrow('required permissions');
  handler(request([permission]), response, next);
  expect(next).toHaveBeenCalledTimes(1);
});

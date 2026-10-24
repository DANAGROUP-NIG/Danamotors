import { Request, RequestHandler, Response } from 'express';
import router from './service.routes';
import { ServiceController } from './service.controller';
import { ServiceService } from './service.service';
import { PERMISSIONS } from '../../shared/constants/roles';

type Layer = { route?: { path: string; stack: { handle: RequestHandler }[] } };
const request = (permissions: string[], branchId: string | null = 'home') => ({ user: { userId: 'actor', role: 'Custom', permissions, branchId }, params: { id: 'booking' }, body: {} } as unknown as Request);
it('requires both booking update and job creation permission for conversion', () => {
  const handlers = (router.stack as Layer[]).find(layer => layer.route?.path === '/appointments/:id/convert')?.route?.stack;
  if (!handlers) throw new Error('Missing conversion route');
  for (const [index, permission] of [PERMISSIONS.APPOINTMENT_UPDATE, PERMISSIONS.JOBCARD_CREATE].entries()) {
    const other = index === 0 ? PERMISSIONS.JOBCARD_CREATE : PERMISSIONS.APPOINTMENT_UPDATE;
    expect(() => handlers[index].handle(request([other]), {} as Response, jest.fn())).toThrow('required permissions');
    const next = jest.fn();
    handlers[index].handle(request([permission]), {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
  }
});
it('rejects conversion across branches and branchless accounts before opening a job', async () => {
  const get = jest.spyOn(ServiceService.prototype, 'getAppointment').mockResolvedValue({ branchId: 'other' } as Awaited<ReturnType<ServiceService['getAppointment']>>);
  const convert = jest.spyOn(ServiceService.prototype, 'convertAppointment');
  try {
    for (const branch of ['home', null]) {
      const next = jest.fn();
      await new ServiceController().convertAppointment(request([], branch), {} as Response, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    }
    expect(convert).not.toHaveBeenCalled();
  } finally { get.mockRestore(); convert.mockRestore(); }
});

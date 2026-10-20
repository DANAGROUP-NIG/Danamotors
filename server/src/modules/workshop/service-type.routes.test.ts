import express from 'express';
import { Server } from 'http';
import { AddressInfo } from 'net';

jest.mock('../../middleware/authMiddleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = { userId: 'staff', email: 'staff@example.test', role: req.headers['x-test-role'] as string ?? 'Admin',
      permissions: req.headers['x-test-permission'] === 'none' ? [] : ['jobcard:create'] };
    next();
  },
}));
jest.mock('../../prisma/client', () => ({ __esModule: true, default: {
  workshopMaster: { findMany: jest.fn() }, defectModelEstimate: { findMany: jest.fn() }, $queryRaw: jest.fn(),
} }));
import prisma from '../../prisma/client';
import { ServiceTypeService } from './service-type.service';
import { serviceTypeOptionsRouter, serviceTypeSettingsRouter } from './service-type.routes';
import { BadRequestError } from '../../shared/errors/appError';

const id = '00000000-0000-4000-8000-000000000001';
let server: Server;
let base: string;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/job-cards', serviceTypeOptionsRouter);
  app.use('/service-type-model-settings', serviceTypeSettingsRouter);
  app.use((error: { statusCode?: number; message: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ message: error.message });
  });
  server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

it('returns dated service options in the existing API envelope', async () => {
  const options = jest.spyOn(ServiceTypeService.prototype, 'options').mockResolvedValue({ items: [], reason: 'MODEL_NOT_CONFIGURED', message: 'Vehicle has no model set; update the vehicle first' });
  const response = await fetch(`${base}/job-cards/service-types?vehicleId=${id}&date=2022-04-19`);
  expect(response.status).toBe(200);
  const body = await response.json() as { data: { message: string } };
  expect(body.data.message).toContain('no model');
  expect(options).toHaveBeenCalledWith(id, new Date('2022-04-19T00:00:00Z'));
});
it('rejects invalid dates and missing job-card permissions before querying', async () => {
  const options = jest.spyOn(ServiceTypeService.prototype, 'options');
  expect((await fetch(`${base}/job-cards/service-types?vehicleId=${id}&date=2022-02-30`)).status).toBe(400);
  expect((await fetch(`${base}/job-cards/service-types?vehicleId=${id}`, { headers: { 'x-test-permission': 'none' } })).status).toBe(403);
  expect(options).not.toHaveBeenCalled();
});
it('requires admin for settings mutations', async () => {
  const create = jest.spyOn(ServiceTypeService.prototype, 'createSetting');
  const response = await fetch(`${base}/service-type-model-settings`, { method: 'POST', headers: {
    'content-type': 'application/json', 'x-test-role': 'ServiceAdviser',
  }, body: JSON.stringify({ serviceTypeId: id, modelId: id, serviceCharge: 0 }) });
  expect(response.status).toBe(403);
  expect(create).not.toHaveBeenCalled();
});
it('passes model charges to CRUD and returns validation/service errors as HTTP 400', async () => {
  const create = jest.spyOn(ServiceTypeService.prototype, 'createSetting').mockRejectedValue(new BadRequestError('Select an active service type and workshop model'));
  const response = await fetch(`${base}/service-type-model-settings`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ serviceTypeId: id, modelId: id, serviceCharge: 15100 }) });
  expect(response.status).toBe(400);
  expect(create).toHaveBeenCalledWith({ serviceTypeId: id, modelId: id, serviceCharge: 15100 });
});
it('returns 204 after removing a setting', async () => {
  const remove = jest.spyOn(ServiceTypeService.prototype, 'deleteSetting').mockResolvedValue();
  expect((await fetch(`${base}/service-type-model-settings/${id}`, { method: 'DELETE' })).status).toBe(204);
  expect(remove).toHaveBeenCalledWith(id);
});
it('lists workshop defects for job-card creators, with the vehicle model estimate', async () => {
  const lookup = prisma.workshopMaster.findMany as jest.Mock;
  lookup.mockResolvedValue([{ id, code: 'A000100', description: 'Timing system' }]);
  (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ modelId: 'model' }]);
  (prisma.defectModelEstimate.findMany as jest.Mock).mockResolvedValue([{ defectId: id, partAmount: 42000, oilAmount: 5200, labourAmount: 50000 }]);
  const response = await fetch(`${base}/job-cards/defect-codes?search=timing&limit=20&vehicleId=${id}`);
  expect(response.status).toBe(200);
  expect(lookup).toHaveBeenCalledWith(expect.objectContaining({ take: 20, where: expect.objectContaining({ kind: 'COMPLAINT', active: true }) }));
  const body = await response.json() as { data: { items: { estimate: unknown }[] } };
  expect(body.data.items[0].estimate).toEqual({ partAmount: 42000, oilAmount: 5200, labourAmount: 50000 });
  expect((await fetch(`${base}/job-cards/defect-codes?limit=1000`)).status).toBe(400);
  expect((await fetch(`${base}/job-cards/defect-codes`, { headers: { 'x-test-permission': 'none' } })).status).toBe(403);
  expect(lookup).toHaveBeenCalledTimes(1);
});

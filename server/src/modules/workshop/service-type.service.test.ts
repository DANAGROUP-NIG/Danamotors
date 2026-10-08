jest.mock('../../prisma/client', () => ({ __esModule: true, default: {
  $transaction: jest.fn(),
  workshopMaster: { findMany: jest.fn() },
  serviceTypeModelSetting: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
} }));
import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { ServiceTypeService, effectiveServiceCharge } from './service-type.service';
import { serviceTypeSettingBody, serviceTypeOptionsSchema, updateSettingSchema } from './service-type.validation';

const serviceTypeId = '00000000-0000-4000-8000-000000000001';
const modelId = '00000000-0000-4000-8000-000000000002';
const service = new ServiceTypeService();
beforeEach(() => {
  jest.resetAllMocks();
  (prisma.$transaction as jest.Mock).mockImplementation(callback => callback(prisma));
  (prisma.workshopMaster.findMany as jest.Mock).mockResolvedValue([
    { id: serviceTypeId, kind: 'SERVICE_TYPE', code: 'RG' }, { id: modelId, kind: 'MODEL', code: 'RIO' },
  ]);
});
it('uses the previous charge strictly before the effective instant, including a previous zero', () => {
  const setting = { serviceCharge: 15100, previousCharge: 0, effectiveFrom: new Date('2022-04-20T00:00:00Z') };
  expect(effectiveServiceCharge(setting, new Date('2022-04-19'))).toBe(0);
  expect(effectiveServiceCharge(setting, new Date('2022-04-20'))).toBe(15100);
  expect(effectiveServiceCharge({ ...setting, previousCharge: null }, new Date('2022-04-19'))).toBe(15100);
});
it.each([-1, Infinity, NaN, 0.001, 1e13])('rejects an invalid model charge: %s', serviceCharge => {
  expect(serviceTypeSettingBody.safeParse({ serviceTypeId, modelId, serviceCharge }).success).toBe(false);
});
it('rejects invalid dates and attempts to reassign an existing setting', () => {
  expect(serviceTypeOptionsSchema.safeParse({ query: { vehicleId: modelId, date: '2022-02-30' } }).success).toBe(false);
  expect(updateSettingSchema.safeParse({ params: { id: modelId }, body: { modelId } }).success).toBe(false);
});
it('validates both master kinds in one lookup before creating a setting', async () => {
  await service.createSetting({ serviceTypeId, modelId, serviceCharge: 15100 });
  expect(prisma.workshopMaster.findMany).toHaveBeenCalledTimes(1);
  expect(prisma.serviceTypeModelSetting.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ serviceCharge: 15100 }) }));
});
it('rejects a variant as the setting model', async () => {
  (prisma.workshopMaster.findMany as jest.Mock).mockResolvedValue([
    { id: serviceTypeId, kind: 'SERVICE_TYPE', code: 'RG' }, { id: modelId, kind: 'VARIANT' },
  ]);
  await expect(service.createSetting({ serviceTypeId, modelId, serviceCharge: 0 })).rejects.toMatchObject({ statusCode: 400 });
  expect(prisma.serviceTypeModelSetting.create).not.toHaveBeenCalled();
});
it('returns a useful conflict for duplicate service/model settings', async () => {
  (prisma.serviceTypeModelSetting.create as jest.Mock).mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6' }));
  await expect(service.createSetting({ serviceTypeId, modelId, serviceCharge: 0 })).rejects.toMatchObject({ statusCode: 409 });
});
it('allows deactivating a setting after a referenced master was deactivated', async () => {
  (prisma.serviceTypeModelSetting.findUnique as jest.Mock).mockResolvedValue({ serviceTypeId, modelId });
  await service.updateSetting(modelId, { active: false });
  expect(prisma.workshopMaster.findMany).not.toHaveBeenCalled();
  expect(prisma.serviceTypeModelSetting.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ active: false }) }));
});
it('reports missing settings when removing them', async () => {
  (prisma.serviceTypeModelSetting.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
  await expect(service.deleteSetting(modelId)).rejects.toMatchObject({ statusCode: 404 });
});

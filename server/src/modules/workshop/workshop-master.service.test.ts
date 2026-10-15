jest.mock('../../prisma/client', () => ({ __esModule: true, default: {
  workshopMaster: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  defectModelEstimate: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
} }));
import prisma from '../../prisma/client';
import { WorkshopMasterService } from './workshop-master.service';

const parentId = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
const service = new WorkshopMasterService();
beforeEach(() => {
  jest.resetAllMocks();
  (prisma.workshopMaster.findFirst as jest.Mock).mockResolvedValue({ id: parentId });
});

it('requires the parent kind for a vehicle group', async () => {
  await expect(service.create({ kind: 'VEHICLE_GROUP', code: 'SUS', description: 'SUSPENSION' })).rejects.toMatchObject({ statusCode: 400 });
  await service.create({ kind: 'VEHICLE_GROUP', code: 'SUS', description: 'SUSPENSION', parentId });
  expect(prisma.workshopMaster.findFirst).toHaveBeenCalledWith({ where: { id: parentId, kind: 'VEHICLE_SYSTEM', active: true } });
});

it('allows a city without a state, as in legacy', async () => {
  await service.create({ kind: 'CITY', code: 'ZARI', description: 'ZARIA' });
  expect(prisma.workshopMaster.findFirst).not.toHaveBeenCalled();
  expect(prisma.workshopMaster.create).toHaveBeenCalled();
});

it('validates extra fields against the kind', async () => {
  await service.create({ kind: 'UOM', code: 'LTR', description: 'LITRES', attributes: { decimalAllowed: true } });
  expect(prisma.workshopMaster.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ attributes: { decimalAllowed: true } }) }));
  await expect(service.create({ kind: 'UOM', code: 'X', description: 'X', attributes: { hierarchy: 1 } })).rejects.toMatchObject({ statusCode: 400 });
  await expect(service.create({ kind: 'ZONE', code: 'X', description: 'X', attributes: { any: 1 } })).rejects.toMatchObject({ statusCode: 400 });
});

it('merges extra fields on update', async () => {
  (prisma.workshopMaster.findUnique as jest.Mock).mockResolvedValue({ id, kind: 'DESIGNATION', parentId: null, attributes: { hierarchy: 2, department: 'EXECUTIVE' } });
  await service.update(id, { attributes: { canReceiveVehicle: true } });
  expect(prisma.workshopMaster.update).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ attributes: { hierarchy: 2, department: 'EXECUTIVE', canReceiveVehicle: true } }),
  }));
});

it('lets geography move to another parent but keeps catalogue parents fixed', async () => {
  (prisma.workshopMaster.findUnique as jest.Mock).mockResolvedValue({ id, kind: 'STATE', parentId: null, attributes: null });
  await service.update(id, { parentId });
  expect(prisma.workshopMaster.update).toHaveBeenCalled();
  (prisma.workshopMaster.findUnique as jest.Mock).mockResolvedValue({ id, kind: 'MODEL', parentId: id, attributes: null });
  await expect(service.update(id, { parentId })).rejects.toMatchObject({ statusCode: 400 });
});

it('upserts a defect estimate only for a defect and an active model', async () => {
  const amounts = { partAmount: 42000, oilAmount: 5200, labourAmount: 50000 };
  await service.saveEstimate(id, parentId, amounts);
  expect(prisma.workshopMaster.findFirst).toHaveBeenNthCalledWith(1, { where: { id, kind: 'COMPLAINT' } });
  expect(prisma.workshopMaster.findFirst).toHaveBeenNthCalledWith(2, { where: { id: parentId, kind: 'MODEL', active: true } });
  expect(prisma.defectModelEstimate.upsert).toHaveBeenCalledWith(expect.objectContaining({
    where: { defectId_modelId: { defectId: id, modelId: parentId } }, update: amounts,
  }));
  (prisma.workshopMaster.findFirst as jest.Mock).mockResolvedValueOnce(null);
  await expect(service.saveEstimate(id, parentId, amounts)).rejects.toMatchObject({ statusCode: 404 });
});

it('reports a missing estimate on removal', async () => {
  (prisma.defectModelEstimate.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
  await expect(service.removeEstimate(id, parentId)).rejects.toMatchObject({ statusCode: 404 });
});

import { Prisma } from '@prisma/client';
jest.mock('../../prisma/client', () => ({ __esModule: true, default: { $transaction: jest.fn() } }));
import prisma from '../../prisma/client';
import { VehicleService } from '../vehicle/vehicle.service';
const modelId = '00000000-0000-4000-a000-000000000001';
const generationId = '00000000-0000-4000-a000-000000000002';
const engineId = '00000000-0000-4000-a000-000000000003';
const existing = { id: 'vehicle', modelId, generationId, engineId, customMake: null, customModel: null, pdiDone: false, pdiDate: null };
let tx: ReturnType<typeof database>;
function database() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    customer: { findFirst: jest.fn().mockResolvedValue({ id: modelId }) },
    vehicleOwnership: { create: jest.fn().mockResolvedValue({ id: 'ownership' }) },
    campaignVehicle: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    vehicle: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'vehicle', ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...existing, ...data })),
      findUnique: jest.fn().mockResolvedValue(existing),
    },
    vehicleCatalogModel: { findUnique: jest.fn().mockResolvedValue({ id: modelId, name: 'Rio', make: { name: 'Kia' } }) },
    vehicleCatalogGeneration: { findUnique: jest.fn().mockResolvedValue({ id: generationId, modelId, name: 'RIO' }) },
    vehicleCatalogEngine: { findUnique: jest.fn().mockResolvedValue({ id: engineId, generationId, label: '1.4L' }) },
  };
}
beforeEach(() => {
  tx = database();
  (prisma.$transaction as jest.Mock).mockImplementation((callback: (transaction: Prisma.TransactionClient) => unknown) => callback(tx as unknown as Prisma.TransactionClient));
});
it('creates catalog and custom vehicles through the application service', async () => {
  const service = new VehicleService();
  expect(await service.createVehicle({ vin: 'CATALOG', modelId, generationId, engineId })).toMatchObject({ modelId, model: 'Rio', make: 'Kia', engineId });
  expect(await service.createVehicle({ vin: 'CUSTOM', customModel: '  My   model ', customMake: ' Other ' })).toMatchObject({ modelId: null, model: 'My model', customModel: 'My model', customMake: 'Other' });
});
it('rejects empty models before vehicle insertion', async () => {
  await expect(new VehicleService().createVehicle({ vin: 'EMPTY', customModel: ' ' })).rejects.toThrow();
  expect(tx.vehicle.create).not.toHaveBeenCalled();
});
it('preserves legacy catalogue links when editing only vehicle metadata', async () => {
  tx.vehicle.findUnique.mockResolvedValue({ ...existing, modelId: null, generationId: null, engineId: null, catalogueId: 'legacy', colourId: 'colour', customModel: 'Legacy model' });
  await new VehicleService().updateVehicle('vehicle', { registrationNumber: 'LAG123' });
  expect(tx.vehicle.update.mock.calls[0][0].data).not.toHaveProperty('catalogueId');
  expect(tx.vehicle.update.mock.calls[0][0].data).not.toHaveProperty('modelId');
  expect(tx.vehicleCatalogModel.findUnique).not.toHaveBeenCalled();
});
it('clears dependent engine selection when clearing the generation', async () => {
  expect(await new VehicleService().updateVehicle('vehicle', { generationId: null })).toMatchObject({ modelId, generationId: null, engineId: null });
});
it('clears catalog hierarchy when changing to a custom model', async () => {
  expect(await new VehicleService().updateVehicle('vehicle', { customModel: 'Replacement' })).toMatchObject({ modelId: null, generationId: null, engineId: null, customModel: 'Replacement' });
});
it('rejects mismatched engine updates without writing', async () => {
  tx.vehicleCatalogEngine.findUnique.mockResolvedValue({ id: engineId, generationId: 'other' });
  await expect(new VehicleService().updateVehicle('vehicle', { engineId })).rejects.toThrow('Engine does not belong');
  expect(tx.vehicle.update).not.toHaveBeenCalled();
});

it('rejects catalog child IDs attached to a legacy-only create request', async () => {
  await expect(new VehicleService().createVehicle({ vin: 'LEGACY', catalogueId: modelId, colourId: generationId, engineId })).rejects.toThrow('require a model');
  expect(tx.vehicle.create).not.toHaveBeenCalled();
});

const variantId = '00000000-0000-4000-a000-000000000004';
const colourId = '00000000-0000-4000-a000-000000000005';
const variant = { id: variantId, code: 'RIO-AT', description: 'Automatic', make: 'Kia', model: 'Rio', active: true,
  colours: [{ id: colourId, code: 'WHITE', description: 'White', active: true }] };
it('creates a workshop-linked vehicle with one hierarchy lookup and server-derived labels', async () => {
  tx.$queryRaw.mockResolvedValue([variant]);
  const result = await new VehicleService().createVehicle({ vin: 'WORKSHOP', catalogueId: variantId, colourId, color: 'wrong' });
  expect(result).toMatchObject({ catalogueId: variantId, colourId, make: 'Kia', model: 'Rio', trim: 'Automatic', color: 'White', modelId: null });
  expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  expect(tx.vehicleCatalogModel.findUnique).not.toHaveBeenCalled();
});
it('changes an existing vehicle from the separate model catalog to the workshop catalog', async () => {
  tx.$queryRaw.mockResolvedValue([variant]);
  expect(await new VehicleService().updateVehicle('vehicle', { catalogueId: variantId, colourId })).toMatchObject({
    catalogueId: variantId, colourId, modelId: null, generationId: null, engineId: null, customModel: 'Rio', color: 'White',
  });
  expect(tx.$queryRaw).toHaveBeenCalledTimes(2); // Row lock and one hierarchy lookup.
});
it('rejects colours outside the selected model and inactive variants before writing', async () => {
  tx.$queryRaw.mockResolvedValue([variant]);
  await expect(new VehicleService().createVehicle({ vin: 'WRONG', catalogueId: variantId, colourId: modelId })).rejects.toThrow('belonging');
  tx.$queryRaw.mockResolvedValue([{ ...variant, active: false }]);
  await expect(new VehicleService().createVehicle({ vin: 'INACTIVE', catalogueId: variantId, colourId })).rejects.toThrow('active catalogue');
  expect(tx.vehicle.create).not.toHaveBeenCalled();
});
it('rejects conflicting catalog identities instead of silently choosing one', async () => {
  await expect(new VehicleService().createVehicle({ vin: 'CONFLICT', catalogueId: variantId, colourId, modelId })).rejects.toThrow('one vehicle catalogue');
  expect(tx.vehicle.create).not.toHaveBeenCalled();
});

it('links the new vehicle and initial ownership to the same existing customer', async () => {
  const customerId = modelId;
  const result = await new VehicleService().createVehicle({ vin: 'OWNED', customerId, customModel: 'Rio' });
  expect(result.customerId).toBe(customerId);
  expect(tx.customer.findFirst).toHaveBeenCalledWith({ select: { id: true }, where: { id: customerId, mergedIntoId: null } });
  expect(tx.vehicleOwnership.create).toHaveBeenCalledWith({ data: expect.objectContaining({ vehicleId: 'vehicle', customerId, status: 'Current' }) });
});
it('rejects a missing or merged customer before creating a vehicle or ownership', async () => {
  tx.customer.findFirst.mockResolvedValue(null);
  await expect(new VehicleService().createVehicle({ vin: 'INVALID-OWNER', customerId: modelId, customModel: 'Rio' })).rejects.toThrow('Customer not found');
  expect(tx.vehicle.create).not.toHaveBeenCalled();
  expect(tx.vehicleOwnership.create).not.toHaveBeenCalled();
});

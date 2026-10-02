import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Prisma } from '@prisma/client';
import { parseCatalog, KIA_COUNTS, normalizeCatalogName, catalogAliases } from './catalog-source';
import { resolveVehicleIdentity } from './vehicle-identity';
import { createVehicleSchema } from '../vehicle/vehicle.validation';
import { seedCatalogTransaction } from './catalog-seed';

const source = JSON.parse(readFileSync(resolve(__dirname, '../../../data/kia.json'), 'utf8'));
const modelId = '00000000-0000-4000-a000-000000000001';
const generationId = '00000000-0000-4000-a000-000000000002';
const engineId = '00000000-0000-4000-a000-000000000003';
function database() {
  return {
    vehicleCatalogModel: { findUnique: jest.fn().mockResolvedValue({ id: modelId, name: 'Rio', make: { name: 'Kia' } }) },
    vehicleCatalogGeneration: { findUnique: jest.fn().mockResolvedValue({ id: generationId, modelId, name: 'RIO' }) },
    vehicleCatalogEngine: { findUnique: jest.fn().mockResolvedValue({ id: engineId, generationId, label: '1.4L' }) },
  };
}
describe('Kia source and search', () => {
  it('preserves all source names, specs, empty engine lists and numeric nulls', () => {
    const parsed = parseCatalog(source);
    expect(parsed.counts).toEqual(KIA_COUNTS);
    expect(parsed.data).toEqual(source);
    const models = parsed.data.makes[0].models;
    expect(models.some(model => model.name === "cee'd")).toBe(true);
    expect(models.some(model => model.name === 'Ceed')).toBe(true);
    const generations = models.flatMap(model => model.generations);
    expect(generations.some(generation => generation.engines.length === 0)).toBe(true);
    expect(generations.flatMap(generation => generation.engines).some(engine => engine.powerHp === null)).toBe(true);
  });
  it.each([["Cee'd SW", 'ceed sw'], ['cerato/forte', 'ceratoforte'], ['  Spectra ', 'spectra']])('normalizes %s', (input, expected) => {
    expect(normalizeCatalogName(input)).toBe(expected);
    const models = source.makes[0].models as { name: string }[];
    expect(models.some(model => normalizeCatalogName(model.name).includes(expected) || catalogAliases(model.name).includes(expected))).toBe(true);
  });
  it('builds aliases for both halves without renaming the model', () => {
    expect(catalogAliases('Cerato / Spectra')).toEqual(['cerato', 'spectra']);
  });
  it('rejects malformed data before any transaction writes', async () => {
    const invalid = structuredClone(source);
    invalid.makes[0].models[0].generations[0].engines[0].powerHp = 'bad';
    const execute = jest.fn();
    await expect(seedCatalogTransaction({ $executeRaw: execute } as unknown as Prisma.TransactionClient, invalid)).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });
});
describe('Vehicle model validation', () => {
  it('rejects an empty model and accepts catalog or normalized custom models', () => {
    expect(createVehicleSchema.safeParse({ body: { vin: 'TEST', customModel: '   ' } }).success).toBe(false);
    expect(createVehicleSchema.safeParse({ body: { vin: 'TEST', modelId } }).success).toBe(true);
    expect(createVehicleSchema.parse({ body: { vin: 'TEST', customModel: '  My   model  ' } }).body.customModel).toBe('My model');
    expect(createVehicleSchema.safeParse({ body: { vin: 'TEST', customModel: 'x'.repeat(81) } }).success).toBe(false);
  });
  it('resolves a valid catalog hierarchy from the database', async () => {
    const tx = database();
    expect(await resolveVehicleIdentity(tx as unknown as Prisma.TransactionClient, { modelId, generationId, engineId })).toMatchObject({ modelId, generationId, engineId, make: 'Kia', model: 'Rio', customModel: null });
  });
  it('accepts optional generation and engine', async () => {
    const tx = database();
    expect(await resolveVehicleIdentity(tx as unknown as Prisma.TransactionClient, { modelId })).toMatchObject({ generationId: null, engineId: null });
  });
  it('stores custom values only on the vehicle without querying the catalogue', async () => {
    const tx = database();
    expect(await resolveVehicleIdentity(tx as unknown as Prisma.TransactionClient, { customModel: '  My   model ', customMake: ' My   make ' })).toMatchObject({ modelId: null, customModel: 'My model', customMake: 'My make' });
    expect(tx.vehicleCatalogModel.findUnique).not.toHaveBeenCalled();
  });
  it('rejects unknown catalog models', async () => {
    const tx = database(); tx.vehicleCatalogModel.findUnique.mockResolvedValue(null);
    await expect(resolveVehicleIdentity(tx as unknown as Prisma.TransactionClient, { modelId })).rejects.toThrow('not found');
  });
  it('rejects a generation from another model', async () => {
    const tx = database(); tx.vehicleCatalogGeneration.findUnique.mockResolvedValue({ id: generationId, modelId: 'other' });
    await expect(resolveVehicleIdentity(tx as unknown as Prisma.TransactionClient, { modelId, generationId })).rejects.toThrow('Generation does not belong');
  });
  it('rejects an engine from another generation', async () => {
    const tx = database(); tx.vehicleCatalogEngine.findUnique.mockResolvedValue({ id: engineId, generationId: 'other' });
    await expect(resolveVehicleIdentity(tx as unknown as Prisma.TransactionClient, { modelId, generationId, engineId })).rejects.toThrow('Engine does not belong');
  });
  it.each([{ modelId, engineId }, { customModel: 'Custom', generationId }, { modelId, customModel: 'Custom' }, { customModel: ' ' }])('rejects incompatible or empty selections %j', async input => {
    await expect(resolveVehicleIdentity(database() as unknown as Prisma.TransactionClient, input)).rejects.toThrow();
  });
});

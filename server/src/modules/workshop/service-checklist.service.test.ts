jest.mock('../../prisma/client', () => ({ __esModule: true, default: {
  workshopMaster: { findFirst: jest.fn() },
  sparePart: { findUnique: jest.fn() },
  labourItem: { findFirst: jest.fn() },
  serviceChecklistLine: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  serviceChecklistMileage: { findMany: jest.fn() },
} }));
import prisma from '../../prisma/client';
import { ServiceChecklistService, checklistTotals } from './service-checklist.service';
import { createChecklistLineSchema } from './service-checklist.validation';

const checklistId = '00000000-0000-4000-8000-000000000001';
const modelId = '00000000-0000-4000-8000-000000000002';
const variantId = '00000000-0000-4000-8000-000000000003';
const partId = '00000000-0000-4000-8000-000000000004';
const service = new ServiceChecklistService();
const part = (partType: string, retailRate: number | null, unitPrice: number) => ({ partType, retailRate, unitPrice });
beforeEach(() => {
  jest.resetAllMocks();
  (prisma.workshopMaster.findFirst as jest.Mock).mockImplementation(({ where }) => Promise.resolve({ id: where.id, kind: where.kind, parentId: modelId }));
  (prisma.serviceChecklistLine.create as jest.Mock).mockResolvedValue({});
});

it('prices parts at the retail rate, splits oils and adds labour amounts', () => {
  const totals = checklistTotals([
    { kind: 'PART', quantity: 2, amount: 0, sparePart: part('S', 1021.14, 900) },
    { kind: 'PART', quantity: 4, amount: 0, sparePart: part('O', null, 2500.5) },
    { kind: 'LABOUR', quantity: 1, amount: 25000, sparePart: null },
  ] as never);
  expect(totals).toEqual({ part: 2042.28, oil: 10002, labour: 25000, total: 37044.28 });
});

it('needs a part with a quantity or a labour with an amount', () => {
  expect(createChecklistLineSchema.safeParse({ body: { kind: 'PART', checklistId, modelId, sparePartId: partId, quantity: 1 } }).success).toBe(true);
  expect(createChecklistLineSchema.safeParse({ body: { kind: 'PART', checklistId, modelId, labourItemId: partId, quantity: 1 } }).success).toBe(false);
  expect(createChecklistLineSchema.safeParse({ body: { kind: 'LABOUR', checklistId, modelId, labourItemId: partId, quantity: 1 } }).success).toBe(false);
});

it('rejects a variant from another model', async () => {
  (prisma.workshopMaster.findFirst as jest.Mock).mockImplementation(({ where }) => Promise.resolve({ id: where.id, kind: where.kind, parentId: checklistId }));
  await expect(service.createLine({ kind: 'PART', checklistId, modelId, variantId, sparePartId: partId, quantity: 1 })).rejects.toMatchObject({ statusCode: 400 });
  expect(prisma.serviceChecklistLine.create).not.toHaveBeenCalled();
});

it('rejects blocked parts', async () => {
  (prisma.sparePart.findUnique as jest.Mock).mockResolvedValue({ id: partId, partStatus: 'BLOCKED' });
  await expect(service.createLine({ kind: 'PART', checklistId, modelId, sparePartId: partId, quantity: 1 })).rejects.toMatchObject({ statusCode: 400 });
});

it('stores an all-variants line with a null variant', async () => {
  (prisma.sparePart.findUnique as jest.Mock).mockResolvedValue({ id: partId, partStatus: 'ACTIVE' });
  await service.createLine({ kind: 'PART', checklistId, modelId, sparePartId: partId, quantity: 4 });
  expect(prisma.serviceChecklistLine.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ variantId: null, quantity: 4 }) }));
});

it('lists a variant with the all-variant lines', async () => {
  (prisma.serviceChecklistLine.findMany as jest.Mock).mockResolvedValue([]);
  await service.listLines(checklistId, modelId, variantId);
  expect((prisma.serviceChecklistLine.findMany as jest.Mock).mock.calls[0][0].where).toEqual({
    checklistId, modelId, OR: [{ variantId }, { variantId: null }],
  });
});

it('keeps part lines priced from the part', async () => {
  (prisma.serviceChecklistLine.findUnique as jest.Mock).mockResolvedValue({ id: partId, kind: 'PART' });
  await expect(service.updateLine(partId, { amount: 5 })).rejects.toMatchObject({ statusCode: 400 });
});

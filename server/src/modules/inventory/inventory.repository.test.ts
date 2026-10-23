import prisma from '../../prisma/client';
import { recordPartChange } from './partHistory';
import { InventoryRepository } from './inventory.repository';

jest.mock('../../prisma/client', () => ({ __esModule: true, default: { $transaction: jest.fn() } }));
jest.mock('./partHistory', () => ({ recordPartChange: jest.fn() }));

describe('part master tax mapping and change tracking', () => {
  const repository = new InventoryRepository();
  const before = { id: 'part-1', taxCategory: 'A', unitPrice: 10 };
  const after = { ...before, taxCategory: 'B', reportTaxCategoryCode: 'OIL', unitPrice: 20 };
  const tx = { sparePart: { create: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() } };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(callback => callback(tx));
    tx.sparePart.create.mockResolvedValue(after);
    tx.sparePart.findUniqueOrThrow.mockResolvedValue(before);
    tx.sparePart.update.mockResolvedValue(after);
  });

  it('creates a mapped part and records the acting user in the transaction', async () => {
    const data = { partNumber: 'P1', name: 'Oil', category: 'Oil', uom: 'L', unitPrice: 20, taxCategory: 'B' };
    await repository.createPart(data, 'actor-1');
    expect(tx.sparePart.create).toHaveBeenCalledWith({ data: { ...data, reportTaxCategoryCode: 'OIL' } });
    expect(recordPartChange).toHaveBeenCalledWith(tx, null, after, 'actor-1');
  });

  it.each(['updatePart', 'updateSparePart'] as const)('%s preserves mapping and audit attribution', async method => {
    await repository[method]('part-1', { taxCategory: 'B', unitPrice: 20 }, 'actor-1');
    expect(tx.sparePart.update).toHaveBeenCalledWith({ where: { id: 'part-1' }, data: { taxCategory: 'B', unitPrice: 20, reportTaxCategoryCode: 'OIL' } });
    expect(recordPartChange).toHaveBeenCalledWith(tx, before, after, 'actor-1');
  });

  it('leaves the category untouched for unrelated edits', async () => {
    await repository.updatePart('part-1', { name: 'New name' });
    expect(tx.sparePart.update).toHaveBeenCalledWith({ where: { id: 'part-1' }, data: { name: 'New name' } });
  });
});

jest.mock('../../prisma/client', () => ({ __esModule: true, default: {
  $transaction: jest.fn(), $queryRaw: jest.fn(),
  jobCard: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
  user: { findUnique: jest.fn() },
  partIssuance: { findMany: jest.fn(), create: jest.fn() },
  inventoryStock: { updateMany: jest.fn() },
} }));
jest.mock('../inventory/inventory.repository', () => ({ InventoryRepository: jest.fn().mockImplementation(() => ({
  findSparePartById: jest.fn().mockResolvedValue({ id: 'part', partStatus: 'ACTIVE' }),
  findInventoryStock: jest.fn().mockResolvedValue({ quantity: 10, reservedQuantity: 0 }),
})) }));

import prisma from '../../prisma/client';
import { InventoryService } from '../inventory/inventory.service';
import { RequisitionService } from '../requisition/requisition.service';
import { assertPartsRequested } from './jobcard-parts-request.logic';

const id = '550e8400-e29b-41d4-a716-446655440000';
beforeEach(() => {
  jest.clearAllMocks();
  (prisma.$transaction as jest.Mock).mockImplementation(callback => callback(prisma));
  (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ id, branchId: id });
  (prisma.jobCard.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id, branchId: id, status: 'IN_PROGRESS', billedAt: null, partsRequestedAt: null });
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id });
});

it.each([null, undefined])('blocks issuance before a successful request (%s)', partsRequestedAt => {
  expect(() => assertPartsRequested({ partsRequestedAt })).toThrow('The parts request for this job has not been sent yet');
});
it('allows issuance after the recorded request', () => {
  expect(() => assertPartsRequested({ partsRequestedAt: new Date() })).not.toThrow();
});
it('blocks the direct inventory endpoint before changing stock or creating issuance', async () => {
  await expect(new InventoryService().createPartIssuance({ branchId: id, jobCardId: id, issuedById: id, sparePartId: id, quantity: 1 })).rejects.toThrow('The parts request for this job has not been sent yet');
  expect(prisma.inventoryStock.updateMany).not.toHaveBeenCalled();
  expect(prisma.partIssuance.create).not.toHaveBeenCalled();
});
it('blocks issuance through requisitions as well', async () => {
  (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ id, branchId: id, status: 'IN_PROGRESS', billedAt: null, partsRequestedAt: null, invoices: [] });
  await expect(new RequisitionService().create({ branchId: id, jobCardId: id, chargeType: 'CUSTOMER', lines: [{ sparePartId: id, quantityRequired: 1, quantityIssued: 1 }] }, { userId: id, branchId: id, allBranches: false, goodwill: false })).rejects.toThrow('The parts request for this job has not been sent yet');
  expect(prisma.partIssuance.create).not.toHaveBeenCalled();
});

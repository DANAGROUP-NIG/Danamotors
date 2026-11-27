jest.mock('../../prisma/client', () => ({ __esModule: true, default: {
  $transaction: jest.fn(), $queryRaw: jest.fn(),
  jobCard: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
  user: { findUnique: jest.fn() },
  partIssuance: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
  partRequisition: { findUnique: jest.fn(), create: jest.fn() },
  inventoryStock: { updateMany: jest.fn() },
} }));
jest.mock('../inventory/inventory.repository', () => ({ InventoryRepository: jest.fn().mockImplementation(() => ({
  findSparePartById: jest.fn().mockResolvedValue({ id: 'part', partStatus: 'ACTIVE' }),
  findInventoryStock: jest.fn().mockResolvedValue({ quantity: 10, reservedQuantity: 0 }),
})) }));
jest.mock('../notification/workshop-notifications', () => ({ notifyWorkshopEvent: jest.fn() }));

import prisma from '../../prisma/client';
import { InventoryService } from '../inventory/inventory.service';
import { RequisitionService } from '../requisition/requisition.service';
import { requisitionBody } from '../requisition/requisition.validation';
import { assertPartsRequested } from './jobcard-parts-request.logic';
import { serviceJobIssuanceFingerprint } from './service-job-issuance';

const id = '550e8400-e29b-41d4-a716-446655440000';
beforeEach(() => {
  jest.clearAllMocks();
  (prisma.$transaction as jest.Mock).mockImplementation(callback => callback(prisma));
  (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ id, branchId: id });
  (prisma.jobCard.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id, branchId: id, status: 'IN_PROGRESS', billedAt: null, partsRequestedAt: null });
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id });
});

it.each([null, undefined])('blocks issuance before a successful request (%s)', partsRequestedAt => {
  expect(() => assertPartsRequested({ partsRequestedAt })).toThrow('Click Request Parts');
});
it('allows issuance after the recorded request', () => {
  expect(() => assertPartsRequested({ partsRequestedAt: new Date() })).not.toThrow();
});
it('blocks the direct inventory endpoint before changing stock or creating issuance', async () => {
  await expect(new InventoryService().createPartIssuance({ branchId: id, jobCardId: id, issuedById: id, sparePartId: id, quantity: 1 })).rejects.toThrow('Click Request Parts');
  expect(prisma.inventoryStock.updateMany).not.toHaveBeenCalled();
  expect(prisma.partIssuance.create).not.toHaveBeenCalled();
});
it('blocks issuance through requisitions as well', async () => {
  (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ id, branchId: id, status: 'IN_PROGRESS', billedAt: null, partsRequestedAt: null, invoices: [] });
  await expect(new RequisitionService().create({ branchId: id, jobCardId: id, chargeType: 'CUSTOMER', lines: [{ sparePartId: id, quantityRequired: 1, quantityIssued: 1 }] }, { userId: id, branchId: id, allBranches: false, goodwill: false })).rejects.toThrow('Click Request Parts');
  expect(prisma.partIssuance.create).not.toHaveBeenCalled();
});

it('replays a matching direct issuance even after the job was billed', async () => {
  const input = { requestId: id, branchId: id, jobCardId: id, issuedById: id, sparePartId: id, quantity: 1 };
  const recorded = { id: 'recorded', workflowRequestHash: serviceJobIssuanceFingerprint(id, input) };
  (prisma.jobCard.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id, branchId: id, status: 'BILLED', serviceWorkflow: {} });
  (prisma.partIssuance.findUnique as jest.Mock).mockResolvedValue(recorded);
  const service = new InventoryService();

  await expect(service.createPartIssuance(input)).resolves.toEqual(recorded);
  await expect(service.createPartIssuance({ ...input, quantity: 2 })).rejects.toMatchObject({ code: 'ISSUANCE_REQUEST_ID_CONFLICT' });
  expect(prisma.inventoryStock.updateMany).not.toHaveBeenCalled();
  expect(prisma.partIssuance.create).not.toHaveBeenCalled();
});

it('replays a matching requisition without creating another stock movement', async () => {
  const input = { requestId: id, branchId: id, jobCardId: id, chargeType: 'CUSTOMER' as const, lines: [{ sparePartId: id, quantityRequired: 1, quantityIssued: 1 }] };
  const actor = { userId: id, branchId: id, allBranches: false, goodwill: false };
  const recorded = { id: 'recorded', branchId: id, lines: [] };
  (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ id, branchId: id, jobType: 'SERVICE', status: 'OPEN', serviceWorkflow: {} });
  (prisma.partRequisition.findUnique as jest.Mock)
    .mockResolvedValueOnce({ id: recorded.id, workflowRequestHash: serviceJobIssuanceFingerprint(id, requisitionBody.parse(input)) })
    .mockResolvedValueOnce(recorded);

  await expect(new RequisitionService().create(input, actor)).resolves.toMatchObject(recorded);
  expect(prisma.partRequisition.create).not.toHaveBeenCalled();
  expect(prisma.partIssuance.create).not.toHaveBeenCalled();
});

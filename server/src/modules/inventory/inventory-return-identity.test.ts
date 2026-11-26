import type { Request, Response } from 'express';
jest.mock('../../prisma/client', () => ({ __esModule: true, default: { partIssuance: { findUnique: jest.fn() } } }));
jest.mock('./inventory.service');
import prisma from '../../prisma/client';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { createPartReturnSchema } from './inventory.validation';

beforeEach(() => jest.clearAllMocks());
const request = () => ({ body: { partIssuanceId: 'issue', branchId: 'spoofed', returnedById: 'spoofed', quantity: 1, reason: 'Unused' }, user: { userId: 'actor', branchId: 'branch', role: 'Custom', permissions: [] } } as unknown as Request);
const response = () => { const res = { status: jest.fn(), json: jest.fn() }; res.status.mockReturnValue(res); return res as unknown as Response; };

it('accepts an authenticated return without a client-supplied actor and keeps old clients compatible', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const body = { partIssuanceId: id, branchId: id, quantity: 1, reason: 'Unused' };
  expect(createPartReturnSchema.safeParse({ body }).success).toBe(true);
  expect(createPartReturnSchema.safeParse({ body: { ...body, returnedById: id } }).success).toBe(true);
});
it('derives the return actor and branch from the session and issuance, ignoring body spoofing', async () => {
  (prisma.partIssuance.findUnique as jest.Mock).mockResolvedValue({ branchId: 'branch' });
  (InventoryService.prototype.createPartReturn as jest.Mock).mockResolvedValue({ id: 'return' });
  const next = jest.fn();
  await new InventoryController().createPartReturn(request(), response(), next);
  expect(next).not.toHaveBeenCalled();
  expect(InventoryService.prototype.createPartReturn).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'branch', returnedById: 'actor' }));
});
it('rejects an issuance from another branch before any stock mutation', async () => {
  (prisma.partIssuance.findUnique as jest.Mock).mockResolvedValue({ branchId: 'other' });
  const next = jest.fn();
  await new InventoryController().createPartReturn(request(), response(), next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  expect(InventoryService.prototype.createPartReturn).not.toHaveBeenCalled();
});

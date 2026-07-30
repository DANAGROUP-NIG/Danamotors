import prisma from '../../prisma/client';
import { InventoryRepository } from './inventory.repository';
import { NotFoundError, BadRequestError, ConflictError } from '../../shared/errors/appError';

export class InventoryService {
  private inventoryRepository: InventoryRepository;

  constructor() {
    this.inventoryRepository = new InventoryRepository();
  }

  async listSpareParts() {
    return this.inventoryRepository.listSpareParts();
  }

  async getSparePart(id: string) {
    const part = await this.inventoryRepository.findSparePartById(id);
    if (!part) {
      throw new NotFoundError('Spare part not found');
    }
    return part;
  }

  async createSparePart(data: {
    partNumber: string;
    name: string;
    description?: string;
    category?: string;
    unitPrice?: number;
  }) {
    const existing = await prisma.sparePart.findUnique({ where: { partNumber: data.partNumber } });
    if (existing) {
      throw new ConflictError('A spare part with this part number already exists');
    }

    return this.inventoryRepository.createSparePart(data);
  }

  async updateSparePart(id: string, data: {
    name?: string;
    description?: string;
    category?: string;
    unitPrice?: number;
  }) {
    const part = await this.inventoryRepository.findSparePartById(id);
    if (!part) {
      throw new NotFoundError('Spare part not found');
    }

    return this.inventoryRepository.updateSparePart(id, data);
  }

  async deleteSparePart(id: string) {
    const part = await this.inventoryRepository.findSparePartById(id);
    if (!part) {
      throw new NotFoundError('Spare part not found');
    }

    return this.inventoryRepository.deleteSparePart(id);
  }

  // ── Inventory Stock ────────────────────────────────────────────────────

  async getBranchStock(branchId: string, partId: string) {
    const stock = await this.inventoryRepository.findInventoryStock(branchId, partId);
    if (!stock) {
      throw new NotFoundError('Stock record not found for this branch and part');
    }
    return stock;
  }

  async listBranchStock(branchId: string) {
    return this.inventoryRepository.listInventoryStockByBranch(branchId);
  }

  async listAllStock() {
    return this.inventoryRepository.listAllInventoryStock();
  }

  async adjustStock(data: {
    branchId: string;
    partId: string;
    quantity: number;
    type: string;
    notes?: string;
    recordedById?: string;
  }) {
    const part = await this.inventoryRepository.findSparePartById(data.partId);
    if (!part) {
      throw new NotFoundError('Spare part not found');
    }

    const branch = await prisma.branch.findUnique({ where: { id: data.branchId } });
    if (!branch) {
      throw new NotFoundError('Branch not found');
    }

    const stock = await this.inventoryRepository.upsertInventoryStock({
      branchId: data.branchId,
      partId: data.partId,
      quantity: data.quantity,
    });

    await this.inventoryRepository.createStockTransaction({
      branchId: data.branchId,
      partId: data.partId,
      type: data.type,
      quantity: data.quantity,
      notes: data.notes,
      recordedById: data.recordedById,
    });

    return stock;
  }

  async listStockTransactions(branchId?: string, partId?: string) {
    return this.inventoryRepository.listStockTransactions(branchId, partId);
  }

  // ── Purchase Requests ──────────────────────────────────────────────────

  async createPurchaseRequest(data: {
    sparePartId: string;
    requestedById: string;
    quantity: number;
    status?: string;
    approvalNotes?: string;
  }) {
    const sparePart = await this.inventoryRepository.findSparePartById(data.sparePartId);
    if (!sparePart) {
      throw new NotFoundError('Spare part not found');
    }

    const user = await prisma.user.findUnique({ where: { id: data.requestedById } });
    if (!user) {
      throw new NotFoundError('Requesting user not found');
    }

    return this.inventoryRepository.createPurchaseRequest({
      sparePartId: data.sparePartId,
      requestedById: data.requestedById,
      quantity: data.quantity,
      status: data.status,
      approvalNotes: data.approvalNotes,
    });
  }

  async listPurchaseRequests() {
    return this.inventoryRepository.listPurchaseRequests();
  }

  async getPurchaseRequest(id: string) {
    const request = await this.inventoryRepository.findPurchaseRequestById(id);
    if (!request) {
      throw new NotFoundError('Purchase request not found');
    }

    return request;
  }

  async updatePurchaseRequestStatus(id: string, data: { status: string; approvalNotes?: string }) {
    const request = await this.inventoryRepository.findPurchaseRequestById(id);
    if (!request) {
      throw new NotFoundError('Purchase request not found');
    }

    return this.inventoryRepository.updatePurchaseRequestStatus(id, {
      status: data.status,
      approvalNotes: data.approvalNotes,
    });
  }

  // ── Part Issuances ─────────────────────────────────────────────────────

  async createPartIssuance(data: {
    sparePartId: string;
    branchId: string;
    jobCardId?: string;
    issuedById: string;
    quantity: number;
    notes?: string;
  }) {
    const sparePart = await this.inventoryRepository.findSparePartById(data.sparePartId);
    if (!sparePart) {
      throw new NotFoundError('Spare part not found');
    }

    if (data.quantity <= 0) {
      throw new BadRequestError('Issued quantity must be greater than zero');
    }

    const stock = await this.inventoryRepository.findInventoryStock(data.branchId, data.sparePartId);
    if (!stock || stock.quantity < data.quantity) {
      throw new BadRequestError('Insufficient stock at this branch');
    }

    const user = await prisma.user.findUnique({ where: { id: data.issuedById } });
    if (!user) {
      throw new NotFoundError('Issuing user not found');
    }

    if (data.jobCardId) {
      const jobCard = await prisma.jobCard.findUnique({ where: { id: data.jobCardId } });
      if (!jobCard) {
        throw new NotFoundError('Job card not found');
      }
    }

    await this.inventoryRepository.decrementInventoryStock(data.branchId, data.sparePartId, data.quantity);
    await this.inventoryRepository.createStockTransaction({
      branchId: data.branchId,
      partId: data.sparePartId,
      type: 'ISSUED',
      quantity: -data.quantity,
      referenceId: data.jobCardId,
      notes: data.notes,
      recordedById: data.issuedById,
    });

    return this.inventoryRepository.createPartIssuance({
      sparePartId: data.sparePartId,
      jobCardId: data.jobCardId,
      issuedById: data.issuedById,
      quantity: data.quantity,
      notes: data.notes,
    });
  }

  async listPartIssuances() {
    return this.inventoryRepository.listPartIssuances();
  }

  async getPartIssuance(id: string) {
    const issuance = await this.inventoryRepository.findPartIssuanceById(id);
    if (!issuance) {
      throw new NotFoundError('Part issuance not found');
    }

    return issuance;
  }

  async createPartReturn(data: {
    partIssuanceId: string;
    branchId: string;
    returnedById: string;
    quantity: number;
    reason?: string;
    status?: string;
  }) {
    const issuance = await this.inventoryRepository.findPartIssuanceById(data.partIssuanceId);
    if (!issuance) {
      throw new NotFoundError('Part issuance not found');
    }

    if (data.quantity <= 0) {
      throw new BadRequestError('Returned quantity must be greater than zero');
    }

    const totalReturned = await prisma.partReturn.aggregate({
      where: { partIssuanceId: data.partIssuanceId },
      _sum: { quantity: true },
    });

    const returnedSoFar = totalReturned._sum.quantity ?? 0;
    if (returnedSoFar + data.quantity > issuance.quantity) {
      throw new BadRequestError('Returned quantity exceeds issued quantity');
    }

    const user = await prisma.user.findUnique({ where: { id: data.returnedById } });
    if (!user) {
      throw new NotFoundError('Returning user not found');
    }

    await this.inventoryRepository.incrementInventoryStock(data.branchId, issuance.sparePartId, data.quantity);
    await this.inventoryRepository.createStockTransaction({
      branchId: data.branchId,
      partId: issuance.sparePartId,
      type: 'RETURNED',
      quantity: data.quantity,
      referenceId: data.partIssuanceId,
      notes: data.reason,
      recordedById: data.returnedById,
    });

    return this.inventoryRepository.createPartReturn({
      partIssuanceId: data.partIssuanceId,
      returnedById: data.returnedById,
      quantity: data.quantity,
      reason: data.reason,
      status: data.status,
    });
  }

  async listPartReturns() {
    return this.inventoryRepository.listPartReturns();
  }

  async getPartReturn(id: string) {
    const partReturn = await this.inventoryRepository.findPartReturnById(id);
    if (!partReturn) {
      throw new NotFoundError('Part return not found');
    }

    return partReturn;
  }

  // ── Inter-Branch Transfers ─────────────────────────────────────────────

  async createTransfer(data: {
    requestingBranchId: string;
    sourceBranchId: string;
    requestedById: string;
    notes?: string;
    items: { partId: string; requestedQuantity: number }[];
  }) {
    if (data.requestingBranchId === data.sourceBranchId) {
      throw new BadRequestError('Source and requesting branch cannot be the same');
    }

    if (!data.items || data.items.length === 0) {
      throw new BadRequestError('At least one item is required for a transfer');
    }

    const sourceBranch = await prisma.branch.findUnique({ where: { id: data.sourceBranchId } });
    if (!sourceBranch) throw new NotFoundError('Source branch not found');

    const reqBranch = await prisma.branch.findUnique({ where: { id: data.requestingBranchId } });
    if (!reqBranch) throw new NotFoundError('Requesting branch not found');

    // Validate all parts exist
    for (const item of data.items) {
      const part = await this.inventoryRepository.findSparePartById(item.partId);
      if (!part) throw new NotFoundError(`Spare part ${item.partId} not found`);
      if (item.requestedQuantity <= 0) {
        throw new BadRequestError(`Invalid requested quantity for part ${item.partId}`);
      }
    }

    const transferNumber = await this.inventoryRepository.getNextTransferNumber();

    const transfer = await this.inventoryRepository.createTransfer({
      transferNumber,
      requestingBranchId: data.requestingBranchId,
      sourceBranchId: data.sourceBranchId,
      requestedById: data.requestedById,
      notes: data.notes,
    });

    // Add items
    for (const item of data.items) {
      await this.inventoryRepository.createTransferItem({
        transferId: transfer.id,
        partId: item.partId,
        requestedQuantity: item.requestedQuantity,
      });
    }

    return this.inventoryRepository.findTransferById(transfer.id);
  }

  async getTransfer(id: string) {
    const transfer = await this.inventoryRepository.findTransferById(id);
    if (!transfer) {
      throw new NotFoundError('Transfer not found');
    }
    return transfer;
  }

  async listTransfers(filters?: {
    status?: string;
    requestingBranchId?: string;
    sourceBranchId?: string;
  }) {
    return this.inventoryRepository.listTransfers(filters);
  }

  async approveTransfer(id: string, approvedById: string) {
    const transfer = await this.inventoryRepository.findTransferById(id);
    if (!transfer) throw new NotFoundError('Transfer not found');
    if (transfer.status !== 'Pending') throw new BadRequestError('Transfer can only be approved from Pending status');

    return this.inventoryRepository.updateTransferStatus(id, {
      status: 'Approved',
      approvedById,
      approvedAt: new Date(),
    });
  }

  async dispatchTransfer(id: string, dispatchedById: string, items?: { id: string; dispatchedQuantity: number }[]) {
    const transfer = await this.inventoryRepository.findTransferById(id);
    if (!transfer) throw new NotFoundError('Transfer not found');
    if (transfer.status !== 'Approved') throw new BadRequestError('Transfer can only be dispatched from Approved status');

    const transferItems = await this.inventoryRepository.findTransferItems(id);
    for (const item of transferItems) {
      const dispatchedQty = items?.find(i => i.id === item.id)?.dispatchedQuantity ?? item.requestedQuantity;
      const stock = await this.inventoryRepository.findInventoryStock(transfer.sourceBranchId, item.partId);
      if (!stock || stock.quantity < dispatchedQty) {
        throw new BadRequestError(`Insufficient stock for part ${item.partId} at source branch`);
      }
      await this.inventoryRepository.decrementInventoryStock(transfer.sourceBranchId, item.partId, dispatchedQty);
      await this.inventoryRepository.createStockTransaction({
        branchId: transfer.sourceBranchId,
        partId: item.partId,
        type: 'TRANSFER_OUT',
        quantity: -dispatchedQty,
        referenceId: id,
        recordedById: dispatchedById,
      });
    }

    if (items) {
      await this.inventoryRepository.updateTransferItemsDispatched(items);
    }

    return this.inventoryRepository.updateTransferStatus(id, {
      status: 'Dispatched',
      dispatchedById,
      dispatchedAt: new Date(),
    });
  }

  async receiveTransfer(id: string, receivedById: string, items?: { id: string; receivedQuantity: number }[]) {
    const transfer = await this.inventoryRepository.findTransferById(id);
    if (!transfer) throw new NotFoundError('Transfer not found');
    if (transfer.status !== 'Dispatched') throw new BadRequestError('Transfer can only be received from Dispatched status');

    const transferItems = await this.inventoryRepository.findTransferItems(id);
    for (const item of transferItems) {
      const receivedQty = items?.find(i => i.id === item.id)?.receivedQuantity ?? item.requestedQuantity;
      await this.inventoryRepository.upsertInventoryStock({
        branchId: transfer.requestingBranchId,
        partId: item.partId,
        quantity: receivedQty,
      });
      await this.inventoryRepository.createStockTransaction({
        branchId: transfer.requestingBranchId,
        partId: item.partId,
        type: 'TRANSFER_IN',
        quantity: receivedQty,
        referenceId: id,
        recordedById: receivedById,
      });
    }

    if (items) {
      await this.inventoryRepository.updateTransferItemsReceived(items);
    }

    return this.inventoryRepository.updateTransferStatus(id, {
      status: 'Received',
      receivedById,
      receivedAt: new Date(),
    });
  }

  async rejectTransfer(id: string, approvedById: string, notes?: string) {
    const transfer = await this.inventoryRepository.findTransferById(id);
    if (!transfer) throw new NotFoundError('Transfer not found');
    if (transfer.status !== 'Pending') throw new BadRequestError('Transfer can only be rejected from Pending status');

    return this.inventoryRepository.updateTransferStatus(id, {
      status: 'Rejected',
      approvedById,
      approvedAt: new Date(),
      notes,
    });
  }

  async cancelTransfer(id: string) {
    const transfer = await this.inventoryRepository.findTransferById(id);
    if (!transfer) throw new NotFoundError('Transfer not found');
    if (!['Pending', 'Approved'].includes(transfer.status)) {
      throw new BadRequestError('Transfer can only be cancelled from Pending or Approved status');
    }

    return this.inventoryRepository.updateTransferStatus(id, { status: 'Cancelled' });
  }
}

export default InventoryService;

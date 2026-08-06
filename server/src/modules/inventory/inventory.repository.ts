import prisma from '../../prisma/client';
import {
  SparePart,
  PurchaseRequest,
  PartIssuance,
  PartReturn,
  InventoryStock,
  StockTransaction,
  InterBranchTransfer,
  InterBranchTransferItem,
} from '@prisma/client';

export class InventoryRepository {
  async listSpareParts(): Promise<SparePart[]> {
    return prisma.sparePart.findMany({
      include: { inventoryStocks: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findSparePartById(id: string): Promise<SparePart | null> {
    return prisma.sparePart.findUnique({
      where: { id },
      include: { inventoryStocks: true },
    });
  }

  async createSparePart(data: {
    partNumber: string;
    name: string;
    description?: string;
    category?: string;
    unitPrice?: number;
  }): Promise<SparePart> {
    return prisma.sparePart.create({ data });
  }

  async updateSparePart(id: string, data: Partial<SparePart>): Promise<SparePart> {
    return prisma.sparePart.update({ where: { id }, data });
  }

  async deleteSparePart(id: string): Promise<SparePart> {
    return prisma.sparePart.delete({ where: { id } });
  }

  // ── Inventory Stock ────────────────────────────────────────────────────

  async upsertInventoryStock(data: {
    branchId: string;
    partId: string;
    quantity: number;
    minimumStock?: number;
    rackLocation?: string | null;
    maximumStock?: number;
  }): Promise<InventoryStock> {
    return prisma.inventoryStock.upsert({
      where: { branchId_partId: { branchId: data.branchId, partId: data.partId } },
      create: {
        branchId: data.branchId,
        partId: data.partId,
        quantity: data.quantity,
        minimumStock: data.minimumStock ?? 0,
        rackLocation: data.rackLocation ?? null,
        maximumStock: data.maximumStock,
      },
      update: {
        quantity: { increment: data.quantity },
        minimumStock: data.minimumStock ?? undefined,
        rackLocation: data.rackLocation ?? undefined,
        maximumStock: data.maximumStock ?? undefined,
      },
    });
  }

  async setInventoryStockQuantity(
    branchId: string,
    partId: string,
    quantity: number,
  ): Promise<InventoryStock> {
    return prisma.inventoryStock.update({
      where: { branchId_partId: { branchId, partId } },
      data: { quantity },
    });
  }

  async incrementInventoryStock(
    branchId: string,
    partId: string,
    quantity: number,
  ): Promise<InventoryStock> {
    return prisma.inventoryStock.update({
      where: { branchId_partId: { branchId, partId } },
      data: { quantity: { increment: quantity } },
    });
  }

  async decrementInventoryStock(
    branchId: string,
    partId: string,
    quantity: number,
  ): Promise<InventoryStock> {
    return prisma.inventoryStock.update({
      where: { branchId_partId: { branchId, partId } },
      data: { quantity: { decrement: quantity } },
    });
  }

  async findInventoryStock(
    branchId: string,
    partId: string,
  ): Promise<InventoryStock | null> {
    return prisma.inventoryStock.findUnique({
      where: { branchId_partId: { branchId, partId } },
    });
  }

  async listInventoryStockByBranch(branchId: string): Promise<InventoryStock[]> {
    return prisma.inventoryStock.findMany({
      where: { branchId },
      include: { part: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async listAllInventoryStock(): Promise<InventoryStock[]> {
    return prisma.inventoryStock.findMany({
      include: { part: true, branch: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  // ── Stock Transactions ─────────────────────────────────────────────────

  async createStockTransaction(data: {
    branchId: string;
    partId: string;
    type: string;
    quantity: number;
    referenceId?: string;
    notes?: string;
    recordedById?: string;
  }): Promise<StockTransaction> {
    return prisma.stockTransaction.create({ data });
  }

  async listStockTransactions(
    branchId?: string,
    partId?: string,
  ): Promise<StockTransaction[]> {
    return prisma.stockTransaction.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(partId ? { partId } : {}),
      },
      include: { part: true, recordedBy: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ── Purchase Requests ──────────────────────────────────────────────────

  async listPurchaseRequests(): Promise<PurchaseRequest[]> {
    return prisma.purchaseRequest.findMany({
      include: {
        sparePart: true,
        requestedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { requestDate: 'desc' },
    });
  }

  async findPurchaseRequestById(id: string): Promise<PurchaseRequest | null> {
    return prisma.purchaseRequest.findUnique({
      where: { id },
      include: {
        sparePart: true,
        requestedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async createPurchaseRequest(data: {
    sparePartId: string;
    requestedById: string;
    quantity: number;
    status?: string;
    approvalNotes?: string;
  }): Promise<PurchaseRequest> {
    return prisma.purchaseRequest.create({ data });
  }

  async updatePurchaseRequestStatus(id: string, data: Partial<PurchaseRequest>): Promise<PurchaseRequest> {
    return prisma.purchaseRequest.update({ where: { id }, data });
  }

  // ── Part Issuances ─────────────────────────────────────────────────────

  async listPartIssuances(): Promise<PartIssuance[]> {
    return prisma.partIssuance.findMany({
      include: {
        sparePart: true,
        jobCard: true,
        issuedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async findPartIssuanceById(id: string): Promise<PartIssuance | null> {
    return prisma.partIssuance.findUnique({
      where: { id },
      include: {
        sparePart: true,
        jobCard: true,
        issuedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        returns: true,
      },
    });
  }

  async createPartIssuance(data: {
    sparePartId: string;
    jobCardId?: string;
    issuedById: string;
    quantity: number;
    notes?: string;
  }): Promise<PartIssuance> {
    return prisma.partIssuance.create({ data });
  }

  // ── Part Returns ───────────────────────────────────────────────────────

  async listPartReturns(): Promise<PartReturn[]> {
    return prisma.partReturn.findMany({
      include: {
        partIssuance: {
          include: {
            sparePart: true,
          },
        },
        returnedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { returnedAt: 'desc' },
    });
  }

  async findPartReturnById(id: string): Promise<PartReturn | null> {
    return prisma.partReturn.findUnique({
      where: { id },
      include: {
        partIssuance: {
          include: {
            sparePart: true,
          },
        },
        returnedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async createPartReturn(data: {
    partIssuanceId: string;
    returnedById: string;
    quantity: number;
    reason?: string;
    status?: string;
  }): Promise<PartReturn> {
    return prisma.partReturn.create({ data });
  }

  // ── Inter-Branch Transfers ─────────────────────────────────────────────

  async createTransfer(data: {
    transferNumber: string;
    requestingBranchId: string;
    sourceBranchId: string;
    requestedById: string;
    status?: string;
    notes?: string;
  }): Promise<InterBranchTransfer> {
    return prisma.interBranchTransfer.create({
      data: {
        transferNumber: data.transferNumber,
        requestingBranchId: data.requestingBranchId,
        sourceBranchId: data.sourceBranchId,
        requestedById: data.requestedById,
        status: data.status ?? 'Pending',
        notes: data.notes,
      },
      include: {
        requestingBranch: true,
        sourceBranch: true,
        requestedBy: { select: { id: true, firstName: true, lastName: true } },
        items: { include: { part: true } },
      },
    });
  }

  async findTransferById(id: string): Promise<InterBranchTransfer | null> {
    return prisma.interBranchTransfer.findUnique({
      where: { id },
      include: {
        requestingBranch: true,
        sourceBranch: true,
        requestedBy: { select: { id: true, firstName: true, lastName: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
        dispatchedBy: { select: { id: true, firstName: true, lastName: true } },
        receivedBy: { select: { id: true, firstName: true, lastName: true } },
        items: { include: { part: true } },
      },
    });
  }

  async listTransfers(filters?: {
    status?: string;
    requestingBranchId?: string;
    sourceBranchId?: string;
  }): Promise<InterBranchTransfer[]> {
    return prisma.interBranchTransfer.findMany({
      where: {
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.requestingBranchId ? { requestingBranchId: filters.requestingBranchId } : {}),
        ...(filters?.sourceBranchId ? { sourceBranchId: filters.sourceBranchId } : {}),
      },
      include: {
        requestingBranch: true,
        sourceBranch: true,
        requestedBy: { select: { id: true, firstName: true, lastName: true } },
        items: { include: { part: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTransferItem(data: {
    transferId: string;
    partId: string;
    requestedQuantity: number;
  }): Promise<InterBranchTransferItem> {
    return prisma.interBranchTransferItem.create({ data });
  }

  async findTransferItems(transferId: string): Promise<InterBranchTransferItem[]> {
    return prisma.interBranchTransferItem.findMany({
      where: { transferId },
      include: { part: true },
    });
  }

  async updateTransferStatus(
    id: string,
    data: {
      status: string;
      approvedById?: string;
      dispatchedById?: string;
      receivedById?: string;
      approvedAt?: Date;
      dispatchedAt?: Date;
      receivedAt?: Date;
      notes?: string;
    },
  ): Promise<InterBranchTransfer> {
    return prisma.interBranchTransfer.update({
      where: { id },
      data: {
        status: data.status,
        approvedById: data.approvedById,
        dispatchedById: data.dispatchedById,
        receivedById: data.receivedById,
        approvedAt: data.approvedAt,
        dispatchedAt: data.dispatchedAt,
        receivedAt: data.receivedAt,
        notes: data.notes,
      },
      include: {
        requestingBranch: true,
        sourceBranch: true,
        requestedBy: { select: { id: true, firstName: true, lastName: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
        dispatchedBy: { select: { id: true, firstName: true, lastName: true } },
        receivedBy: { select: { id: true, firstName: true, lastName: true } },
        items: { include: { part: true } },
      },
    });
  }

  async updateTransferItemsDispatched(
    items: { id: string; dispatchedQuantity: number }[],
  ): Promise<void> {
    for (const item of items) {
      await prisma.interBranchTransferItem.update({
        where: { id: item.id },
        data: { dispatchedQuantity: item.dispatchedQuantity },
      });
    }
  }

  async updateTransferItemsReceived(
    items: { id: string; receivedQuantity: number }[],
  ): Promise<void> {
    for (const item of items) {
      await prisma.interBranchTransferItem.update({
        where: { id: item.id },
        data: { receivedQuantity: item.receivedQuantity },
      });
    }
  }

  async getNextTransferNumber(): Promise<string> {
    const last = await prisma.interBranchTransfer.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { transferNumber: true },
    });
    const num = last ? parseInt(last.transferNumber.replace('TRF-', ''), 10) + 1 : 1;
    return `TRF-${String(num).padStart(5, '0')}`;
  }
}

export default InventoryRepository;

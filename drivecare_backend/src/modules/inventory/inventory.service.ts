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
    stock?: number;
    minimumStock?: number;
  }) {
    const existing = await prisma.sparePart.findUnique({ where: { partNumber: data.partNumber } });
    if (existing) {
      throw new ConflictError('A spare part with this part number already exists');
    }

    return this.inventoryRepository.createSparePart({
      partNumber: data.partNumber,
      name: data.name,
      description: data.description,
      category: data.category,
      unitPrice: data.unitPrice,
      stock: data.stock,
      minimumStock: data.minimumStock,
    });
  }

  async updateSparePart(id: string, data: {
    name?: string;
    description?: string;
    category?: string;
    unitPrice?: number;
    stock?: number;
    minimumStock?: number;
  }) {
    const part = await this.inventoryRepository.findSparePartById(id);
    if (!part) {
      throw new NotFoundError('Spare part not found');
    }

    return this.inventoryRepository.updateSparePart(id, {
      name: data.name,
      description: data.description,
      category: data.category,
      unitPrice: data.unitPrice,
      stock: data.stock,
      minimumStock: data.minimumStock,
    });
  }

  async deleteSparePart(id: string) {
    const part = await this.inventoryRepository.findSparePartById(id);
    if (!part) {
      throw new NotFoundError('Spare part not found');
    }

    return this.inventoryRepository.deleteSparePart(id);
  }

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

  async createPartIssuance(data: {
    sparePartId: string;
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

    if (sparePart.stock < data.quantity) {
      throw new BadRequestError('Insufficient stock for spare part issuance');
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

    await this.inventoryRepository.decrementSparePartStock(data.sparePartId, data.quantity);
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

    await this.inventoryRepository.incrementSparePartStock(issuance.sparePartId, data.quantity);
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
}

export default InventoryService;

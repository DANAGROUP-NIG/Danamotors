import prisma from '../../prisma/client';
import {
  SparePart,
  PurchaseRequest,
  PartIssuance,
  PartReturn,
} from '@prisma/client';

export class InventoryRepository {
  async listSpareParts(): Promise<SparePart[]> {
    return prisma.sparePart.findMany({ orderBy: { updatedAt: 'desc' } });
  }

  async findSparePartById(id: string): Promise<SparePart | null> {
    return prisma.sparePart.findUnique({ where: { id } });
  }

  async createSparePart(data: {
    partNumber: string;
    name: string;
    description?: string;
    category?: string;
    unitPrice?: number;
    stock?: number;
    minimumStock?: number;
  }): Promise<SparePart> {
    return prisma.sparePart.create({ data });
  }

  async updateSparePart(id: string, data: Partial<SparePart>): Promise<SparePart> {
    return prisma.sparePart.update({ where: { id }, data });
  }

  async deleteSparePart(id: string): Promise<SparePart> {
    return prisma.sparePart.delete({ where: { id } });
  }

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

  async decrementSparePartStock(sparePartId: string, quantity: number) {
    return prisma.sparePart.update({
      where: { id: sparePartId },
      data: { stock: { decrement: quantity } },
    });
  }

  async incrementSparePartStock(sparePartId: string, quantity: number) {
    return prisma.sparePart.update({
      where: { id: sparePartId },
      data: { stock: { increment: quantity } },
    });
  }
}

export default InventoryRepository;

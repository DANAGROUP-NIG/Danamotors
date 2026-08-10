import prisma from '../../prisma/client';

export class WorkshopRepository {
  async findJobCardById(id: string) {
    return prisma.jobCard.findUnique({
      where: { id },
      include: {
        appointment: true,
        branch: true,
        customer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        vehicle: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        technician: {
          select: { id: true, firstName: true, lastName: true },
        },
        qualityInspector: {
          select: { id: true, firstName: true, lastName: true },
        },
        inspections: true,
        estimates: {
          include: {
            approvals: true,
          },
        },
        partIssuances: {
          include: {
            sparePart: {
              select: { id: true, partNumber: true, name: true, unitPrice: true },
            },
            issuedBy: {
              select: { id: true, firstName: true, lastName: true },
            },
            returns: true,
          },
        },
        invoices: {
          include: {
            payments: true,
            receipts: true,
          },
        },
      },
    });
  }

  async assignTechnician(id: string, technicianId: string, qualityInspectorId?: string) {
    return prisma.jobCard.update({
      where: { id },
      data: {
        technicianId,
        qualityInspectorId,
      },
    });
  }

  async updateProgress(id: string, progress: number, status?: string) {
    return prisma.jobCard.update({
      where: { id },
      data: {
        progress,
        status,
      },
    });
  }

  async updateQC(id: string, qcStatus: string, qcNotes?: string) {
    return prisma.jobCard.update({
      where: { id },
      data: {
        qcStatus,
        qcNotes,
      },
    });
  }

  async listTechnicians(params: {
    skip?: number;
    take?: number;
    branchId?: string;
    search?: string;
  }) {
    const where: Record<string, unknown> = {
      role: { is: { name: 'Technician' } },
    };

    if (params.branchId) {
      where.branchId = params.branchId;
    }

    if (params.search) {
      where.OR = [
        { firstName: { contains: params.search, mode: 'insensitive' } },
        { lastName: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    return prisma.user.findMany({
      where,
      skip: params.skip,
      take: params.take,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        isActive: true,
        branchId: true,
        branch: { select: { id: true, name: true } },
        createdAt: true,
        _count: {
          select: {
            technicianAssignments: {
              where: { status: { notIn: ['Completed', 'Cancelled'] } },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

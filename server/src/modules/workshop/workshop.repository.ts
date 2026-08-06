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
}

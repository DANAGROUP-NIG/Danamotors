import prisma from '../../prisma/client';

export class WorkshopRepository {
  async findJobCardById(id: string) {
    return prisma.jobCard.findUnique({
      where: { id },
      include: {
        appointment: true,
        customer: {
          select: {
            id: true,
            user: {
              select: { email: true, firstName: true, lastName: true },
            },
          },
        },
        vehicle: true,
        inspections: true,
        estimates: true,
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

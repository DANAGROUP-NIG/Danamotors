import prisma from '../../prisma/client';
import {
  ServiceAppointment,
  JobCard,
  Inspection,
  Estimate,
  CustomerApproval,
} from '@prisma/client';

export class ServiceRepository {
  async createAppointment(data: {
    customerId: string;
    vehicleId: string;
    branchId: string;
    createdById?: string;
    scheduledAt: Date;
    durationMins?: number;
    notes?: string;
    status?: string;
  }): Promise<ServiceAppointment> {
    return prisma.serviceAppointment.create({ data });
  }

  async listAppointments(params: {
    skip: number;
    take: number;
    search?: string;
    branchId?: string;
    status?: string;
    createdById?: string;
    customerId?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const where: Record<string, unknown> = {};

    if (params.branchId) {
      where.branchId = params.branchId;
    }

    if (params.status) {
      where.status = params.status;
    }

    if (params.createdById) {
      where.createdById = params.createdById;
    }

    if (params.customerId) {
      where.customerId = params.customerId;
    }

    const scheduledAtFilter: Record<string, Date> = {};
    if (params.dateFrom) {
      scheduledAtFilter.gte = new Date(`${params.dateFrom}T00:00:00`);
    }
    if (params.dateTo) {
      scheduledAtFilter.lte = new Date(`${params.dateTo}T23:59:59.999`);
    }
    if (Object.keys(scheduledAtFilter).length > 0) {
      where.scheduledAt = scheduledAtFilter;
    }

    if (params.search) {
      where.OR = [
        { notes: { contains: params.search, mode: 'insensitive' } },
        { customer: { firstName: { contains: params.search, mode: 'insensitive' } } },
        { customer: { lastName: { contains: params.search, mode: 'insensitive' } } },
        { customer: { email: { contains: params.search, mode: 'insensitive' } } },
      ];
    }

    const [appointments, total] = await Promise.all([
      prisma.serviceAppointment.findMany({
        where,
        skip: params.skip,
        take: params.take,
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phoneNumber: true,
            },
          },
          vehicle: true,
          branch: { select: { id: true, name: true } },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          jobCards: true,
        },
        orderBy: { scheduledAt: 'desc' },
      }),
      prisma.serviceAppointment.count({ where }),
    ]);

    return { appointments, total };
  }

  async findAppointmentById(id: string) {
    return prisma.serviceAppointment.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true,
          },
        },
        vehicle: true,
        branch: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        jobCards: true,
      },
    });
  }

  async updateAppointment(id: string, data: Partial<ServiceAppointment>): Promise<ServiceAppointment> {
    return prisma.serviceAppointment.update({
      where: { id },
      data,
    });
  }

  async deleteAppointment(id: string): Promise<void> {
    await prisma.serviceAppointment.delete({ where: { id } });
  }

  async createJobCard(data: {
    appointmentId?: string;
    customerId?: string;
    vehicleId?: string;
    branchId: string;
    jobNumber: string;
    description: string;
    status?: string;
    estimatedHours?: number;
    estimatedCost?: number;
    assignedTo?: string;
    createdById?: string;
  }): Promise<JobCard> {
    return prisma.jobCard.create({ data });
  }

  async listJobCards(params?: {
    skip?: number;
    take?: number;
    branchId?: string;
    customerId?: string;
    search?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const where: Record<string, unknown> = {};

    if (params?.branchId) {
      where.branchId = params.branchId;
    }

    if (params?.customerId) {
      where.customerId = params.customerId;
    }

    if (params?.status) {
      where.status = params.status;
    }

    if (params?.search) {
      where.OR = [
        { jobNumber: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
        { customer: { firstName: { contains: params.search, mode: 'insensitive' } } },
        { customer: { lastName: { contains: params.search, mode: 'insensitive' } } },
        { vehicle: { make: { contains: params.search, mode: 'insensitive' } } },
        { vehicle: { model: { contains: params.search, mode: 'insensitive' } } },
        { vehicle: { vin: { contains: params.search, mode: 'insensitive' } } },
        { vehicle: { registrationNumber: { contains: params.search, mode: 'insensitive' } } },
      ];
    }

    const createdAtFilter: Record<string, Date> = {};
    if (params?.dateFrom) createdAtFilter.gte = new Date(params.dateFrom);
    if (params?.dateTo) createdAtFilter.lte = new Date(params.dateTo);
    if (Object.keys(createdAtFilter).length > 0) where.createdAt = createdAtFilter;

    return prisma.jobCard.findMany({
      where,
      skip: params?.skip,
      take: params?.take,
      include: {
        appointment: true,
        branch: true,
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        vehicle: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        inspections: true,
        estimates: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findJobCardById(id: string) {
    return prisma.jobCard.findUnique({
      where: { id },
      include: {
        appointment: true,
        branch: true,
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
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

  async updateJobCard(id: string, data: Partial<JobCard>): Promise<JobCard> {
    return prisma.jobCard.update({
      where: { id },
      data,
    });
  }

  async addInspection(data: {
    jobCardId: string;
    inspectorId?: string;
    findings: string;
    passed?: boolean;
    status?: string;
    notes?: string;
  }): Promise<Inspection> {
    return prisma.inspection.create({ data });
  }

  async addEstimate(data: {
    jobCardId: string;
    description: string;
    amount: number;
    currency?: string;
    status?: string;
  }): Promise<Estimate> {
    return prisma.estimate.create({ data });
  }

  async addApproval(data: {
    estimateId: string;
    customerId: string;
    approved?: boolean;
    decisionDate?: Date;
    comments?: string;
    status?: string;
  }): Promise<CustomerApproval> {
    return prisma.customerApproval.create({ data });
  }

  async getApprovals(estimateId: string): Promise<CustomerApproval[]> {
    return prisma.customerApproval.findMany({
      where: { estimateId },
    });
  }

  async listInspections(params: {
    skip?: number;
    take?: number;
    branchId?: string;
    status?: string;
    search?: string;
  }) {
    const where: Record<string, unknown> = {};

    if (params.branchId) {
      where.jobCard = { branchId: params.branchId };
    }

    if (params.status) {
      where.status = params.status;
    }

    if (params.search) {
      where.OR = [
        { findings: { contains: params.search, mode: 'insensitive' } },
        { notes: { contains: params.search, mode: 'insensitive' } },
        { jobCard: { jobNumber: { contains: params.search, mode: 'insensitive' } } },
        { jobCard: { customer: { firstName: { contains: params.search, mode: 'insensitive' } } } },
        { jobCard: { customer: { lastName: { contains: params.search, mode: 'insensitive' } } } },
      ];
    }

    return prisma.inspection.findMany({
      where,
      skip: params.skip,
      take: params.take,
      include: {
        jobCard: {
          select: {
            id: true,
            jobNumber: true,
            status: true,
            branchId: true,
            branch: { select: { id: true, name: true } },
            customer: {
              select: { id: true, firstName: true, lastName: true },
            },
            vehicle: {
              select: {
                id: true,
                make: true,
                model: true,
                registrationNumber: true,
                vin: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listEstimates(params: {
    skip?: number;
    take?: number;
    branchId?: string;
    status?: string;
    search?: string;
  }) {
    const where: Record<string, unknown> = {};

    if (params.branchId) {
      where.jobCard = { branchId: params.branchId };
    }

    if (params.status) {
      where.status = params.status;
    }

    if (params.search) {
      where.OR = [
        { description: { contains: params.search, mode: 'insensitive' } },
        { jobCard: { jobNumber: { contains: params.search, mode: 'insensitive' } } },
        { jobCard: { customer: { firstName: { contains: params.search, mode: 'insensitive' } } } },
        { jobCard: { customer: { lastName: { contains: params.search, mode: 'insensitive' } } } },
      ];
    }

    return prisma.estimate.findMany({
      where,
      skip: params.skip,
      take: params.take,
      include: {
        jobCard: {
          select: {
            id: true,
            jobNumber: true,
            branchId: true,
            branch: { select: { id: true, name: true } },
            customer: {
              select: { id: true, firstName: true, lastName: true },
            },
            vehicle: {
              select: {
                id: true,
                make: true,
                model: true,
                registrationNumber: true,
                vin: true,
              },
            },
          },
        },
        approvals: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

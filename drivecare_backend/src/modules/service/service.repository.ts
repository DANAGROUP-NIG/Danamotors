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
    scheduledAt: Date;
    durationMins?: number;
    notes?: string;
    status?: string;
  }): Promise<ServiceAppointment> {
    return prisma.serviceAppointment.create({ data });
  }

  async listAppointments() {
    return prisma.serviceAppointment.findMany({
      include: {
        customer: {
          select: {
            id: true,
            user: {
              select: { email: true, firstName: true, lastName: true },
            },
          },
        },
        vehicle: true,
        jobCards: true,
      },
      orderBy: { scheduledAt: 'desc' },
    });
  }

  async findAppointmentById(id: string) {
    return prisma.serviceAppointment.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            user: {
              select: { email: true, firstName: true, lastName: true },
            },
          },
        },
        vehicle: true,
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

  async createJobCard(data: {
    appointmentId?: string;
    customerId?: string;
    vehicleId?: string;
    jobNumber: string;
    description: string;
    status?: string;
    estimatedHours?: number;
    estimatedCost?: number;
    assignedTo?: string;
  }): Promise<JobCard> {
    return prisma.jobCard.create({ data });
  }

  async listJobCards() {
    return prisma.jobCard.findMany({
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
      orderBy: { createdAt: 'desc' },
    });
  }

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
}

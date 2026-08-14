import prisma from '../../prisma/client';
import {
  Vehicle,
  JobCard,
  ServiceAppointment,
  Invoice,
} from '@prisma/client';

export type VehicleWithJobs = Vehicle & {
  images: { id: string; url: string; type: string | null }[];
  jobCards: JobCard[];
};

export type JobCardWithRelations = JobCard & {
  vehicle: { id: string; make: string | null; model: string | null; year: number | null; registrationNumber: string | null } | null;
  branch: { id: string; name: string };
  technician: { id: string; firstName: string; lastName: string } | null;
  estimates: {
    id: string;
    description: string;
    amount: number;
    currency: string;
    status: string;
    createdAt: Date;
    approvals: { id: string; approved: boolean | null; decisionDate: Date | null; comments: string | null; status: string }[];
  }[];
  invoices: { id: string; invoiceNumber: string; status: string; total: number; issuedDate: Date }[];
  inspections: { id: string; findings: string; status: string; passed: boolean | null }[];
};

export class PortalRepository {
  async findCustomerProfile(customerId: string) {
    return prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        branch: { select: { id: true, name: true, city: true, state: true } },
      },
    });
  }

  async listVehicles(customerId: string): Promise<VehicleWithJobs[]> {
    return prisma.vehicle.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: {
        images: { select: { id: true, url: true, type: true } },
        jobCards: { orderBy: { createdAt: 'desc' } },
      },
    }) as Promise<VehicleWithJobs[]>;
  }

  async findVehicle(customerId: string, vehicleId: string): Promise<VehicleWithJobs | null> {
    return prisma.vehicle.findFirst({
      where: { id: vehicleId, customerId },
      include: {
        images: { select: { id: true, url: true, type: true } },
        jobCards: { orderBy: { createdAt: 'desc' } },
      },
    }) as Promise<VehicleWithJobs | null>;
  }

  async listJobCards(
    customerId: string,
    filters: { status?: string; vehicleId?: string },
  ): Promise<JobCardWithRelations[]> {
    return prisma.jobCard.findMany({
      where: {
        customerId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.vehicleId ? { vehicleId: filters.vehicleId } : {}),
      },
      include: {
        vehicle: {
          select: {
            id: true,
            make: true,
            model: true,
            year: true,
            registrationNumber: true,
          },
        },
        branch: { select: { id: true, name: true } },
        technician: { select: { id: true, firstName: true, lastName: true } },
        estimates: {
          orderBy: { createdAt: 'desc' },
          include: {
            approvals: {
              select: {
                id: true,
                approved: true,
                decisionDate: true,
                comments: true,
                status: true,
              },
            },
          },
        },
        invoices: {
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            total: true,
            issuedDate: true,
          },
        },
        inspections: {
          select: { id: true, findings: true, status: true, passed: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    }) as Promise<JobCardWithRelations[]>;
  }

  async findJobCard(
    customerId: string,
    jobCardId: string,
  ): Promise<JobCardWithRelations | null> {
    return prisma.jobCard.findFirst({
      where: { id: jobCardId, customerId },
      include: {
        vehicle: {
          select: {
            id: true,
            make: true,
            model: true,
            year: true,
            registrationNumber: true,
            color: true,
            vin: true,
          },
        },
        branch: { select: { id: true, name: true } },
        technician: { select: { id: true, firstName: true, lastName: true } },
        estimates: {
          orderBy: { createdAt: 'desc' },
          include: {
            approvals: {
              select: {
                id: true,
                approved: true,
                decisionDate: true,
                comments: true,
                status: true,
              },
            },
          },
        },
        invoices: {
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            total: true,
            issuedDate: true,
          },
        },
        inspections: {
          select: { id: true, findings: true, status: true, passed: true, notes: true },
        },
      },
    }) as Promise<JobCardWithRelations | null>;
  }

  async listAppointments(customerId: string): Promise<ServiceAppointment[]> {
    return prisma.serviceAppointment.findMany({
      where: { customerId },
      include: {
        vehicle: {
          select: {
            id: true,
            make: true,
            model: true,
            year: true,
            registrationNumber: true,
          },
        },
        branch: { select: { id: true, name: true } },
        service: {
          select: {
            id: true,
            name: true,
            category: true,
            description: true,
            durationMins: true,
            price: true,
          },
        },
      },
      orderBy: { scheduledAt: 'desc' },
    }) as Promise<ServiceAppointment[]>;
  }

  async listServices() {
    return prisma.service.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        durationMins: true,
        price: true,
        isActive: true,
      },
    });
  }

  async listInvoices(customerId: string): Promise<Invoice[]> {
    return prisma.invoice.findMany({
      where: { customerId },
      include: {
        jobCard: {
          include: {
            vehicle: {
              select: {
                id: true,
                make: true,
                model: true,
                year: true,
                registrationNumber: true,
              },
            },
          },
        },
        payments: true,
        receipts: true,
        creditApplications: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            amount: true,
            status: true,
            comments: true,
            decisionDate: true,
            createdAt: true,
          },
        },
      },
      orderBy: { issuedDate: 'desc' },
    }) as Promise<Invoice[]>;
  }

  async findInvoice(customerId: string, invoiceId: string): Promise<Invoice | null> {
    return prisma.invoice.findFirst({
      where: { id: invoiceId, customerId },
      include: {
        jobCard: {
          include: {
            vehicle: {
              select: {
                id: true,
                make: true,
                model: true,
                year: true,
                registrationNumber: true,
              },
            },
          },
        },
        payments: true,
        receipts: true,
        creditApplications: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            amount: true,
            status: true,
            comments: true,
            decisionDate: true,
            createdAt: true,
          },
        },
      },
    }) as Promise<Invoice | null>;
  }
}

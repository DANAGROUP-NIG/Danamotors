import bcrypt from 'bcryptjs';
import prisma from "../../prisma/client";
import { PortalRepository, JobCardWithRelations } from "./portal.repository";
import { NotFoundError, BadRequestError, UnauthorizedError } from "../../shared/errors/appError";
import { NotificationService } from "../notification/notification.service";
import { ROLES } from "../../shared/constants/roles";
import { VehicleService } from "../vehicle/vehicle.service";
import { ServiceService } from "../service/service.service";
import { CreditService } from "../credit/credit.service";

export class PortalService {
  private portalRepository: PortalRepository;

  constructor() {
    this.portalRepository = new PortalRepository();
  }

  async getMe(customerId: string) {
    const customer = await this.portalRepository.findCustomerProfile(customerId);
    if (!customer) {
      throw new UnauthorizedError("Customer session not found");
    }

    return {
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phoneNumber: customer.phoneNumber,
      address: customer.address,
      city: customer.city,
      state: customer.state,
      postalCode: customer.postalCode,
      country: customer.country,
      preferredContactMethod: customer.preferredContactMethod,
      creditBalance: customer.creditBalance,
      branch: customer.branch,
      createdAt: customer.createdAt,
    };
  }

  async updateProfile(customerId: string, data: {
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    preferredContactMethod?: string;
  }) {
    const customer = await this.portalRepository.findCustomerProfile(customerId);
    if (!customer) {
      throw new UnauthorizedError("Customer session not found");
    }

    const updated = await prisma.customer.update({
      where: { id: customerId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: data.phoneNumber,
        address: data.address,
        city: data.city,
        state: data.state,
        postalCode: data.postalCode,
        country: data.country,
        preferredContactMethod: data.preferredContactMethod,
      },
      include: { branch: { select: { id: true, name: true, city: true, state: true } } },
    });

    return {
      id: updated.id,
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.email,
      phoneNumber: updated.phoneNumber,
      address: updated.address,
      city: updated.city,
      state: updated.state,
      postalCode: updated.postalCode,
      country: updated.country,
      preferredContactMethod: updated.preferredContactMethod,
      branch: updated.branch,
      createdAt: updated.createdAt,
    };
  }

  async changePassword(customerId: string, data: { currentPassword: string; newPassword: string }) {
    const account = await prisma.customerAccount.findUnique({ where: { customerId } });
    if (!account) {
      throw new BadRequestError("No portal account exists for this customer");
    }

    const isPasswordValid = await bcrypt.compare(data.currentPassword, account.passwordHash);
    if (!isPasswordValid) {
      throw new BadRequestError("Current password is incorrect");
    }

    const passwordHash = await bcrypt.hash(data.newPassword, 10);
    await prisma.customerAccount.update({
      where: { customerId },
      data: { passwordHash },
    });

    // Invalidate all existing sessions after a password change.
    await prisma.customerRefreshToken.deleteMany({ where: { customerAccountId: account.id } });

    return { success: true };
  }

  async getDashboard(customerId: string) {
    const activeStatuses = ["Open", "In Progress"];
    const pendingStatuses = ["Pending", "Confirmed"];

    const [
      vehicleCount,
      activeJobCount,
      completedJobCount,
      upcomingAppointments,
      outstandingAgg,
      recentJobCards,
      recentInvoices,
      creditAgg,
      pendingCreditCount,
    ] = await Promise.all([
      prisma.vehicle.count({ where: { customerId } }),
      prisma.jobCard.count({
        where: { customerId, status: { in: activeStatuses } },
      }),
      prisma.jobCard.count({
        where: { customerId, status: { in: ["Completed", "Closed"] } },
      }),
      prisma.serviceAppointment.count({
        where: {
          customerId,
          scheduledAt: { gte: new Date() },
          status: { in: pendingStatuses },
        },
      }),
      prisma.invoice.aggregate({
        where: { customerId, status: { in: ["Unpaid", "Partially Paid"] } },
        _sum: { total: true },
      }),
      prisma.jobCard.findMany({
        where: { customerId },
        orderBy: { createdAt: "desc" },
        take: 5,
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
          branch: { select: { name: true } },
        },
      }),
      prisma.invoice.findMany({
        where: { customerId },
        orderBy: { issuedDate: "desc" },
        take: 5,
        include: {
          jobCard: {
            include: {
              vehicle: {
                select: {
                  id: true,
                  make: true,
                  model: true,
                  registrationNumber: true,
                },
              },
            },
          },
          payments: true,
        },
      }),
      prisma.customer.findUnique({
        where: { id: customerId },
        select: { creditBalance: true },
      }),
      prisma.customerCreditApplication.count({
        where: { customerId, status: "Pending" },
      }),
    ]);

    return {
      vehicleCount,
      activeJobCount,
      completedJobCount,
      upcomingAppointments,
      outstandingTotal: outstandingAgg._sum.total ?? 0,
      creditBalance: creditAgg?.creditBalance ?? 0,
      pendingCreditCount,
      recentJobCards,
      recentInvoices,
    };
  }

  async registerVehicle(customerId: string, data: {
    vin: string;
    registrationNumber?: string;
    make?: string;
    model?: string;
    year?: number;
    trim?: string;
    color?: string;
    warrantyStatus?: string;
    ownershipStatus?: string;
  }) {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new UnauthorizedError("Customer session not found");
    }

    const vehicleService = new VehicleService();
    const vehicle = await vehicleService.createVehicle({
      customerId,
      vin: data.vin,
      registrationNumber: data.registrationNumber,
      make: data.make,
      model: data.model,
      year: data.year,
      trim: data.trim,
      color: data.color,
      warrantyStatus: data.warrantyStatus,
      ownershipStatus: data.ownershipStatus,
    });

    const notificationService = new NotificationService();
    await notificationService.notifyRole(ROLES.SERVICE_ADVISOR, customer.branchId, {
      type: "VEHICLE_REGISTERED",
      title: "Vehicle registered",
      message: `${customer.firstName} ${customer.lastName} registered a vehicle${vehicle.vin ? ` (VIN ${vehicle.vin})` : ""} on the customer portal.`,
      link: `/vehicles/${vehicle.id}`,
    });

    return vehicle;
  }

  async bookAppointment(customerId: string, data: {
    vehicleId: string;
    serviceId: string;
    scheduledAt: string;
    durationMins?: number;
    notes?: string;
  }) {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new UnauthorizedError("Customer session not found");
    }

    const vehicle = await prisma.vehicle.findUnique({ where: { id: data.vehicleId } });
    if (!vehicle || vehicle.customerId !== customerId) {
      throw new NotFoundError("Vehicle not found");
    }

    const branch = await prisma.branch.findUnique({ where: { id: customer.branchId } });
    if (!branch) {
      throw new NotFoundError("Branch not found");
    }

    const serviceService = new ServiceService();
    const created = await serviceService.createAppointment({
      customerId,
      vehicleId: data.vehicleId,
      branchName: branch.name,
      serviceId: data.serviceId,
      scheduledAt: data.scheduledAt,
      durationMins: data.durationMins,
      notes: data.notes,
    });

    return prisma.serviceAppointment.findUnique({
      where: { id: created.id },
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
    });
  }

  async getServices() {
    return this.portalRepository.listServices();
  }

  async getVehicles(customerId: string) {
    const vehicles = await this.portalRepository.listVehicles(customerId);
    return vehicles.map((vehicle) => {
      const latestJob = vehicle.jobCards[0] ?? null;
      return {
        id: vehicle.id,
        vin: vehicle.vin,
        registrationNumber: vehicle.registrationNumber,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        trim: vehicle.trim,
        color: vehicle.color,
        warrantyStatus: vehicle.warrantyStatus,
        ownershipStatus: vehicle.ownershipStatus,
        images: vehicle.images,
        latestJobCard: latestJob
          ? {
              id: latestJob.id,
              jobNumber: latestJob.jobNumber,
              status: latestJob.status,
              progress: latestJob.progress,
              description: latestJob.description,
              createdAt: latestJob.createdAt,
            }
          : null,
        jobCardCount: vehicle.jobCards.length,
      };
    });
  }

  async getVehicle(customerId: string, vehicleId: string) {
    const vehicle = await this.portalRepository.findVehicle(customerId, vehicleId);
    if (!vehicle) {
      throw new NotFoundError("Vehicle not found");
    }

    return {
      id: vehicle.id,
      vin: vehicle.vin,
      registrationNumber: vehicle.registrationNumber,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      trim: vehicle.trim,
      color: vehicle.color,
      warrantyProvider: vehicle.warrantyProvider,
      warrantyStatus: vehicle.warrantyStatus,
      warrantyExpiresAt: vehicle.warrantyExpiresAt,
      ownershipStatus: vehicle.ownershipStatus,
      images: vehicle.images,
      jobCards: vehicle.jobCards.map((jobCard) => ({
        id: jobCard.id,
        jobNumber: jobCard.jobNumber,
        status: jobCard.status,
        progress: jobCard.progress,
        description: jobCard.description,
        estimatedCost: jobCard.estimatedCost,
        createdAt: jobCard.createdAt,
        updatedAt: jobCard.updatedAt,
      })),
    };
  }

  async getJobCards(customerId: string, filters: { status?: string; vehicleId?: string }) {
    const jobCards = await this.portalRepository.listJobCards(customerId, filters);
    return jobCards.map((jobCard) => this.mapJobCard(jobCard));
  }

  async getJobCard(customerId: string, jobCardId: string) {
    const jobCard = await this.portalRepository.findJobCard(customerId, jobCardId);
    if (!jobCard) {
      throw new NotFoundError("Job card not found");
    }
    return this.mapJobCard(jobCard);
  }

  private mapJobCard(jobCard: JobCardWithRelations) {
    return {
      id: jobCard.id,
      jobNumber: jobCard.jobNumber,
      description: jobCard.description,
      status: jobCard.status,
      estimatedHours: jobCard.estimatedHours,
      estimatedCost: jobCard.estimatedCost,
      progress: jobCard.progress,
      qcStatus: jobCard.qcStatus,
      assignedTo: jobCard.assignedTo,
      createdAt: jobCard.createdAt,
      updatedAt: jobCard.updatedAt,
      vehicle: jobCard.vehicle,
      branch: jobCard.branch,
      technician: jobCard.technician,
      estimates: jobCard.estimates,
      invoices: jobCard.invoices,
      inspections: jobCard.inspections,
    };
  }

  async getAppointments(customerId: string) {
    return this.portalRepository.listAppointments(customerId);
  }

  async getInvoices(customerId: string) {
    return this.portalRepository.listInvoices(customerId);
  }

  async getInvoice(customerId: string, invoiceId: string) {
    const invoice = await this.portalRepository.findInvoice(customerId, invoiceId);
    if (!invoice) {
      throw new NotFoundError("Invoice not found");
    }
    return invoice;
  }

  // Customer approves/rejects an estimate on their own job card.
  async submitEstimateApproval(customerId: string, estimateId: string, data: {
    approved: boolean;
    comments?: string;
  }) {
    const estimate = await prisma.estimate.findUnique({
      where: { id: estimateId },
      include: {
        jobCard: {
          select: { id: true, customerId: true, branchId: true, jobNumber: true },
        },
      },
    });

    if (!estimate || estimate.jobCard.customerId !== customerId) {
      throw new NotFoundError("Estimate not found");
    }

    const decisionDate = new Date();
    const status = data.approved ? "Approved" : "Rejected";

    const existing = await prisma.customerApproval.findFirst({
      where: { estimateId, customerId },
    });

    if (existing) {
      await prisma.customerApproval.update({
        where: { id: existing.id },
        data: {
          approved: data.approved,
          decisionDate,
          comments: data.comments,
          status,
        },
      });
    } else {
      await prisma.customerApproval.create({
        data: {
          estimateId,
          customerId,
          approved: data.approved,
          decisionDate,
          comments: data.comments,
          status,
        },
      });
    }

    await prisma.estimate.update({
      where: { id: estimateId },
      data: { status },
    });

    const notificationService = new NotificationService();
    await notificationService.notifyRole(
      ROLES.SERVICE_ADVISOR,
      estimate.jobCard.branchId,
      {
        type: "ESTIMATE_DECISION",
        title: data.approved ? "Estimate approved" : "Estimate rejected",
        message: `Customer ${data.approved ? "approved" : "rejected"} the estimate on job card ${estimate.jobCard.jobNumber}.`,
        link: `/job-cards/${estimate.jobCard.id}`,
      },
    );

    return {
      estimateId,
      jobCardId: estimate.jobCard.id,
      status,
      decisionDate,
    };
  }

  async getCredit(customerId: string) {
    const creditService = new CreditService();
    return creditService.getCustomerCredit(customerId);
  }

  async getCreditApplications(customerId: string) {
    return prisma.customerCreditApplication.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            total: true,
            status: true,
          },
        },
        requestedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
  }

  async decideCreditApplication(
    customerId: string,
    applicationId: string,
    data: { approved: boolean; comments?: string },
  ) {
    const creditService = new CreditService();
    return creditService.decideApplication(customerId, applicationId, data);
  }
}

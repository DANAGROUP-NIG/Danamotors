import prisma from '../../prisma/client';
import { ServiceRepository } from './service.repository';
import { NotFoundError, ConflictError } from '../../shared/errors/appError';
import { ROLES } from '../../shared/constants/roles';
import { NotificationService } from '../notification/notification.service';

export class ServiceService {
  private serviceRepository: ServiceRepository;

  constructor() {
    this.serviceRepository = new ServiceRepository();
  }

  async createAppointment(data: {
    customerId: string;
    vehicleId: string;
    branchName: string;
    scheduledAt: string;
    durationMins?: number;
    notes?: string;
    status?: string;
    createdById?: string;
  }) {
    const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
    if (!customer) throw new NotFoundError('Customer not found');

    const vehicle = await prisma.vehicle.findUnique({ where: { id: data.vehicleId } });
    if (!vehicle) throw new NotFoundError('Vehicle not found');

    const branch = await prisma.branch.findUnique({ where: { name: data.branchName } });
    if (!branch) throw new NotFoundError(`Branch '${data.branchName}' does not exist`);

    const activeAppointment = await prisma.serviceAppointment.findFirst({
      where: {
        customerId: data.customerId,
        vehicleId: data.vehicleId,
        status: { notIn: ['Closed', 'Cancelled', 'Completed'] },
      },
    });
    if (activeAppointment) {
      throw new ConflictError(
        `This customer's vehicle already has an active appointment (${activeAppointment.status}). Close, cancel, or complete it before booking another.`,
      );
    }

    const appointment = await this.serviceRepository.createAppointment({
      customerId: data.customerId,
      vehicleId: data.vehicleId,
      branchId: branch.id,
      createdById: data.createdById,
      scheduledAt: new Date(data.scheduledAt),
      durationMins: data.durationMins,
      notes: data.notes,
      status: data.status,
    });

    const notificationService = new NotificationService();
    const appointmentMessage = `${customer.firstName} ${customer.lastName} booked an appointment at ${branch.name} for ${new Date(appointment.scheduledAt).toLocaleString()}.`;
    await notificationService.notifyRole(ROLES.SERVICE_ADVISOR, branch.id, {
      type: 'APPOINTMENT_BOOKED',
      title: 'New appointment booked',
      message: appointmentMessage,
      link: `/appointments/${appointment.id}`,
    });
    await notificationService.notifyRole(ROLES.WORKSHOP_MANAGER, branch.id, {
      type: 'APPOINTMENT_BOOKED',
      title: 'New appointment booked',
      message: appointmentMessage,
      link: `/appointments/${appointment.id}`,
    });

    return appointment;
  }

  async listAppointments(params: {
    page: number;
    limit: number;
    search?: string;
    branchId?: string;
    status?: string;
    createdById?: string;
    customerId?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const skip = (params.page - 1) * params.limit;
    const { appointments, total } = await this.serviceRepository.listAppointments({
      skip,
      take: params.limit,
      search: params.search,
      branchId: params.branchId,
      status: params.status,
      createdById: params.createdById,
      customerId: params.customerId,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
    });

    return {
      appointments,
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  async getAppointment(id: string) {
    const appointment = await this.serviceRepository.findAppointmentById(id);
    if (!appointment) {
      throw new NotFoundError('Appointment not found');
    }

    return appointment;
  }

  async updateAppointment(id: string, data: {
    scheduledAt?: string;
    durationMins?: number;
    notes?: string;
    status?: string;
  }) {
    const appointment = await this.serviceRepository.findAppointmentById(id);
    if (!appointment) {
      throw new NotFoundError('Appointment not found');
    }

    return this.serviceRepository.updateAppointment(id, {
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
      durationMins: data.durationMins,
      notes: data.notes,
      status: data.status,
    });
  }

  async deleteAppointment(id: string) {
    const appointment = await this.serviceRepository.findAppointmentById(id);
    if (!appointment) {
      throw new NotFoundError('Appointment not found');
    }
    await this.serviceRepository.deleteAppointment(id);
  }

  async createJobCard(data: {
    appointmentId?: string;
    customerId?: string;
    vehicleId?: string;
    branchName: string;
    jobNumber: string;
    description: string;
    status?: string;
    estimatedHours?: number;
    estimatedCost?: number;
    assignedTo?: string;
    createdById?: string;
  }) {
    if (data.appointmentId) {
      const appointment = await this.serviceRepository.findAppointmentById(data.appointmentId);
      if (!appointment) throw new NotFoundError('Appointment not found');
    }

    if (data.customerId) {
      const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
      if (!customer) throw new NotFoundError('Customer not found');
    }

    if (data.vehicleId) {
      const vehicle = await prisma.vehicle.findUnique({ where: { id: data.vehicleId } });
      if (!vehicle) throw new NotFoundError('Vehicle not found');
    }

    const branch = await prisma.branch.findUnique({ where: { name: data.branchName } });
    if (!branch) throw new NotFoundError(`Branch '${data.branchName}' does not exist`);

    return this.serviceRepository.createJobCard({
      appointmentId: data.appointmentId,
      customerId: data.customerId,
      vehicleId: data.vehicleId,
      branchId: branch.id,
      jobNumber: data.jobNumber,
      description: data.description,
      status: data.status,
      estimatedHours: data.estimatedHours,
      estimatedCost: data.estimatedCost,
      assignedTo: data.assignedTo,
      createdById: data.createdById,
    });
  }

  async listJobCards(params?: {
    page?: number;
    limit?: number;
    branchId?: string;
    customerId?: string;
    search?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 50;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};
    if (params?.branchId) where.branchId = params.branchId;
    if (params?.customerId) where.customerId = params.customerId;
    if (params?.status) where.status = params.status;

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

    const [jobCards, total] = await Promise.all([
      this.serviceRepository.listJobCards({ skip, take: limit, branchId: params?.branchId, customerId: params?.customerId, search: params?.search, status: params?.status, dateFrom: params?.dateFrom, dateTo: params?.dateTo }),
      prisma.jobCard.count({ where }),
    ]);

    return {
      jobCards,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getJobCard(id: string) {
    const card = await this.serviceRepository.findJobCardById(id);
    if (!card) {
      throw new NotFoundError('Job card not found');
    }

    return card;
  }

  async updateJobCard(id: string, data: {
    appointmentId?: string;
    customerId?: string;
    vehicleId?: string;
    description?: string;
    status?: string;
    estimatedHours?: number;
    estimatedCost?: number;
    assignedTo?: string;
  }) {
    const card = await this.serviceRepository.findJobCardById(id);
    if (!card) {
      throw new NotFoundError('Job card not found');
    }

    return this.serviceRepository.updateJobCard(id, data);
  }

  async addInspection(jobCardId: string, data: {
    inspectorId?: string;
    findings: string;
    passed?: boolean;
    status?: string;
    notes?: string;
  }) {
    const card = await this.serviceRepository.findJobCardById(jobCardId);
    if (!card) {
      throw new NotFoundError('Job card not found');
    }

    return this.serviceRepository.addInspection({
      jobCardId,
      inspectorId: data.inspectorId,
      findings: data.findings,
      passed: data.passed,
      status: data.status,
      notes: data.notes,
    });
  }

  async addEstimate(jobCardId: string, data: {
    description: string;
    amount: number;
    currency?: string;
    status?: string;
  }) {
    const card = await this.serviceRepository.findJobCardById(jobCardId);
    if (!card) {
      throw new NotFoundError('Job card not found');
    }

    const estimate = await this.serviceRepository.addEstimate({
      jobCardId,
      description: data.description,
      amount: data.amount,
      currency: data.currency,
      status: data.status,
    });

    const notificationService = new NotificationService();
    const payload = {
      type: 'ESTIMATE_CREATED',
      title: 'New estimate created',
      message: `An estimate for job card ${card.jobNumber} was created (${data.currency ?? 'NGN'} ${data.amount}).`,
      link: `/job-cards/${jobCardId}`,
    };
    await notificationService.notifyRole(ROLES.SERVICE_ADVISOR, card.branchId, payload);
    await notificationService.notifyRole(ROLES.WORKSHOP_MANAGER, card.branchId, payload);

    return estimate;
  }

  async addApproval(estimateId: string, data: {
    customerId: string;
    approved?: boolean;
    decisionDate?: string;
    comments?: string;
    status?: string;
  }) {
    const estimate = await prisma.estimate.findUnique({ where: { id: estimateId } });
    if (!estimate) {
      throw new NotFoundError('Estimate not found');
    }

    const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    const existingApproval = await prisma.customerApproval.findFirst({
      where: { estimateId, customerId: data.customerId },
    });
    if (existingApproval) {
      throw new ConflictError('Approval already exists for this customer and estimate');
    }

    return this.serviceRepository.addApproval({
      estimateId,
      customerId: data.customerId,
      approved: data.approved,
      decisionDate: data.decisionDate ? new Date(data.decisionDate) : undefined,
      comments: data.comments,
      status: data.status,
    });
  }

  async getApprovals(estimateId: string) {
    const estimate = await prisma.estimate.findUnique({ where: { id: estimateId } });
    if (!estimate) {
      throw new NotFoundError('Estimate not found');
    }

    return this.serviceRepository.getApprovals(estimateId);
  }
}

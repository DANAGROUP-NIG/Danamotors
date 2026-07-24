import prisma from '../../prisma/client';
import { ServiceRepository } from './service.repository';
import { NotFoundError, ConflictError } from '../../shared/errors/appError';

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

    return this.serviceRepository.createAppointment({
      customerId: data.customerId,
      vehicleId: data.vehicleId,
      branchId: branch.id,
      createdById: data.createdById,
      scheduledAt: new Date(data.scheduledAt),
      durationMins: data.durationMins,
      notes: data.notes,
      status: data.status,
    });
  }

  async listAppointments(params: {
    page: number;
    limit: number;
    search?: string;
    branchId?: string;
    status?: string;
  }) {
    const skip = (params.page - 1) * params.limit;
    const { appointments, total } = await this.serviceRepository.listAppointments({
      skip,
      take: params.limit,
      search: params.search,
      branchId: params.branchId,
      status: params.status,
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
    });
  }

  async listJobCards(params?: { page?: number; limit?: number; branchId?: string }) {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 50;
    const skip = (page - 1) * limit;

    const [jobCards, total] = await Promise.all([
      this.serviceRepository.listJobCards({ skip, take: limit, branchId: params?.branchId }),
      prisma.jobCard.count({ where: params?.branchId ? { branchId: params.branchId } : {} }),
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

    return this.serviceRepository.addEstimate({
      jobCardId,
      description: data.description,
      amount: data.amount,
      currency: data.currency,
      status: data.status,
    });
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

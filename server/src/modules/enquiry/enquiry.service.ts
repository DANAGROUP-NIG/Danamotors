import prisma from '../../prisma/client';
import { EnquiryRepository } from './enquiry.repository';
import { NotificationService } from '../notification/notification.service';
import { NotFoundError, ConflictError } from '../../shared/errors/appError';
import { ROLES } from '../../shared/constants/roles';

export class EnquiryService {
  private enquiryRepository: EnquiryRepository;

  constructor() {
    this.enquiryRepository = new EnquiryRepository();
  }

  async createEnquiry(data: {
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleYear?: number;
    vehicleRegNumber?: string;
    serviceDescription: string;
    preferredDate?: string;
    branchId: string;
  }) {
    const branch = await prisma.branch.findUnique({ where: { id: data.branchId } });
    if (!branch) throw new NotFoundError('Branch not found');

    const enquiry = await this.enquiryRepository.create({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phoneNumber: data.phoneNumber,
      vehicleMake: data.vehicleMake,
      vehicleModel: data.vehicleModel,
      vehicleYear: data.vehicleYear,
      vehicleRegNumber: data.vehicleRegNumber,
      serviceDescription: data.serviceDescription,
      preferredDate: data.preferredDate ? new Date(data.preferredDate) : undefined,
      branchId: data.branchId,
    });

    // Notify Customer Care staff about new enquiry
    const notificationService = new NotificationService();
    const notificationPayload = {
      type: 'APPOINTMENT_CREATE',
      title: 'New online enquiry',
      message: `${data.firstName} ${data.lastName} submitted a new service enquiry for ${branch.name}.`,
      link: `/appointments`,
    };

    await notificationService.notifyRole(ROLES.RECEPTIONIST, branch.id, notificationPayload);
    await notificationService.notifyRole(ROLES.RECEPTION_MANAGER, branch.id, notificationPayload);
    await notificationService.notifyRole(ROLES.ADMIN, branch.id, notificationPayload);
    await notificationService.notifyRole(ROLES.SUPER_ADMIN, undefined, notificationPayload);

    return enquiry;
  }

  async getEnquiry(id: string) {
    const enquiry = await this.enquiryRepository.findById(id);
    if (!enquiry) throw new NotFoundError('Enquiry not found');
    return enquiry;
  }

  async listEnquiries(params: {
    page: number;
    limit: number;
    status?: string;
    branchId?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const skip = (params.page - 1) * params.limit;
    const { enquiries, total } = await this.enquiryRepository.list({
      skip,
      take: params.limit,
      status: params.status,
      branchId: params.branchId,
      search: params.search,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
    });

    return {
      enquiries,
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  async approveEnquiry(id: string, reviewerId: string, data: {
    reviewNotes?: string;
    customerId: string;
    vehicleId: string;
    scheduledAt: string;
    serviceId?: string;
    durationMins?: number;
    notes?: string;
  }) {
    const enquiry = await this.enquiryRepository.findById(id);
    if (!enquiry) throw new NotFoundError('Enquiry not found');

    if (enquiry.status !== 'Pending') {
      throw new ConflictError(`Enquiry has already been ${enquiry.status.toLowerCase()}`);
    }

    // Validate customer and vehicle exist
    const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
    if (!customer) throw new NotFoundError('Customer not found');

    const vehicle = await prisma.vehicle.findUnique({ where: { id: data.vehicleId } });
    if (!vehicle) throw new NotFoundError('Vehicle not found');

    if (data.serviceId) {
      const service = await prisma.service.findUnique({ where: { id: data.serviceId } });
      if (!service) throw new NotFoundError('Service not found');
    }

    // Create a ServiceAppointment for the approved enquiry
    const appointment = await prisma.serviceAppointment.create({
      data: {
        customerId: data.customerId,
        vehicleId: data.vehicleId,
        branchId: enquiry.branchId,
        serviceId: data.serviceId,
        scheduledAt: new Date(data.scheduledAt),
        durationMins: data.durationMins,
        notes: data.notes || `Approved from enquiry: ${enquiry.serviceDescription}`,
        status: 'Pending',
        source: 'OnlineBooking',
      },
      select: { id: true },
    });

    // Update enquiry status
    const updated = await this.enquiryRepository.updateStatus(id, {
      status: 'Approved',
      reviewedById: reviewerId,
      reviewNotes: data.reviewNotes,
      reviewedAt: new Date(),
      appointmentId: appointment.id,
    });

    // Notify Customer Care staff about the approval
    const notificationService = new NotificationService();
    const approvalPayload = {
      type: 'APPOINTMENT_APPROVED',
      title: 'Enquiry approved',
      message: `Enquiry from ${enquiry.firstName} ${enquiry.lastName} has been approved and converted to an appointment.`,
      link: `/appointments/${appointment.id}`,
    };
    await notificationService.notifyRole(ROLES.RECEPTIONIST, enquiry.branchId, approvalPayload);
    await notificationService.notifyRole(ROLES.RECEPTION_MANAGER, enquiry.branchId, approvalPayload);

    return updated;
  }

  async rejectEnquiry(id: string, reviewerId: string, reviewNotes?: string) {
    const enquiry = await this.enquiryRepository.findById(id);
    if (!enquiry) throw new NotFoundError('Enquiry not found');

    if (enquiry.status !== 'Pending') {
      throw new ConflictError(`Enquiry has already been ${enquiry.status.toLowerCase()}`);
    }

    const updated = await this.enquiryRepository.updateStatus(id, {
      status: 'Rejected',
      reviewedById: reviewerId,
      reviewNotes,
      reviewedAt: new Date(),
    });

    // Notify Customer Care staff about the rejection
    const notificationService = new NotificationService();
    const rejectionPayload = {
      type: 'APPOINTMENT_REJECTED',
      title: 'Enquiry rejected',
      message: `Enquiry from ${enquiry.firstName} ${enquiry.lastName} has been rejected.${reviewNotes ? ` Reason: ${reviewNotes}` : ''}`,
      link: `/appointments`,
    };
    await notificationService.notifyRole(ROLES.RECEPTIONIST, enquiry.branchId, rejectionPayload);
    await notificationService.notifyRole(ROLES.RECEPTION_MANAGER, enquiry.branchId, rejectionPayload);

    return updated;
  }
}

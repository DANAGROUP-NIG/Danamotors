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
  }) {
    const skip = (params.page - 1) * params.limit;
    const { enquiries, total } = await this.enquiryRepository.list({
      skip,
      take: params.limit,
      status: params.status,
      branchId: params.branchId,
      search: params.search,
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

  async approveEnquiry(id: string, reviewerId: string, reviewNotes?: string) {
    const enquiry = await this.enquiryRepository.findById(id);
    if (!enquiry) throw new NotFoundError('Enquiry not found');

    if (enquiry.status !== 'Pending') {
      throw new ConflictError(`Enquiry has already been ${enquiry.status.toLowerCase()}`);
    }

    // Create a ServiceAppointment for the approved enquiry
    const scheduledAt = enquiry.preferredDate || new Date();
    const appointment = await prisma.serviceAppointment.create({
      data: {
        customerId: '', // Will be linked when customer is registered
        vehicleId: '', // Will be linked when vehicle is registered
        branchId: enquiry.branchId,
        scheduledAt,
        notes: `Approved from enquiry: ${enquiry.serviceDescription}`,
        status: 'Pending',
        source: 'OnlineBooking',
      },
      select: { id: true },
    });

    // Update enquiry status
    const updated = await this.enquiryRepository.updateStatus(id, {
      status: 'Approved',
      reviewedById: reviewerId,
      reviewNotes,
      reviewedAt: new Date(),
      appointmentId: appointment.id,
    });

    // Notify the enquiry originator
    const notificationService = new NotificationService();
    await notificationService.notifyRole(ROLES.RECEPTIONIST, enquiry.branchId, {
      type: 'APPOINTMENT_APPROVED',
      title: 'Enquiry approved',
      message: `Your service enquiry has been approved. A staff member will contact you shortly.`,
      link: `/appointments`,
    });

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

    // Notify the enquiry originator
    const notificationService = new NotificationService();
    await notificationService.notifyRole(ROLES.RECEPTIONIST, enquiry.branchId, {
      type: 'APPOINTMENT_REJECTED',
      title: 'Enquiry rejected',
      message: `Your service enquiry has been declined. ${reviewNotes || ''}`,
      link: `/appointments`,
    });

    return updated;
  }
}

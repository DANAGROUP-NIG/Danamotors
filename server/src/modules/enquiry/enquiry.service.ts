import prisma from '../../prisma/client';
import { EnquiryRepository, CreateEnquiryData } from './enquiry.repository';
import { NotificationService } from '../notification/notification.service';
import { ServiceRepository } from '../service/service.repository';
import { NotFoundError, BadRequestError, ConflictError } from '../../shared/errors/appError';
import { ROLES } from '../../shared/constants/roles';

export class EnquiryService {
  private enquiryRepo = new EnquiryRepository();
  private notificationService = new NotificationService();
  private serviceRepo = new ServiceRepository();

  async createEnquiry(data: CreateEnquiryData) {
    const branch = await prisma.branch.findFirst({
      where: { id: data.branchId, isActive: true },
    });
    if (!branch) throw new NotFoundError('Branch not found or inactive');

    const enquiry = await this.enquiryRepo.create(data);

    const payload = {
      type: 'APPOINTMENT_CREATE',
      title: 'New online booking enquiry',
      message: `${data.firstName} ${data.lastName} submitted a service enquiry at ${branch.name}.`,
      link: `/appointments?tab=enquiries`,
      branchId: branch.id,
    };

    await Promise.all([
      this.notificationService.notifyRole(ROLES.RECEPTIONIST,       branch.id, payload),
      this.notificationService.notifyRole(ROLES.RECEPTION_MANAGER,  branch.id, payload),
      this.notificationService.notifyRole(ROLES.ADMIN,              undefined,  payload),
      this.notificationService.notifyRole(ROLES.SUPER_ADMIN,        undefined,  payload),
    ]);

    return enquiry;
  }

  async listEnquiries(params: {
    page: number;
    limit: number;
    branchId?: string;
    status?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const skip = (params.page - 1) * params.limit;
    const { enquiries, total } = await this.enquiryRepo.list({ skip, take: params.limit, ...params });
    return {
      enquiries,
      meta: { total, page: params.page, limit: params.limit, totalPages: Math.ceil(total / params.limit) },
    };
  }

  async getEnquiry(id: string) {
    const enquiry = await this.enquiryRepo.findById(id);
    if (!enquiry) throw new NotFoundError('Enquiry not found');
    return enquiry;
  }

  async reviewEnquiry(
    id: string,
    reviewedById: string,
    data: {
      action: 'approve' | 'reject';
      reviewNotes?: string;
      customerId?:   string;
      vehicleId?:    string;
      scheduledAt?:  string;
      serviceId?:    string;
      durationMins?: number;
      notes?:        string;
    },
  ) {
    const enquiry = await this.enquiryRepo.findById(id);
    if (!enquiry) throw new NotFoundError('Enquiry not found');
    if (enquiry.status !== 'Pending') {
      throw new ConflictError(`Enquiry is already ${enquiry.status}. Only Pending enquiries can be reviewed.`);
    }

    if (data.action === 'reject') {
      const updated = await this.enquiryRepo.update(id, {
        status: 'Rejected',
        reviewedBy: { connect: { id: reviewedById } },
        reviewNotes: data.reviewNotes,
        reviewedAt:  new Date(),
      });

      await this.notificationService.notifyRole(ROLES.RECEPTIONIST, enquiry.branch.id, {
        type: 'APPOINTMENT_REJECTED',
        title: 'Enquiry rejected',
        message: `The enquiry from ${enquiry.firstName} ${enquiry.lastName} has been rejected.`,
        link: `/appointments?tab=enquiries`,
        branchId: enquiry.branch.id,
      });

      return { enquiry: updated, appointment: null };
    }

    // ── Approve: validate linked records, create ServiceAppointment ──────────
    const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
    if (!customer) throw new NotFoundError('Customer not found — please create the customer record first.');

    const vehicle = await prisma.vehicle.findUnique({ where: { id: data.vehicleId } });
    if (!vehicle) throw new NotFoundError('Vehicle not found — please create the vehicle record first.');

    if (vehicle.customerId !== customer.id) {
      throw new BadRequestError('The selected vehicle does not belong to the selected customer.');
    }

    // Check no active appointment exists for this customer/vehicle pair
    const activeAppt = await prisma.serviceAppointment.findFirst({
      where: {
        customerId: customer.id,
        vehicleId:  vehicle.id,
        status: { notIn: ['Closed', 'Cancelled', 'Completed'] },
      },
    });
    if (activeAppt) {
      throw new ConflictError(
        `This customer's vehicle already has an active appointment (${activeAppt.status}).`,
      );
    }

    const appointment = await this.serviceRepo.createAppointment({
      customerId:   customer.id,
      vehicleId:    vehicle.id,
      branchId:     enquiry.branch.id,
      serviceId:    data.serviceId,
      createdById:  reviewedById,
      scheduledAt:  new Date(data.scheduledAt!),
      durationMins: data.durationMins,
      notes:        data.notes ?? enquiry.serviceDescription,
      status:       'Pending',
      source:       'OnlineBooking',
    });

    const updatedEnquiry = await this.enquiryRepo.update(id, {
      status:       'Approved',
      reviewedBy:   { connect: { id: reviewedById } },
      reviewNotes:  data.reviewNotes,
      reviewedAt:   new Date(),
      appointment:   { connect: { id: appointment.id } },
    });

    const approvedPayload = {
      type: 'APPOINTMENT_APPROVED',
      title: 'Enquiry approved & appointment created',
      message: `${enquiry.firstName} ${enquiry.lastName}'s enquiry has been approved. Appointment scheduled for ${new Date(appointment.scheduledAt).toLocaleString()}.`,
      link: `/appointments/${appointment.id}`,
      branchId: enquiry.branch.id,
    };

    await Promise.all([
      this.notificationService.notifyRole(ROLES.RECEPTIONIST,      enquiry.branch.id, approvedPayload),
      this.notificationService.notifyRole(ROLES.RECEPTION_MANAGER, enquiry.branch.id, approvedPayload),
    ]);

    return { enquiry: updatedEnquiry, appointment };
  }

  async deleteEnquiry(id: string) {
    const enquiry = await this.enquiryRepo.findById(id);
    if (!enquiry) throw new NotFoundError('Enquiry not found');
    if (enquiry.status === 'Approved') {
      throw new ConflictError('Cannot delete an approved enquiry. Reject it first.');
    }
    await this.enquiryRepo.delete(id);
  }
}

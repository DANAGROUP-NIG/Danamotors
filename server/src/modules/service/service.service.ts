import { latestEstimateQuery } from './estimate-approval';
import { lineAmount, sumMoney } from '../finance/money';
import { EstimateCloseReason, EstimateStatus, Prisma, WarrantyCoverageStatus } from '@prisma/client';
import { canonicalJobStatus, jobStatusFilter } from './job-card-workflow.service';
import { z } from 'zod';
import { estimateBody, jobOpeningBody, jobUpdateBody } from './service.validation';
import { JobCardWorkflowService } from './job-card-workflow.service';
import prisma from '../../prisma/client';
import { ServiceRepository } from './service.repository';
import { NotFoundError, ConflictError, BadRequestError } from '../../shared/errors/appError';
import { ROLES } from '../../shared/constants/roles';
import { NotificationService } from '../notification/notification.service';
import { assertMileage } from '../warranty/warranty.logic';
import { buildCheck, findOpenCampaigns, loadVehicleForWarranty } from '../warranty/warranty.coverage';
import { bookingStatusFor, type AppointmentRequestInput } from './booking-status';
import { decidePreJobEstimate, estimateListWhere } from './pre-job-estimate.service';
import { nextDocumentNumber } from '../finance/document-number';

/** The booked service type and the complaint codes on booking requests must be active masters. */
async function assertBookingMasters(db: Prisma.TransactionClient | typeof prisma, serviceTypeId?: string, requests?: AppointmentRequestInput[]) {
  if (serviceTypeId && !(await db.workshopMaster.findFirst({ where: { id: serviceTypeId, kind: 'SERVICE_TYPE', active: true }, select: { id: true } })))
    throw new BadRequestError('Select an active service type');
  const codes = Array.from(new Set((requests ?? []).map((request) => request.complaintCodeId).filter((code): code is string => Boolean(code))));
  if (codes.length && (await db.workshopMaster.count({ where: { id: { in: codes }, kind: 'COMPLAINT', active: true } })) !== codes.length)
    throw new BadRequestError('Select active complaint codes for the booking requests');
}

/**
 * Valid status transitions for a ServiceAppointment.
 * Exported for unit-test coverage and import by other modules.
 * - An empty array means the status is terminal (no further transitions allowed).
 * - SuperAdmin users can bypass this map (see updateAppointment).
 */
export const APPOINTMENT_STATUS_TRANSITIONS: Record<string, string[]> = {
  'Pending':           ['Checked In', 'No Show', 'Cancelled'],
  'Checked In':        ['Inspection', 'Cancelled'],
  'Inspection':        ['Awaiting Approval', 'Cancelled'],
  'Awaiting Approval': ['In Repair', 'Cancelled'],
  'In Repair':         ['Quality Check', 'Cancelled'],
  'Quality Check':     ['Ready', 'In Repair'],
  'Ready':             ['Completed'],
  'Completed':         [],
  'Cancelled':         [],
  // The vehicle did not come in; book again if the customer still wants the service.
  'No Show':           [],
};

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
    serviceId?: string;
    durationMins?: number;
    notes?: string;
    status?: string;
    createdById?: string;
    serviceTypeId?: string;
    mileage?: number;
    requests?: AppointmentRequestInput[];
  }) {
    const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
    if (!customer) throw new NotFoundError('Customer not found');

    const vehicle = await prisma.vehicle.findUnique({ where: { id: data.vehicleId } });
    if (!vehicle) throw new NotFoundError('Vehicle not found');

    const branch = await prisma.branch.findUnique({ where: { name: data.branchName } });
    if (!branch) throw new NotFoundError(`Branch '${data.branchName}' does not exist`);

    if (data.serviceId) {
      const service = await prisma.service.findUnique({ where: { id: data.serviceId } });
      if (!service) throw new NotFoundError('Service not found');
    }

    const activeAppointment = await prisma.serviceAppointment.findFirst({
      where: {
        customerId: data.customerId,
        vehicleId: data.vehicleId,
        status: { notIn: ['Closed', 'Cancelled', 'Completed', 'No Show'] },
      },
    });
    if (activeAppointment) {
      throw new ConflictError(
        `This customer's vehicle already has an active appointment (${activeAppointment.status}). Close, cancel, or complete it before booking another.`,
      );
    }

    await assertBookingMasters(prisma, data.serviceTypeId, data.requests);
    const appointment = await this.serviceRepository.createAppointment({
      customerId: data.customerId,
      vehicleId: data.vehicleId,
      branchId: branch.id,
      serviceId: data.serviceId,
      createdById: data.createdById,
      scheduledAt: new Date(data.scheduledAt),
      durationMins: data.durationMins,
      notes: data.notes,
      status: data.status ?? 'Pending',
      source: 'WalkIn',
      serviceTypeId: data.serviceTypeId,
      mileage: data.mileage,
      requests: data.requests,
    });

    const notificationService = new NotificationService();
    const appointmentMessage = `Walk-in: ${customer.firstName} ${customer.lastName} booked at ${branch.name} for ${new Date(appointment.scheduledAt).toLocaleString()}.`;
    const appointmentPayload = {
      type: 'APPOINTMENT_CREATE',
      title: 'New walk-in appointment',
      message: appointmentMessage,
      link: `/appointments/${appointment.id}`,
      branchId: branch.id,
    };

    await Promise.all([
      notificationService.notifyRole(ROLES.RECEPTIONIST,       branch.id, appointmentPayload),
      notificationService.notifyRole(ROLES.RECEPTION_MANAGER,  branch.id, appointmentPayload),
      notificationService.notifyRole(ROLES.WORKSHOP_MANAGER,   branch.id, appointmentPayload),
      notificationService.notifyRole(ROLES.SERVICE_ADVISOR,    branch.id, appointmentPayload),
      notificationService.notifyRole(ROLES.ADMIN,              undefined,  appointmentPayload),
      notificationService.notifyRole(ROLES.SUPER_ADMIN,        undefined,  appointmentPayload),
    ]);

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
    source?: string;
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
      source: params.source,
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
    requestingUserRole?: string;
    mileage?: number;
    warrantyAcknowledged?: boolean;
    acknowledgedCampaignIds?: string[];
    serviceTypeId?: string | null;
    requests?: AppointmentRequestInput[];
  }) {
    const appointment = await this.serviceRepository.findAppointmentById(id);
    if (!appointment) {
      throw new NotFoundError('Appointment not found');
    }
    if (data.mileage !== undefined && data.status !== 'Checked In') {
      throw new BadRequestError('Mileage is recorded when the vehicle is checked in');
    }

    const isSuperAdmin = data.requestingUserRole === ROLES.SUPER_ADMIN;

    // ── Status transition validation ──────────────────────────────────────────
    if (data.status && data.status !== appointment.status) {
      const currentStatus = appointment.status;
      const allowedTransitions = APPOINTMENT_STATUS_TRANSITIONS[currentStatus];

      if (!isSuperAdmin) {
        if (allowedTransitions === undefined) {
          // Unknown current status — allow (forward-compat)
        } else if (allowedTransitions.length === 0) {
          throw new BadRequestError(
            `Invalid status transition from '${currentStatus}' to '${data.status}'. Allowed transitions: none (terminal status).`,
          );
        } else if (!allowedTransitions.includes(data.status)) {
          throw new BadRequestError(
            `Invalid status transition from '${currentStatus}' to '${data.status}'. Allowed transitions: ${allowedTransitions.join(', ')}.`,
          );
        }
      }
    }

    // ── Reschedule detection ──────────────────────────────────────────────────
    const isRescheduled =
      data.scheduledAt !== undefined &&
      new Date(data.scheduledAt).toISOString() !== new Date(appointment.scheduledAt).toISOString();

    const oldScheduledAt = appointment.scheduledAt;

    // ── Persist update ────────────────────────────────────────────────────────
    // Check-in with an odometer reading records it and runs the warranty & campaign check;
    // a covered vehicle or open campaign must be acknowledged, like on the job card form.
    let checkInCampaigns: { code: string; title: string }[] = [];
    const updated = await prisma.$transaction(async (tx) => {
      if (data.status === 'Checked In' && data.mileage !== undefined) {
        await tx.$queryRaw`SELECT "id" FROM "Vehicle" WHERE "id" = ${appointment.vehicleId} FOR UPDATE`;
        const vehicle = await loadVehicleForWarranty(tx, appointment.vehicleId);
        assertMileage(data.mileage, vehicle.lastRecordedMileage);
        const openCampaigns = await findOpenCampaigns(tx, vehicle);
        const check = buildCheck(vehicle, data.mileage, openCampaigns);
        const acknowledged = new Set(data.acknowledgedCampaignIds ?? []);
        const missing =
          (check.coverage.status === WarrantyCoverageStatus.ACTIVE && !data.warrantyAcknowledged) ||
          openCampaigns.some((c) => !acknowledged.has(c.campaignId));
        if (missing) {
          throw new ConflictError('Inform the customer and acknowledge the warranty status and open campaigns before check-in.').withCode(
            'WARRANTY_ACK_REQUIRED',
            check,
          );
        }
        await tx.vehicle.update({
          where: { id: vehicle.id },
          data: { lastRecordedMileage: Math.max(vehicle.lastRecordedMileage ?? 0, data.mileage), lastMileageAt: new Date() },
        });
        checkInCampaigns = openCampaigns.map((c) => ({ code: c.code, title: c.title }));
      }
      await assertBookingMasters(tx, data.serviceTypeId ?? undefined, data.requests);
      if (data.requests !== undefined) {
        await tx.appointmentRequest.deleteMany({ where: { appointmentId: id } });
        if (data.requests.length) await tx.appointmentRequest.createMany({ data: data.requests.map((request) => ({ ...request, appointmentId: id })) });
      }
      return tx.serviceAppointment.update({
        where: { id },
        data: {
          scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
          durationMins: data.durationMins,
          notes: data.notes,
          status: data.status,
          serviceTypeId: data.serviceTypeId,
          // The odometer reading taken at check-in replaces the one given when booking.
          mileage: data.mileage,
          ...(data.status !== undefined && { bookingStatus: bookingStatusFor(data.status, appointment.bookingStatus) }),
        },
      });
    });

    // ── Post-update notifications ─────────────────────────────────────────────
    const notificationService = new NotificationService();

    // Resolve customer + branch from the fetched appointment
    const apptAny = appointment as any;
    const customerName = apptAny.customer
      ? `${apptAny.customer.firstName} ${apptAny.customer.lastName}`
      : 'Customer';
    const branchName = apptAny.branch?.name ?? 'branch';
    const branchId: string = appointment.branchId;

    // 1. Reschedule notification
    if (isRescheduled) {
      const rescheduledPayload = {
        type: 'APPOINTMENT_RESCHEDULED',
        title: 'Appointment rescheduled',
        message: `Appointment for ${customerName} at ${branchName} rescheduled from ${new Date(oldScheduledAt).toLocaleString()} to ${new Date(data.scheduledAt!).toLocaleString()}.`,
        link: `/appointments/${id}`,
        branchId,
      };
      await Promise.all([
        notificationService.notifyRole(ROLES.RECEPTIONIST,      branchId, rescheduledPayload),
        notificationService.notifyRole(ROLES.RECEPTION_MANAGER, branchId, rescheduledPayload),
      ]);
    }

    // 2. Status-change notifications
    if (data.status && data.status !== appointment.status) {
      const newStatus = data.status;

      if (newStatus === 'Checked In') {
        const payload = {
          type: 'APPOINTMENT_CHECKED_IN',
          title: checkInCampaigns.length > 0 ? 'Checked in — open campaign' : 'Appointment checked in',
          message:
            `${customerName} has checked in at ${branchName}.` +
            (checkInCampaigns.length > 0
              ? ` Open campaign work: ${checkInCampaigns.map((c) => `${c.code} ${c.title}`).join('; ')}.`
              : ''),
          link: `/appointments/${id}`,
          branchId,
        };
        await Promise.all([
          notificationService.notifyRole(ROLES.WORKSHOP_MANAGER, branchId, payload),
          notificationService.notifyRole(ROLES.SERVICE_ADVISOR,  branchId, payload),
        ]);
      } else if (newStatus === 'Cancelled') {
        const payload = {
          type: 'APPOINTMENT_CANCELLED',
          title: 'Appointment cancelled',
          message: `Appointment for ${customerName} at ${branchName} has been cancelled.`,
          link: `/appointments/${id}`,
          branchId,
        };
        await Promise.all([
          notificationService.notifyRole(ROLES.RECEPTIONIST,      branchId,  payload),
          notificationService.notifyRole(ROLES.RECEPTION_MANAGER, branchId,  payload),
          notificationService.notifyRole(ROLES.WORKSHOP_MANAGER,  branchId,  payload),
          notificationService.notifyRole(ROLES.ADMIN,             undefined, payload),
          notificationService.notifyRole(ROLES.SUPER_ADMIN,       undefined, payload),
        ]);
      } else if (newStatus === 'Completed') {
        const payload = {
          type: 'APPOINTMENT_COMPLETED',
          title: 'Appointment completed',
          message: `Appointment for ${customerName} at ${branchName} has been completed.`,
          link: `/appointments/${id}`,
          branchId,
        };
        await Promise.all([
          notificationService.notifyRole(ROLES.RECEPTIONIST,      branchId,  payload),
          notificationService.notifyRole(ROLES.RECEPTION_MANAGER, branchId,  payload),
          notificationService.notifyRole(ROLES.ADMIN,             undefined, payload),
          notificationService.notifyRole(ROLES.SUPER_ADMIN,       undefined, payload),
        ]);
      }
    }

    return updated;
  }

  async deleteAppointment(id: string) {
    const appointment = await this.serviceRepository.findAppointmentById(id);
    if (!appointment) {
      throw new NotFoundError('Appointment not found');
    }
    await this.serviceRepository.deleteAppointment(id);
  }

  async createJobCard(data: z.infer<typeof jobOpeningBody> & { createdById?: string }) {
    return new JobCardWorkflowService().open(data);
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
    if (params?.status) where.status = jobStatusFilter(params.status);

    if (params?.search) {
      where.OR = [
        { jobNumber: { contains: params.search, mode: 'insensitive' } },
        { customer: { phoneNumber: { contains: params.search, mode: 'insensitive' } } },
        { customer: { companyName: { contains: params.search, mode: 'insensitive' } } },
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
    if (params?.dateTo) createdAtFilter.lte = new Date(params.dateTo.length === 10 ? `${params.dateTo}T23:59:59.999Z` : params.dateTo);
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

    // This vehicle's progress in each campaign the job card was opened for.
    const campaignVehicles =
      card.campaigns.length > 0 && card.vehicle
        ? await prisma.campaignVehicle.findMany({
            where: {
              campaignId: { in: card.campaigns.map((c) => c.campaignId) },
              OR: [{ vehicleId: card.vehicle.id }, { vin: card.vehicle.vin.toUpperCase() }],
            },
            select: { campaignId: true, status: true, completedJobCardId: true },
          })
        : [];
    return {
      ...card,
      campaigns: card.campaigns.map((c) => ({
        ...c,
        vehicleStatus: campaignVehicles.find((v) => v.campaignId === c.campaignId)?.status ?? null,
      })),
    };
  }

  async updateJobCard(id: string, data: z.infer<typeof jobUpdateBody>, actorId?: string) {
    return new JobCardWorkflowService().update(id, data, actorId);
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

  async addEstimate(jobCardId: string, input: z.infer<typeof estimateBody>, actorId?: string) {
    const data = estimateBody.parse(input);
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${jobCardId} FOR UPDATE`);
      const card = await tx.jobCard.findUnique({ where: { id: jobCardId }, include: { vehicle: { include: { catalogue: true } } } });
      if (!card) throw new NotFoundError('Job card not found');
      if (card.billedAt || ['BILLED', 'DELIVERED', 'CANCELLED'].includes(canonicalJobStatus(card.status))) throw new BadRequestError('Estimates can only be added to unbilled jobs');
      const billable = data.lines.filter(line => line.type !== 'COMPLAINT');
      if (new Set(billable.map(line => `${line.type}:${line.referenceId}`)).size !== billable.length) throw new BadRequestError('Each service, part or labour operation can appear only once per estimate');
      const services = billable.filter(line => line.type === 'SERVICE');
      if (card.serviceId && (services.length !== 1 || services[0].referenceId !== card.serviceId || services[0].quantity !== 1)) throw new BadRequestError('Include the selected job-card service exactly once with quantity 1');
      if (data.lines.some(line => line.includedInService && !['PART', 'LABOUR'].includes(line.type))) throw new BadRequestError('Only parts and labour can be included in the service charge');
      if (data.lines.some(line => line.includedInService) && services.length !== 1) throw new BadRequestError('Package inclusions require the selected service line');
      const lines = [];
      for (const line of data.lines) {
        let description = line.description ?? '';
        let rate = 0;
        let quantity = line.quantity;
        if (line.type === 'PART') {
          const part = line.referenceId ? await tx.sparePart.findUnique({ where: { id: line.referenceId } }) : null;
          if (!part) throw new BadRequestError('Select a part');
          if (part.retailRate == null) throw new BadRequestError(`Retail rate is not set for ${part.partNumber}`);
          description = part.name; rate = part.retailRate;
        } else if (line.type === 'LABOUR') {
          const item = line.referenceId ? await tx.labourItem.findFirst({ where: { id: line.referenceId, active: true } }) : null;
          if (!item) throw new BadRequestError('Select an active labour operation');
          const modelId = card.vehicle?.catalogue?.parentId;
          const modelRate = modelId ? await tx.labourRate.findFirst({ where: { labourItemId: item.id, modelId, active: true } }) : null;
          description = item.description; rate = modelRate?.rate ?? item.rate;
          quantity = modelRate?.pricing === 'FIXED' ? 1 : line.quantity;
        } else if (line.type === 'SERVICE') {
          const service = line.referenceId ? await tx.service.findFirst({ where: { id: line.referenceId, isActive: true } }) : null;
          if (!service) throw new BadRequestError('Select an active service');
          description = service.name; rate = card.serviceCharge ?? service.price;
        } else if (line.referenceId) {
          const complaint = await tx.jobComplaint.findFirst({ where: { id: line.referenceId, jobCardId } });
          if (!complaint) throw new BadRequestError('Complaint must belong to this job');
          description = complaint.description;
        }
        if (!description) throw new BadRequestError('Complaint description is required');
        const { includedInService, ...fields } = line;
        lines.push({ ...fields, type: includedInService ? `INCLUDED_${line.type}` : line.type, description, rate: includedInService ? 0 : rate, quantity, amount: includedInService ? 0 : lineAmount(quantity, rate) });
      }
      // A new scope needs a fresh QC result and fresh credit authorization.
      const reopening = canonicalJobStatus(card.status) === 'READY';
      await tx.jobCard.update({ where: { id: jobCardId }, data: { qcStatus: 'PENDING', creditApprovedById: null, ...(reopening ? { status: 'QC', readyAt: null, statusHistory: { create: { fromStatus: card.status, toStatus: 'QC', actorId: actorId ?? card.createdById!, remarks: 'Estimate revised; approval and quality check required' } } } : {}) } });
      const previous = (await tx.estimate.findMany({ where: { jobCardId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { createdAt: true } }))?.[0];
      // Strict ordering under the shared row lock, including transactions started earlier.
      const createdAt = new Date(Math.max(Date.now(), (previous?.createdAt?.getTime() ?? 0) + 1));
      await tx.estimate.updateMany({
        where: { jobCardId, OR: [{ closedReason: null }, { closedReason: { not: EstimateCloseReason.SUPERSEDED } }] },
        data: { estimateStatus: EstimateStatus.CLOSED, closedReason: EstimateCloseReason.SUPERSEDED },
      });
      return tx.estimate.create({
        data: {
          createdAt,
          jobCardId,
          branchId: card.branchId,
          customerId: card.customerId,
          vehicleId: card.vehicleId,
          estimateNumber: await nextDocumentNumber(tx, 'ESTIMATE', createdAt),
          estimateDate: createdAt,
          estimateStatus: EstimateStatus.PENDING_APPROVAL,
          description: data.description,
          currency: 'NGN',
          status: 'Pending',
          amount: sumMoney(lines.map(line => line.amount)),
          lines: { createMany: { data: lines } },
        },
        include: { lines: true },
      });
    }, { maxWait: 5000, timeout: 15000 });
  }

  async addApproval(estimateId: string, data: {
    customerId: string;
    approved?: boolean;
    decisionDate?: string;
    comments?: string;
    status?: string;
  }, actorId?: string) {
    const identity = await prisma.estimate.findUnique({ where: { id: estimateId }, select: { jobCardId: true } });
    if (!identity) throw new NotFoundError('Estimate not found');
    if (!identity.jobCardId) return decidePreJobEstimate(estimateId, data, actorId);
    const jobCardId = identity.jobCardId;
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${jobCardId} FOR UPDATE`);
      const estimates = await tx.estimate.findMany({ where: { jobCardId }, ...latestEstimateQuery });
      const estimate = estimates[0];
      if (!estimate || estimate.id !== estimateId) throw new ConflictError('Only the latest estimate revision can receive a decision');
      const card = await tx.jobCard.findUniqueOrThrow({ where: { id: jobCardId } });
      if (card.billedAt || ['BILLED', 'DELIVERED', 'CANCELLED'].includes(canonicalJobStatus(card.status))) throw new BadRequestError('This job is closed for estimate decisions');
      if (card.customerId !== data.customerId) throw new BadRequestError('Approval must be from the bill-to customer');
      if (estimate.approvals.length) throw new ConflictError('This revision already has a decision. Create a new revision to change scope.');
      const status = data.approved ? 'Approved' : 'Declined';
      if (data.approved) {
        const services = estimate.lines.filter(line => line.type === 'SERVICE');
        if (card.serviceId && (services.length !== 1 || services[0].referenceId !== card.serviceId || services[0].quantity !== 1)) throw new BadRequestError('Revise the estimate to include the selected service exactly once');
        if (services.length) await tx.jobCard.update({ where: { id: card.id }, data: { serviceCharge: services[0].amount } });
      }
      // The decision closes the revision: approved = the job's scope, declined = rejected.
      await tx.estimate.update({
        where: { id: estimateId },
        data: { status, estimateStatus: EstimateStatus.CLOSED, closedReason: data.approved ? EstimateCloseReason.CONVERTED : EstimateCloseReason.DECLINED },
      });
      if (actorId) await tx.auditLog.create({ data: { userId: actorId, action: 'ESTIMATE_DECISION_RECORDED', details: JSON.stringify({ jobCardId: card.id, estimateId, customerId: data.customerId, status, comments: data.comments }) } });
      return tx.customerApproval.create({ data: { estimateId, customerId: data.customerId, approved: data.approved, decisionDate: new Date(), comments: data.comments, status } });
    }, { maxWait: 5000, timeout: 15000 });
  }

  async getApprovals(estimateId: string) {
    const estimate = await prisma.estimate.findUnique({ where: { id: estimateId } });
    if (!estimate) {
      throw new NotFoundError('Estimate not found');
    }

    return this.serviceRepository.getApprovals(estimateId);
  }

  async listInspections(params?: {
    page?: number;
    limit?: number;
    branchId?: string;
    status?: string;
    search?: string;
  }) {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (params?.branchId) where.jobCard = { branchId: params.branchId };
    if (params?.status) where.status = params.status;

    if (params?.search) {
      where.OR = [
        { findings: { contains: params.search, mode: 'insensitive' } },
        { notes: { contains: params.search, mode: 'insensitive' } },
        { jobCard: { jobNumber: { contains: params.search, mode: 'insensitive' } } },
        { jobCard: { customer: { firstName: { contains: params.search, mode: 'insensitive' } } } },
        { jobCard: { customer: { lastName: { contains: params.search, mode: 'insensitive' } } } },
      ];
    }

    const [inspections, total] = await Promise.all([
      this.serviceRepository.listInspections({
        skip,
        take: limit,
        branchId: params?.branchId,
        status: params?.status,
        search: params?.search,
      }),
      prisma.inspection.count({ where }),
    ]);

    return {
      inspections,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async listEstimates(params?: {
    page?: number;
    limit?: number;
    branchId?: string;
    status?: string;
    search?: string;
  }) {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 10;
    const skip = (page - 1) * limit;

    const where = estimateListWhere({ branchId: params?.branchId, status: params?.status, search: params?.search });

    const [estimates, total] = await Promise.all([
      this.serviceRepository.listEstimates({
        skip,
        take: limit,
        branchId: params?.branchId,
        status: params?.status,
        search: params?.search,
      }),
      prisma.estimate.count({ where }),
    ]);

    return {
      estimates,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

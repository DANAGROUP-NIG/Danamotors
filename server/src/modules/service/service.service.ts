import { Prisma, WarrantyCoverageStatus } from '@prisma/client';
import prisma from '../../prisma/client';
import { ServiceRepository } from './service.repository';
import { NotFoundError, ConflictError, BadRequestError } from '../../shared/errors/appError';
import { ROLES } from '../../shared/constants/roles';
import { NOTIFICATION_TYPES, NotificationService } from '../notification/notification.service';
import { assertMileage } from '../warranty/warranty.logic';
import { buildCheck, findOpenCampaigns, loadVehicleForWarranty } from '../warranty/warranty.coverage';
import { WarrantyCaseService, notifyWarrantyOfficers } from '../warranty/warrantyCase.service';
import { completeCampaignVehiclesForJobCard, markCampaignVehiclesInWorkshop } from '../campaign/campaign.hooks';
import { isCompletedStatus } from '../job-card-line/jobCardLine.logic';

/**
 * Updates a job card and, when it becomes completed, marks the campaign work it was
 * opened for as completed — in one transaction. Shared by the service and workshop modules
 * so every path that completes a job card runs the hook.
 */
export async function applyJobCardUpdate(
  id: string,
  previousStatus: string,
  data: Prisma.JobCardUncheckedUpdateInput & { status?: string },
) {
  const completing = data.status !== undefined && isCompletedStatus(data.status) && !isCompletedStatus(previousStatus);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.jobCard.update({
      where: { id },
      data: { ...data, ...(completing && { completedAt: new Date() }) },
    });
    if (completing) await completeCampaignVehiclesForJobCard(tx, id);
    return updated;
  });
}

/**
 * Valid status transitions for a ServiceAppointment.
 * Exported for unit-test coverage and import by other modules.
 * - An empty array means the status is terminal (no further transitions allowed).
 * - SuperAdmin users can bypass this map (see updateAppointment).
 */
export const APPOINTMENT_STATUS_TRANSITIONS: Record<string, string[]> = {
  'Pending':           ['Checked In', 'Cancelled'],
  'Checked In':        ['Inspection', 'Cancelled'],
  'Inspection':        ['Awaiting Approval', 'Cancelled'],
  'Awaiting Approval': ['In Repair', 'Cancelled'],
  'In Repair':         ['Quality Check', 'Cancelled'],
  'Quality Check':     ['Ready', 'In Repair'],
  'Ready':             ['Completed'],
  'Completed':         [],
  'Cancelled':         [],
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
      serviceId: data.serviceId,
      createdById: data.createdById,
      scheduledAt: new Date(data.scheduledAt),
      durationMins: data.durationMins,
      notes: data.notes,
      status: data.status ?? 'Pending',
      source: 'WalkIn',
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
      return tx.serviceAppointment.update({
        where: { id },
        data: {
          scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
          durationMins: data.durationMins,
          notes: data.notes,
          status: data.status,
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

  /**
   * Creates a job card. For a vehicle it runs the warranty & campaign check inside the
   * transaction: the server recomputes coverage from today's mileage and refuses to
   * create the card (409 WARRANTY_ACK_REQUIRED) unless the adviser acknowledged a covered
   * vehicle and every open campaign. It then snapshots coverage, links the campaigns and,
   * for a covered vehicle, opens a warranty case. Notifications go out after commit.
   */
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
    mileage?: number;
    odometerReplaced?: boolean;
    odometerReplacedReason?: string;
    warrantyAcknowledged?: boolean;
    acknowledgedCampaignIds?: string[];
  }) {
    let appointment: Awaited<ReturnType<ServiceRepository['findAppointmentById']>> = null;
    if (data.appointmentId) {
      appointment = await this.serviceRepository.findAppointmentById(data.appointmentId);
      if (!appointment) throw new NotFoundError('Appointment not found');
    }

    // A job card for an appointment is for that appointment's customer and vehicle.
    const vehicleId = data.vehicleId ?? appointment?.vehicleId;
    const customerId = data.customerId ?? appointment?.customerId;
    if (appointment && data.vehicleId && data.vehicleId !== appointment.vehicleId) {
      throw new BadRequestError('The vehicle does not match the linked appointment');
    }

    if (customerId) {
      const customer = await prisma.customer.findUnique({ where: { id: customerId } });
      if (!customer) throw new NotFoundError('Customer not found');
    }

    const branch = await prisma.branch.findUnique({ where: { name: data.branchName } });
    if (!branch) throw new NotFoundError(`Branch '${data.branchName}' does not exist`);

    if (!vehicleId) {
      const card = await this.serviceRepository.createJobCard({
        appointmentId: data.appointmentId,
        customerId,
        branchId: branch.id,
        jobNumber: data.jobNumber,
        description: data.description,
        status: data.status,
        estimatedHours: data.estimatedHours,
        estimatedCost: data.estimatedCost,
        assignedTo: data.assignedTo,
        createdById: data.createdById,
      });
      // Same response shape as the vehicle path: no vehicle, so no warranty check.
      return { ...card, warrantyCase: null, warrantyCheck: null };
    }

    if (data.mileage === undefined) {
      throw new BadRequestError('Enter the current mileage (km) so warranty can be checked');
    }
    if (data.odometerReplaced && !data.odometerReplacedReason?.trim()) {
      throw new BadRequestError('Give a reason for the odometer replacement');
    }

    const result = await prisma.$transaction(async (tx) => {
      // Serialise job cards and mileage updates for the same vehicle.
      await tx.$queryRaw`SELECT "id" FROM "Vehicle" WHERE "id" = ${vehicleId} FOR UPDATE`;
      const vehicle = await loadVehicleForWarranty(tx, vehicleId);
      if (customerId && vehicle.customerId !== customerId) {
        throw new BadRequestError('The vehicle does not belong to this customer');
      }
      assertMileage(data.mileage!, vehicle.lastRecordedMileage, data.odometerReplaced);

      const openCampaigns = await findOpenCampaigns(tx, vehicle);
      const check = buildCheck(vehicle, data.mileage, openCampaigns);
      const acknowledged = new Set(data.acknowledgedCampaignIds ?? []);
      const unacknowledgedCampaigns = openCampaigns.filter((c) => !acknowledged.has(c.campaignId));
      const coverageNeedsAck = check.coverage.status === WarrantyCoverageStatus.ACTIVE && !data.warrantyAcknowledged;
      if (coverageNeedsAck || unacknowledgedCampaigns.length > 0) {
        throw new ConflictError(
          coverageNeedsAck
            ? 'This vehicle is under warranty. Inform the customer and acknowledge the warranty before creating the job card.'
            : `This vehicle has open campaigns (${unacknowledgedCampaigns.map((c) => c.code).join(', ')}). Acknowledge them before creating the job card.`,
        ).withCode('WARRANTY_ACK_REQUIRED', check);
      }

      const now = new Date();
      const card = await tx.jobCard.create({
        data: {
          appointmentId: data.appointmentId,
          customerId: customerId ?? vehicle.customerId,
          vehicleId,
          branchId: branch.id,
          jobNumber: data.jobNumber,
          description: data.description,
          status: data.status,
          estimatedHours: data.estimatedHours,
          estimatedCost: data.estimatedCost,
          assignedTo: data.assignedTo,
          createdById: data.createdById,
          mileage: data.mileage,
          warrantyStatusAtCreation: check.coverage.status,
          warrantyReasonsAtCreation: check.coverage.reasons,
          warrantyExpiresOnAtCreation: check.coverage.expiresOn ? new Date(`${check.coverage.expiresOn}T00:00:00Z`) : null,
          warrantyKmLimitAtCreation: check.coverage.kmLimit,
          warrantySnapshot: {
            coverage: check.coverage,
            policy: check.policy,
            override: check.override,
            reasonText: check.reasonText,
            openCampaigns: openCampaigns.map((c) => ({ id: c.campaignId, code: c.code, type: c.type, title: c.title })),
            odometerReplaced: Boolean(data.odometerReplaced),
            odometerReplacedReason: data.odometerReplaced ? data.odometerReplacedReason!.trim() : null,
            previousMileage: vehicle.lastRecordedMileage,
          } as unknown as Prisma.InputJsonValue,
          ...(check.requiresAcknowledgement && { warrantyAcknowledgedById: data.createdById, warrantyAcknowledgedAt: now }),
        },
      });

      // Odometer only moves forward, except for an audited replacement.
      const newMileage = data.odometerReplaced ? data.mileage! : Math.max(vehicle.lastRecordedMileage ?? 0, data.mileage!);
      await tx.vehicle.update({ where: { id: vehicleId }, data: { lastRecordedMileage: newMileage, lastMileageAt: now } });

      if (openCampaigns.length > 0) {
        await tx.jobCardCampaign.createMany({
          data: openCampaigns.map((c) => ({
            jobCardId: card.id,
            campaignId: c.campaignId,
            campaignCode: c.code,
            campaignTitle: c.title,
            campaignType: c.type,
          })),
        });
        await markCampaignVehiclesInWorkshop(tx, openCampaigns.map((c) => c.campaignVehicleId), vehicleId);
      }

      const warrantyCase =
        check.coverage.status === WarrantyCoverageStatus.ACTIVE
          ? await new WarrantyCaseService().openForJobCard(tx, {
              jobCardId: card.id,
              vehicleId,
              customerId: card.customerId,
              branchId: branch.id,
              complaint: data.description,
              mileage: data.mileage!,
              coverageStatus: check.coverage.status,
              actorId: data.createdById ?? null,
              automatic: true,
            })
          : null;

      return { card, check, openCampaigns, warrantyCase, vehicle };
    });

    await this.notifyWarrantyJob(result, branch);
    return { ...result.card, warrantyCase: result.warrantyCase, warrantyCheck: result.check };
  }

  private async notifyWarrantyJob(
    result: {
      card: { id: string; jobNumber: string; description: string; mileage: number | null; createdById: string | null };
      warrantyCase: { id: string; caseNumber: string } | null;
      openCampaigns: { code: string; title: string; type: string }[];
      vehicle: { vin: string; make: string | null; model: string | null; customerId: string };
    },
    branch: { id: string; name: string },
  ) {
    const { card, warrantyCase, openCampaigns, vehicle } = result;
    const customer = await prisma.customer.findUnique({
      where: { id: vehicle.customerId },
      select: { firstName: true, lastName: true, phoneNumber: true },
    });
    const who = customer ? `${customer.firstName} ${customer.lastName}${customer.phoneNumber ? ` (${customer.phoneNumber})` : ''}` : 'Customer';
    const car = [vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle';
    const km = card.mileage != null ? `${card.mileage.toLocaleString('en-NG')} km` : 'mileage not recorded';

    if (warrantyCase) {
      await notifyWarrantyOfficers(branch.id, {
        type: NOTIFICATION_TYPES.WARRANTY_JOB_CREATED,
        title: 'Warranty job opened',
        message: `${who} · ${car} · VIN ${vehicle.vin} · ${km} · job card ${card.jobNumber} at ${branch.name}. Complaint: ${card.description}. Case ${warrantyCase.caseNumber} opened.`,
        link: `/warranty/${warrantyCase.id}`,
        branchId: branch.id,
      });
    }
    if (openCampaigns.length > 0 && card.createdById) {
      await new NotificationService().notifyUsers([card.createdById], {
        type: NOTIFICATION_TYPES.CAMPAIGN_VEHICLE_CHECKED_IN,
        title: 'Open campaign on this vehicle',
        message: `Job card ${card.jobNumber} (${car}, VIN ${vehicle.vin}) has open campaign work: ${openCampaigns
          .map((c) => `${c.code} ${c.title}`)
          .join('; ')}. Include it in the job.`,
        link: `/job-cards/${card.id}`,
        branchId: branch.id,
      });
    }
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
    // The warranty snapshot, campaign links and case belong to the original vehicle.
    if (data.vehicleId !== undefined && data.vehicleId !== card.vehicleId && card.warrantyStatusAtCreation) {
      throw new BadRequestError('The vehicle cannot be changed after the warranty check. Open a new job card instead.');
    }

    return applyJobCardUpdate(id, card.status, data);
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

    const where: Record<string, unknown> = {};
    if (params?.branchId) where.jobCard = { branchId: params.branchId };
    if (params?.status) where.status = params.status;

    if (params?.search) {
      where.OR = [
        { description: { contains: params.search, mode: 'insensitive' } },
        { jobCard: { jobNumber: { contains: params.search, mode: 'insensitive' } } },
        { jobCard: { customer: { firstName: { contains: params.search, mode: 'insensitive' } } } },
        { jobCard: { customer: { lastName: { contains: params.search, mode: 'insensitive' } } } },
      ];
    }

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

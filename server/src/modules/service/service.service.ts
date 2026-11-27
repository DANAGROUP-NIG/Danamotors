import { getPdiSettings } from "../pdi/pdi.settings.service";
import { BookingFields, bookingRelations } from "./booking.persistence";
import {
  assertBookable,
  bookingComplaints,
  bookingState,
  bookingView,
  isTerminalBookingStatus,
} from "./booking.logic";
import { allowedJobTransitions } from "./job-transitions";
import { hasCurrentOpeningSignature } from "./job-opening-signature.service";
import { upfrontAmount } from "./job-deposit.service";
import {
  advanceCoverage,
  advanceReceiptDateLimit,
} from "../finance/job-advance";
import {
  approvedCustomerTotal,
  assertSignaturePng,
  estimateContentHash,
  signatureState,
  stagedContentHash,
} from "./estimate-signature";
import {
  ESTIMATE_HASH_VERSION,
  estimateOutcome,
  estimateTotals,
  resolveDecisions,
  withDecisions,
} from "./job-estimate.logic";
import { planEstimateRevision } from "./estimate-revision";
import { scopeJobCard } from "./job-card-visibility";
import { nextDocumentNumber } from "../finance/document-number";
import { latestEstimateQuery } from "./estimate-approval";
import { getBranchSettings } from "../company-settings/company-settings.service";
import {
  serviceChargeDescription,
  serviceChargeReference,
} from "./job-service-charge";
import { lineAmount, sumMoney } from "../finance/money";
import { Prisma, WarrantyCoverageStatus, type JobStage, type LineDecision } from "@prisma/client";
import {
  canonicalJobStatus,
  jobStatusFilter,
} from "./job-card-workflow.service";
import { z } from "zod";
import {
  estimateBody,
  jobOpeningBody,
  jobUpdateBody,
} from "./service.validation";
import { JobCardWorkflowService } from "./job-card-workflow.service";
import prisma from "../../prisma/client";
import { setNotificationActor } from "../notification/jobcard-notification-router";
import { ServiceRepository, inspectionListWhere, type InspectionListFilter } from "./service.repository";
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from "../../shared/errors/appError";
import { ROLES } from "../../shared/constants/roles";
import { NotificationService } from "../notification/notification.service";
import { syncStage } from "./job-stage.writer";
import { assertMileage } from "../warranty/warranty.logic";
import {
  buildCheck,
  findOpenCampaigns,
  loadVehicleForWarranty,
} from "../warranty/warranty.coverage";
import { supersedeCurrentInspection } from "./job-qc-state";

/**
 * Valid status transitions for a ServiceAppointment.
 * Exported for unit-test coverage and import by other modules.
 * - An empty array means the status is terminal (no further transitions allowed).
 * - SuperAdmin users can bypass this map (see updateAppointment).
 */
export const APPOINTMENT_STATUS_TRANSITIONS: Record<string, string[]> = {
  Pending: ["Checked In", "Cancelled"],
  "Checked In": ["Inspection", "Cancelled"],
  Inspection: ["Awaiting Approval", "Cancelled"],
  "Awaiting Approval": ["In Repair", "Cancelled"],
  "In Repair": ["Quality Check", "Cancelled"],
  "Quality Check": ["Ready", "In Repair"],
  Ready: ["Completed"],
  Completed: [],
  Cancelled: [],
};

// Legacy "Service Booking For Maximum N days": a booking cannot be made further ahead than the branch allows.
export async function assertWithinBookingHorizon(
  branchId: string,
  scheduledAt: Date,
  now = new Date(),
) {
  const { bookingMaxDays } = await getBranchSettings(branchId);
  const latest = new Date(now);
  latest.setDate(latest.getDate() + bookingMaxDays);
  latest.setHours(23, 59, 59, 999);
  if (scheduledAt > latest)
    throw new BadRequestError(
      `Bookings can be made up to ${bookingMaxDays} days ahead at this branch`,
    );
}

/** An estimate line copied unchanged into a supplementary revision (repair, phase 6). */
export type CarriedEstimateLine = Pick<
  Prisma.EstimateLineGetPayload<object>,
  "type" | "referenceId" | "partSource" | "description" | "quantity" | "rate" | "amount" | "payer" | "customerDecision" | "findingItemId" | "complaintId"
>;

export class ServiceService {
  private serviceRepository: ServiceRepository;

  constructor() {
    this.serviceRepository = new ServiceRepository();
  }

  async createAppointment(
    data: BookingFields & {
      customerId: string;
      vehicleId: string;
      branchName: string;
      scheduledAt: string;
      serviceId?: string;
      serviceTypeId?: string;
      durationMins?: number;
      notes?: string;
      status?: string;
      createdById?: string;
    },
  ) {
    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
    });
    if (!customer) throw new NotFoundError("Customer not found");

    const vehicle = await prisma.vehicle.findUnique({
      where: { id: data.vehicleId },
    });
    if (!vehicle) throw new NotFoundError("Vehicle not found");

    const branch = await prisma.branch.findUnique({
      where: { name: data.branchName },
    });
    if (!branch)
      throw new NotFoundError(`Branch '${data.branchName}' does not exist`);

    if (data.serviceTypeId) {
      const type = await prisma.workshopMaster.findFirst({
        where: { id: data.serviceTypeId, kind: "SERVICE_TYPE", active: true },
      });
      if (!type)
        throw new BadRequestError("Select an active workshop service type");
    }
    if (data.serviceId) {
      const service = await prisma.service.findUnique({
        where: { id: data.serviceId },
      });
      if (!service) throw new NotFoundError("Service not found");
    }

    await assertWithinBookingHorizon(branch.id, new Date(data.scheduledAt));

    const appointment = await this.serviceRepository.createAppointment({
      mileage: data.mileage,
      acFitted: data.acFitted,
      followUpJobId: data.followUpJobId,
      requests: data.requests,
      customerId: data.customerId,
      vehicleId: data.vehicleId,
      branchId: branch.id,
      serviceId: data.serviceId,
      serviceTypeId: data.serviceTypeId,
      createdById: data.createdById,
      scheduledAt: new Date(data.scheduledAt),
      durationMins: data.durationMins,
      notes: data.notes,
      status: data.status ?? "Pending",
      source: "WalkIn",
    });

    const notificationService = new NotificationService();
    const appointmentMessage = `Walk-in: ${customer.firstName} ${customer.lastName} booked at ${branch.name} for ${new Date(appointment.scheduledAt).toLocaleString("en-GB", { timeZone: "Africa/Lagos" })}.`;
    const appointmentPayload = {
      type: "APPOINTMENT_CREATE",
      title: "New walk-in appointment",
      message: appointmentMessage,
      link: `/appointments/${appointment.id}`,
      branchId: branch.id,
    };

    await Promise.all([
      notificationService.notifyRole(
        ROLES.CCU_OFFICER,
        branch.id,
        appointmentPayload,
      ),
      notificationService.notifyRole(
        ROLES.CCU_MANAGER,
        branch.id,
        appointmentPayload,
      ),
      notificationService.notifyRole(
        ROLES.WORKSHOP_MANAGER,
        branch.id,
        appointmentPayload,
      ),
      notificationService.notifyRole(
        ROLES.SERVICE_ADVISOR,
        branch.id,
        appointmentPayload,
      ),
      notificationService.notifyRole(
        ROLES.ADMIN,
        undefined,
        appointmentPayload,
      ),
      notificationService.notifyRole(
        ROLES.SUPER_ADMIN,
        undefined,
        appointmentPayload,
      ),
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
    const { appointments, total } =
      await this.serviceRepository.listAppointments({
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
      appointments: appointments.map(bookingView),
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
      throw new NotFoundError("Appointment not found");
    }

    return bookingView(appointment);
  }

  async updateAppointment(
    id: string,
    data: BookingFields & {
      actorId?: string;
      bookingStatus?: "BOOKED" | "CANCELLED" | "NO_SHOW";
      cancelReason?: string;
      scheduledAt?: string;
      durationMins?: number;
      notes?: string;
      status?: string;
      requestingUserRole?: string;
      mileage?: number;
      warrantyAcknowledged?: boolean;
      acknowledgedCampaignIds?: string[];
    },
  ) {
    const appointment = await this.serviceRepository.findAppointmentById(id);
    if (!appointment) {
      throw new NotFoundError("Appointment not found");
    }
    const isSuperAdmin = data.requestingUserRole === ROLES.SUPER_ADMIN;

    if (data.status) {
      data = {
        ...data,
        status: bookingState(
          appointment,
          data.status,
          data.bookingStatus,
          data.cancelReason,
        ).status,
      };
    }

    // ── Status transition validation ──────────────────────────────────────────
    if (
      data.status &&
      data.status !== appointment.status &&
      !["Cancelled", "No Show"].includes(data.status)
    ) {
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
            `Invalid status transition from '${currentStatus}' to '${data.status}'. Allowed transitions: ${allowedTransitions.join(", ")}.`,
          );
        }
      }
    }

    // ── Reschedule detection ──────────────────────────────────────────────────
    const isRescheduled =
      data.scheduledAt !== undefined &&
      new Date(data.scheduledAt).toISOString() !==
        new Date(appointment.scheduledAt).toISOString();

    const oldScheduledAt = appointment.scheduledAt;
    if (isRescheduled)
      await assertWithinBookingHorizon(
        appointment.branchId,
        new Date(data.scheduledAt!),
      );

    // ── Persist update ────────────────────────────────────────────────────────
    // Check-in with an odometer reading records it and runs the warranty & campaign check;
    // a covered vehicle or open campaign must be acknowledged, like on the job card form.
    let checkInCampaigns: { code: string; title: string }[] = [];
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${appointment.vehicleId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "ServiceAppointment" WHERE id = ${id} FOR UPDATE`;
      const current = await tx.serviceAppointment.findUniqueOrThrow({
        where: { id },
        include: { requests: true, jobCards: { select: { id: true } } },
      });
      const state = bookingState(
        current,
        data.status,
        data.bookingStatus,
        data.cancelReason,
      );
      const hasBookingEdit =
        data.requests !== undefined ||
        data.serviceTypeId !== undefined ||
        data.serviceId !== undefined ||
        data.followUpJobId !== undefined ||
        data.acFitted !== undefined ||
        data.mileage !== undefined ||
        data.scheduledAt !== undefined ||
        state.bookingStatus !== undefined ||
        data.cancelReason !== undefined ||
        data.notes !== undefined ||
        data.durationMins !== undefined;
      if (hasBookingEdit) {
        assertBookable(current);
        if (current.jobCards.length)
          throw new ConflictError("Linked bookings cannot be edited");
      }
      if (
        data.status &&
        (["CANCELLED", "NO_SHOW"].includes(current.bookingStatus) ||
          isTerminalBookingStatus(current.status))
      )
        assertBookable(current);
      if (data.status && current.status !== appointment.status)
        throw new ConflictError("Appointment changed; reload before updating");
      data.status = state.status;
      const requests = await bookingRelations(
        tx,
        data,
        current.vehicleId,
        current.branchId,
      );
      if (data.requests !== undefined)
        await tx.appointmentRequest.deleteMany({
          where: { appointmentId: id },
        });
      if (data.status === "Checked In" && data.mileage !== undefined) {
        const vehicle = await loadVehicleForWarranty(tx, appointment.vehicleId);
        assertMileage(data.mileage, vehicle.lastRecordedMileage);
        const openCampaigns = await findOpenCampaigns(tx, vehicle);
        const check = buildCheck(vehicle, data.mileage, openCampaigns);
        const acknowledged = new Set(data.acknowledgedCampaignIds ?? []);
        const missing =
          (check.coverage.status === WarrantyCoverageStatus.ACTIVE &&
            !data.warrantyAcknowledged) ||
          openCampaigns.some((c) => !acknowledged.has(c.campaignId));
        if (missing) {
          throw new ConflictError(
            "Inform the customer and acknowledge the warranty status and open campaigns before check-in.",
          ).withCode("WARRANTY_ACK_REQUIRED", check);
        }
        await tx.vehicle.update({
          where: { id: vehicle.id },
          data: {
            lastRecordedMileage: Math.max(
              vehicle.lastRecordedMileage ?? 0,
              data.mileage,
            ),
            lastMileageAt: new Date(),
          },
        });
        checkInCampaigns = openCampaigns.map((c) => ({
          code: c.code,
          title: c.title,
        }));
      }
      const saved = await tx.serviceAppointment.update({
        where: { id },
        data: {
          scheduledAt: data.scheduledAt
            ? new Date(data.scheduledAt)
            : undefined,
          durationMins: data.durationMins,
          notes: data.notes,
          ...state,
          mileage: data.mileage,
          serviceId: data.serviceId,
          serviceTypeId: data.serviceTypeId,
          acFitted: data.acFitted,
          followUpJobId: data.followUpJobId,
          requests:
            data.requests !== undefined ? { create: requests } : undefined,
        },
        include: { requests: true },
      });
      await tx.auditLog.create({
        data: {
          userId: data.actorId,
          action: "BOOKING_UPDATED",
          details: JSON.stringify({
            bookingId: id,
            oldValue: current,
            newValue: saved,
          }),
        },
      });
      return bookingView(saved);
    });

    // ── Post-update notifications ─────────────────────────────────────────────
    const notificationService = new NotificationService();

    // Resolve customer + branch from the fetched appointment
    const customerName = appointment.customer
      ? `${appointment.customer.firstName} ${appointment.customer.lastName}`
      : "Customer";
    const branchName = appointment.branch?.name ?? "branch";
    const branchId: string = appointment.branchId;

    // 1. Reschedule notification
    if (isRescheduled) {
      const rescheduledPayload = {
        type: "APPOINTMENT_RESCHEDULED",
        title: "Appointment rescheduled",
        message: `Appointment for ${customerName} at ${branchName} rescheduled from ${new Date(oldScheduledAt).toLocaleString("en-GB", { timeZone: "Africa/Lagos" })} to ${new Date(data.scheduledAt!).toLocaleString("en-GB", { timeZone: "Africa/Lagos" })}.`,
        link: `/appointments/${id}`,
        branchId,
      };
      await Promise.all([
        notificationService.notifyRole(
          ROLES.CCU_OFFICER,
          branchId,
          rescheduledPayload,
        ),
        notificationService.notifyRole(
          ROLES.CCU_MANAGER,
          branchId,
          rescheduledPayload,
        ),
      ]);
    }

    // 2. Status-change notifications
    if (data.status && data.status !== appointment.status) {
      const newStatus = data.status;

      if (newStatus === "Checked In") {
        const payload = {
          type: "APPOINTMENT_CHECKED_IN",
          title:
            checkInCampaigns.length > 0
              ? "Checked in, open campaign"
              : "Appointment checked in",
          message:
            `${customerName} has checked in at ${branchName}.` +
            (checkInCampaigns.length > 0
              ? ` Open campaign work: ${checkInCampaigns.map((c) => `${c.code} ${c.title}`).join("; ")}.`
              : ""),
          link: `/appointments/${id}`,
          branchId,
        };
        await Promise.all([
          notificationService.notifyRole(
            ROLES.WORKSHOP_MANAGER,
            branchId,
            payload,
          ),
          notificationService.notifyRole(
            ROLES.SERVICE_ADVISOR,
            branchId,
            payload,
          ),
        ]);
      } else if (newStatus === "Cancelled") {
        const payload = {
          type: "APPOINTMENT_CANCELLED",
          title: "Appointment cancelled",
          message: `Appointment for ${customerName} at ${branchName} has been cancelled.`,
          link: `/appointments/${id}`,
          branchId,
        };
        await Promise.all([
          notificationService.notifyRole(ROLES.CCU_OFFICER, branchId, payload),
          notificationService.notifyRole(ROLES.CCU_MANAGER, branchId, payload),
          notificationService.notifyRole(
            ROLES.WORKSHOP_MANAGER,
            branchId,
            payload,
          ),
          notificationService.notifyRole(ROLES.ADMIN, undefined, payload),
          notificationService.notifyRole(ROLES.SUPER_ADMIN, undefined, payload),
        ]);
      } else if (newStatus === "Completed") {
        const payload = {
          type: "APPOINTMENT_COMPLETED",
          title: "Appointment completed",
          message: `Appointment for ${customerName} at ${branchName} has been completed.`,
          link: `/appointments/${id}`,
          branchId,
        };
        await Promise.all([
          notificationService.notifyRole(ROLES.CCU_OFFICER, branchId, payload),
          notificationService.notifyRole(ROLES.CCU_MANAGER, branchId, payload),
          notificationService.notifyRole(ROLES.ADMIN, undefined, payload),
          notificationService.notifyRole(ROLES.SUPER_ADMIN, undefined, payload),
        ]);
      }
    }

    return updated;
  }

  async deleteAppointment(id: string) {
    const appointment = await this.serviceRepository.findAppointmentById(id);
    if (!appointment) {
      throw new NotFoundError("Appointment not found");
    }
    // TODO(confirm): numbered bookings retain their audit trail; cancel them instead.
    if (
      appointment.bookingNumber ||
      appointment.jobCards.length ||
      appointment.bookingStatus !== "BOOKED"
    )
      throw new ConflictError(
        "Cancel this booking with a reason instead of deleting it",
      );
    await this.serviceRepository.deleteAppointment(id);
  }

  async convertAppointment(
    id: string,
    input: Record<string, unknown>,
    actorId: string,
  ) {
    const booking = await this.getAppointment(id);
    assertBookable(booking);
    const complaints = booking.requests.length
      ? bookingComplaints(booking.requests)
      : input.complaints;
    const data = jobOpeningBody.parse({
      ...input,
      appointmentId: id,
      customerId: booking.customerId,
      vehicleId: booking.vehicleId,
      branchName: booking.branch.name,
      serviceId: booking.serviceId ?? undefined,
      serviceTypeId: booking.serviceTypeId ?? input.serviceTypeId,
      acFitted: booking.acFitted ?? undefined,
      mileage: input.mileage ?? booking.mileage ?? undefined,
      description:
        input.description ??
        booking.notes ??
        booking.requests.map((row) => row.description).join("; "),
      complaints,
    });
    return new JobCardWorkflowService().open({
      ...data,
      createdById: actorId,
      bookingVersion: booking.updatedAt.toISOString(),
    });
  }

  async createJobCard(
    data: z.infer<typeof jobOpeningBody> & { createdById?: string },
  ) {
    return new JobCardWorkflowService().open(data);
  }

  async listJobCards(params?: {
    page?: number;
    limit?: number;
    branchId?: string;
    customerId?: string;
    search?: string;
    status?: string;
    unassignedTechnician?: boolean;
    jobType?: "SERVICE" | "PDI" | "ALL" | "HISTORY";
    dateFrom?: string;
    dateTo?: string;
    advisorId?: string;
    technicianId?: string;
    stages?: JobStage[];
  }) {
    const jobType =
      params?.jobType === "HISTORY"
        ? (await getPdiSettings()).includeInHistory
          ? "ALL"
          : "SERVICE"
        : params?.jobType;
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 50;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};
    if (params?.branchId) where.branchId = params.branchId;
    if (params?.customerId) where.customerId = params.customerId;
    if (params?.status) where.status = jobStatusFilter(params.status);

    if (params?.unassignedTechnician) where.technicianId = null;
    if (params?.technicianId) where.technicianId = params.technicianId;
    if (params?.advisorId) where.serviceAdvisorId = params.advisorId;
    if (params?.stages?.length) where.stage = { in: params.stages };
    if (jobType !== "ALL") where.jobType = jobType ?? "SERVICE";

    if (params?.search) {
      where.OR = [
        { jobNumber: { contains: params.search, mode: "insensitive" } },
        {
          customer: {
            phoneNumber: { contains: params.search, mode: "insensitive" },
          },
        },
        {
          customer: {
            companyName: { contains: params.search, mode: "insensitive" },
          },
        },
        { description: { contains: params.search, mode: "insensitive" } },
        {
          customer: {
            firstName: { contains: params.search, mode: "insensitive" },
          },
        },
        {
          customer: {
            lastName: { contains: params.search, mode: "insensitive" },
          },
        },
        { vehicle: { make: { contains: params.search, mode: "insensitive" } } },
        {
          vehicle: { model: { contains: params.search, mode: "insensitive" } },
        },
        { vehicle: { vin: { contains: params.search, mode: "insensitive" } } },
        {
          vehicle: {
            registrationNumber: {
              contains: params.search,
              mode: "insensitive",
            },
          },
        },
      ];
    }

    const createdAtFilter: Record<string, Date> = {};
    if (params?.dateFrom) createdAtFilter.gte = new Date(params.dateFrom);
    if (params?.dateTo)
      createdAtFilter.lte = new Date(
        params.dateTo.length === 10
          ? `${params.dateTo}T23:59:59.999Z`
          : params.dateTo,
      );
    if (Object.keys(createdAtFilter).length > 0)
      where.createdAt = createdAtFilter;

    const [jobCards, total] = await Promise.all([
      this.serviceRepository.listJobCards({
        skip,
        take: limit,
        branchId: params?.branchId,
        customerId: params?.customerId,
        search: params?.search,
        status: params?.status,
        unassignedTechnician: params?.unassignedTechnician,
        jobType,
        dateFrom: params?.dateFrom,
        dateTo: params?.dateTo,
        advisorId: params?.advisorId,
        technicianId: params?.technicianId,
        stages: params?.stages,
      }),
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

  async getJobCard(
    id: string,
    permissions: readonly string[] = [],
    role?: string,
    actorId?: string,
  ) {
    const card = await this.serviceRepository.findJobCardById(id);
    if (!card) {
      throw new NotFoundError("Job card not found");
    }
    const openingSignatureCurrent = await hasCurrentOpeningSignature(
      prisma,
      card,
    );

    // This vehicle's progress in each campaign the job card was opened for.
    const campaignVehicles =
      card.campaigns.length > 0 && card.vehicle
        ? await prisma.campaignVehicle.findMany({
            where: {
              campaignId: { in: card.campaigns.map((c) => c.campaignId) },
              OR: [
                { vehicleId: card.vehicle.id },
                { vin: card.vehicle.vin.toUpperCase() },
              ],
            },
            select: {
              campaignId: true,
              status: true,
              completedJobCardId: true,
            },
          })
        : [];
    // A FREE line charged to a campaign pre-sets its "work done" answer to yes.
    const freeLineCampaigns = new Set(
      card.campaigns.length > 0
        ? (
            await prisma.jobCardLine.findMany({
              where: {
                jobCardId: id,
                chargeType: "FREE",
                campaignId: { in: card.campaigns.map((c) => c.campaignId) },
              },
              select: { campaignId: true },
              distinct: ["campaignId"],
            })
          ).map((line) => line.campaignId)
        : [],
    );
    return scopeJobCard(
      {
        ...card,
        openingSignatureCurrent,
        canStartWork: card.advanceReceipts.some(
          (receipt) =>
            receipt.status === "ACTIVE" &&
            receipt.mode !== "CHEQUE" &&
            receipt.advanceAmount >= 0.01 &&
            receipt.issuedAt <= advanceReceiptDateLimit(),
        ),
        serviceCharge: card.serviceCharge == null ? null : Number(card.serviceCharge),
        // Request amounts (PDI defects; booking estimates on service jobs) as numbers, as the screens send them back.
        complaints: card.complaints.map((complaint) => ({
          ...complaint,
          spare: Number(complaint.spare),
          oil: Number(complaint.oil),
          labour: Number(complaint.labour),
        })),
        advanceSummary: (() => {
          const advances = card.advanceReceipts.filter(
            (receipt) =>
              receipt.status === "ACTIVE" &&
              receipt.mode !== "CHEQUE" &&
              receipt.issuedAt <= advanceReceiptDateLimit(),
          );
          const bills = [
            ...new Map(
              [...card.invoices, ...(card.consolidatedInvoices ?? [])].map(
                (invoice) => [invoice.id, invoice],
              ),
            ).values(),
          ].filter(
            (invoice) =>
              !["CANCELLED", "CANCELED", "VOID"].includes(
                invoice.status.toUpperCase(),
              ),
          );
          const total = bills.length
            ? sumMoney(bills.map((invoice) => invoice.total))
            : card.estimates[0]
              ? Number(approvedCustomerTotal(card.estimates[0]))
              : 0;
          const received = bills.length
            ? sumMoney(
                bills.map((invoice) =>
                  sumMoney([invoice.total, -invoice.outstandingAmount]),
                ),
              )
            : sumMoney(advances.map((receipt) => receipt.advanceAmount));
          const coverage = advanceCoverage(total, received);
          return {
            basis: bills.length ? "INVOICE" : "ESTIMATE",
            hasEstimate: card.estimates.length > 0,
            total,
            ...coverage,
            excessAmount: bills.length
              ? sumMoney(advances.map((receipt) => receipt.advanceAmount))
              : coverage.excessAmount,
            suggestedPercent:
              card.estimates[0]?.upfrontPaymentPercent.toNumber() ?? 60,
          };
        })(),
        invoices: [
          ...new Map(
            [...card.invoices, ...(card.consolidatedInvoices ?? [])].map(
              (invoice) => [invoice.id, invoice],
            ),
          ).values(),
        ],
        allowedTransitions: allowedJobTransitions(
          canonicalJobStatus(card.status),
          role,
          actorId ? { actorId, technicianId: card.technicianId } : undefined,
        ),
        // Money as numbers for the client; the staged estimate screens read GET /job-cards/:id/estimate.
        estimates: card.estimates.map((estimate) => ({
          ...estimate,
          amount: estimate.amount.toNumber(),
          customerTotal: Number(approvedCustomerTotal(estimate)),
          vatRate: estimate.vatRate.toNumber(),
          lines: estimate.lines.map((line) => ({
            ...line,
            quantity: line.quantity.toNumber(),
            rate: line.rate.toNumber(),
            amount: line.amount.toNumber(),
          })),
          upfrontPaymentPercent:
            estimate.upfrontPaymentPercent?.toNumber() ?? 60,
          upfrontAmount: upfrontAmount(
            Number(approvedCustomerTotal(estimate)),
            estimate.upfrontPaymentPercent ?? 60,
          ),
          contentHash: stagedContentHash(estimate),
          approvals: estimate.approvals.map((approval) => ({
            ...approval,
            signature: approval.signature
              ? { ...approval.signature, totalSigned: approval.signature.totalSigned.toNumber() }
              : approval.signature,
            signatureState: signatureState(estimate, approval),
          })),
        })),
        campaigns: card.campaigns.map((c) => ({
          ...c,
          vehicleStatus:
            campaignVehicles.find((v) => v.campaignId === c.campaignId)
              ?.status ?? null,
          hasFreeLine: freeLineCampaigns.has(c.campaignId),
        })),
      },
      permissions,
    );
  }

  async updateJobCard(
    id: string,
    data: z.infer<typeof jobUpdateBody>,
    actorId?: string,
  ) {
    return new JobCardWorkflowService().update(id, data, actorId);
  }

  /**
   * Creates the next estimate revision, or (draft: true) saves the undecided draft revision in place.
   * Prices come from the catalogue: parts at retail rate, labour at the vehicle model's rate, the
   * service charge by the existing rule. Each line keeps who pays (the warranty check's decision for
   * diagnosed items) and the request it answers.
   */
  async addEstimate(
    jobCardId: string,
    input: z.infer<typeof estimateBody>,
    actorId?: string,
    supersedesId?: string,
    options: {
      draft?: { estimateId: string; updatedAt: Date };
      /**
       * Repair (phase 6): a supplementary revision. These lines of the revision before are copied as they
       * are, with their prices and decisions; only `input.lines` (the new work) is priced.
       */
      supplementary?: { carried: CarriedEstimateLine[] };
    } = {},
  ) {
    const data = estimateBody.parse(input);
    const carried = options.supplementary?.carried ?? [];
    return prisma.$transaction(
      async (tx) => {
        await setNotificationActor(tx, actorId);
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${jobCardId} FOR UPDATE`,
        );
        const card = await tx.jobCard.findUnique({
          where: { id: jobCardId },
          include: {
            serviceType: { select: { description: true, chargedTo: true } },
            vehicle: { include: { catalogue: true } },
          },
        });
        if (!card) throw new NotFoundError("Job card not found");
        if (
          card.billedAt ||
          ["BILLED", "DELIVERED", "CANCELLED"].includes(
            canonicalJobStatus(card.status),
          )
        )
          throw new BadRequestError(
            "Estimates can only be added to unbilled jobs",
          );
        // A service type the company pays for (free services) is not charged to the customer, as on the bill.
        // TODO(confirm): free-service charge shown at zero on the customer's estimate.
        const companyPaidService = card.serviceType?.chargedTo === "COMPANY";
        const billable = [
          ...carried.filter((line) => line.type !== "COMPLAINT").map((line) => ({ type: line.type.replace("INCLUDED_", ""), referenceId: line.referenceId, quantity: Number(line.quantity) })),
          ...data.lines.filter((line) => line.type !== "COMPLAINT"),
        ];
        // A supplementary line for work or a part already on the estimate: say which, in plain words.
        const repeated = data.lines.find((line) => carried.some((old) => old.type.replace("INCLUDED_", "") === line.type && old.referenceId === line.referenceId));
        if (repeated)
          throw new BadRequestError(
            `${carried.find((old) => old.referenceId === repeated.referenceId)?.description ?? "This item"} is already on the approved estimate. A supplementary estimate can only add new work or parts.`,
          );
        // Each part record once: a used or local version of a part is its own record (source record).
        if (
          new Set(billable.map((line) => `${line.type}:${line.referenceId}`))
            .size !== billable.length
        )
          throw new BadRequestError(
            "Each service, part or labour operation can appear only once per estimate",
          );
        const services = billable.filter((line) => line.type === "SERVICE");
        const chargeReference = serviceChargeReference(card);
        if (
          chargeReference &&
          (services.length !== 1 ||
            services[0].referenceId !== chargeReference ||
            services[0].quantity !== 1)
        )
          throw new BadRequestError(
            "Include the selected job-card service exactly once with quantity 1",
          );
        if (
          data.lines.some(
            (line) =>
              line.includedInService && !["PART", "LABOUR"].includes(line.type),
          )
        )
          throw new BadRequestError(
            "Only parts and labour can be included in the service charge",
          );
        if (
          data.lines.some((line) => line.includedInService) &&
          services.length !== 1
        )
          throw new BadRequestError(
            "Package inclusions require the selected service line",
          );
        // Who pays for a diagnosed item was decided at the warranty check; the estimate keeps it.
        const itemIds = data.lines.flatMap((line) => (line.findingItemId ? [line.findingItemId] : []));
        const items = itemIds.length
          ? await tx.jobFindingItem.findMany({
              where: { id: { in: itemIds }, finding: { jobCardId } },
              select: { id: true, payer: true, finding: { select: { complaintId: true } } },
            })
          : [];
        const itemMap = new Map(items.map((item) => [item.id, item]));
        const complaintIds = data.lines.flatMap((line) => (line.complaintId ? [line.complaintId] : []));
        const knownComplaints = complaintIds.length
          ? new Set((await tx.jobComplaint.findMany({ where: { id: { in: complaintIds }, jobCardId }, select: { id: true } })).map((row) => row.id))
          : new Set<string>();
        const lines = [];
        for (const [index, line] of data.lines.entries()) {
          let description = line.description ?? "";
          let rate = 0;
          let quantity = line.quantity;
          let partSource: string | null = null;
          if (line.type === "PART") {
            const part = line.referenceId
              ? await tx.sparePart.findUnique({
                  where: { id: line.referenceId },
                })
              : null;
            if (!part) throw new BadRequestError("Select a part");
            if (part.retailRate == null)
              throw new BadRequestError(
                `Retail rate is not set for ${part.partNumber}. Ask the store to set it, then try again.`,
              );
            // Snapshot of the chosen record's source (part flag), kept for reporting.
            partSource = part.partFlag;
            description = part.name;
            rate = part.retailRate;
          } else if (line.type === "LABOUR") {
            const item = line.referenceId
              ? await tx.labourItem.findFirst({
                  where: { id: line.referenceId, active: true },
                })
              : null;
            if (!item)
              throw new BadRequestError("Select an active labour operation");
            const modelId = card.vehicle?.catalogue?.parentId;
            const modelRate = modelId
              ? await tx.labourRate.findFirst({
                  where: { labourItemId: item.id, modelId, active: true },
                })
              : null;
            description = item.description;
            rate = modelRate?.rate ?? item.rate;
            quantity = modelRate?.pricing === "FIXED" ? 1 : line.quantity;
          } else if (line.type === "SERVICE") {
            if (card.serviceTypeId && line.referenceId === card.serviceTypeId) {
              description = serviceChargeDescription(card);
              rate = companyPaidService || card.serviceCharge == null ? 0 : Number(card.serviceCharge);
            } else {
              const service = line.referenceId
                ? await tx.service.findFirst({
                    where: { id: line.referenceId, isActive: true },
                  })
                : null;
              if (!service)
                throw new BadRequestError("Select an active service");
              description = service.name;
              rate = (card.serviceCharge == null ? service.price : Number(card.serviceCharge));
            }
          } else if (line.referenceId) {
            const complaint = await tx.jobComplaint.findFirst({
              where: { id: line.referenceId, jobCardId },
            });
            if (!complaint)
              throw new BadRequestError("Complaint must belong to this job");
            description = complaint.description;
          }
          if (!description)
            throw new BadRequestError("Complaint description is required");
          const item = line.findingItemId ? itemMap.get(line.findingItemId) : undefined;
          if (line.findingItemId && !item)
            throw new BadRequestError(`${description}: the diagnosed item is no longer on this job. Reload the estimate.`);
          const decided = item?.payer ?? "CUSTOMER";
          const payer = line.payer ?? decided;
          // TODO(confirm): only the warranty officer changes who pays; lines the advisor adds are customer pay.
          if (payer !== decided)
            throw new BadRequestError(
              item
                ? `${description}: who pays was decided at the warranty check. Ask the warranty officer to change it.`
                : `${description}: lines you add are paid by the customer. Warranty items come from the warranty check.`,
            );
          const complaintId = line.complaintId ?? item?.finding.complaintId ?? null;
          if (line.complaintId && !knownComplaints.has(line.complaintId))
            throw new BadRequestError(`${description}: the customer request is no longer on this job. Reload the estimate.`);
          const { includedInService, findingItemId: _item, complaintId: _complaint, payer: _payer, ...fields } = line;
          lines.push({
            ...fields,
            partSource,
            type: includedInService ? `INCLUDED_${line.type}` : line.type,
            description,
            rate: includedInService ? 0 : rate,
            quantity,
            amount: includedInService ? 0 : lineAmount(quantity, rate),
            payer,
            findingItemId: line.findingItemId ?? null,
            complaintId,
            sortOrder: carried.length + index,
            carriedOver: false,
          });
        }
        // Earlier lines of a supplementary revision: copied unchanged, decision included.
        const copied = carried.map((line, index) => ({
          type: line.type,
          referenceId: line.referenceId,
          partSource: line.partSource,
          description: line.description,
          quantity: line.quantity,
          rate: line.rate,
          amount: line.amount,
          payer: line.payer,
          customerDecision: line.customerDecision,
          findingItemId: line.findingItemId,
          complaintId: line.complaintId,
          sortOrder: index,
          carriedOver: true,
        }));
        const amount = sumMoney([...copied.map((line) => Number(line.amount)), ...lines.map((line) => line.amount)]);
        const previous = (
          await tx.estimate.findMany({
            where: { jobCardId },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
            include: { lines: true, approvals: { select: { id: true } } },
          })
        )?.[0];
        if (options.draft) {
          // The undecided draft is edited in place: same revision, presentation cleared.
          if (!previous || previous.id !== options.draft.estimateId)
            throw new ConflictError("This estimate has a newer revision. Reload the estimate.");
          if (previous.approvals.length || previous.status !== "Pending")
            throw new ConflictError("The customer has already answered this estimate. Reload the estimate.");
          if (previous.updatedAt.getTime() !== options.draft.updatedAt.getTime())
            throw new ConflictError("Someone else saved this estimate after you opened it. Reload the estimate to see their changes.");
          await tx.estimateLine.deleteMany({ where: { estimateId: previous.id } });
          if (actorId)
            await tx.auditLog.create({
              data: {
                userId: actorId,
                action: "ESTIMATE_DRAFT_SAVED",
                details: JSON.stringify({
                  jobCardId,
                  estimateId: previous.id,
                  version: previous.version,
                  before: { amount: previous.amount.toNumber(), lines: previous.lines.length, upfrontPaymentPercent: previous.upfrontPaymentPercent.toNumber() },
                  after: { amount, lines: lines.length, upfrontPaymentPercent: data.upfrontPaymentPercent ?? 60 },
                }),
              },
            });
          return tx.estimate.update({
            where: { id: previous.id },
            data: {
              description: data.description,
              amount,
              upfrontPaymentPercent: data.upfrontPaymentPercent ?? 60,
              presentedAt: null,
              lines: { createMany: { data: [...copied, ...lines] } },
            },
            include: { lines: true },
          });
        }
        // A new scope needs a fresh QC result and fresh credit authorization.
        const reopening = canonicalJobStatus(card.status) === "READY";
        await supersedeCurrentInspection(tx, jobCardId);
        await tx.jobCard.update({
          where: { id: jobCardId },
          data: {
            creditApprovedById: null,
            ...(reopening
              ? {
                  status: "QC",
                  readyAt: null,
                  statusHistory: {
                    create: {
                      fromStatus: card.status,
                      toStatus: "QC",
                      actorId: actorId ?? card.createdById!,
                      remarks:
                        "Estimate revised; approval and quality check required",
                    },
                  },
                }
              : {}),
          },
        });
        // A ready job reopened for approval and QC goes back to the quality check step.
        await syncStage(tx, jobCardId, actorId ?? card.createdById ?? null);
        const revision = planEstimateRevision(
          previous && { ...previous, amount: Number(previous.amount) },
          supersedesId,
          { description: data.description, amount, lines },
        );
        if (previous)
          await tx.estimate.update({
            where: { id: previous.id },
            data: { status: "SUPERSEDED" },
          });
        if (actorId)
          await tx.auditLog.create({
            data: {
              userId: actorId,
              action: previous ? "ESTIMATE_REVISED" : "ESTIMATE_CREATED",
              details: JSON.stringify({
                jobCardId,
                supersedesId: revision.supersedesId,
                version: revision.version,
                ...revision.diff,
              }),
            },
          });
        // Strict ordering under the shared row lock, including transactions started earlier.
        const createdAt = new Date(
          Math.max(Date.now(), (previous?.createdAt?.getTime() ?? 0) + 1),
        );
        const settings = await getBranchSettings(card.branchId, tx);
        return tx.estimate.create({
          data: {
            createdAt,
            estimateDate: createdAt,
            upfrontPaymentPercent: data.upfrontPaymentPercent ?? 60,
            estimateNumber: await nextDocumentNumber(tx, "ESTIMATE"),
            version: revision.version,
            supersedesId: revision.supersedesId,
            jobCardId,
            description: data.description,
            currency: "NGN",
            status: "Pending",
            amount,
            vatRate: settings.labourVatPercent,
            supplementary: !!options.supplementary,
            lines: { createMany: { data: [...copied, ...lines] } },
          },
          include: { lines: true },
        });
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }

  /**
   * Records the customer's decision on the latest revision. With `decisions`, each customer-pay line is
   * approved or declined (the staged estimate); without, every customer line takes the overall answer
   * (customer portal). COUNTER decisions carry a signature (version 2 hash with the decisions); PHONE
   * decisions carry who approved, on which number and when, and the customer signs at delivery.
   * A retry with the same requestId returns the first decision.
   */
  async addApproval(
    estimateId: string,
    data: {
      customerId: string;
      approved?: boolean;
      consentAccepted?: boolean;
      decisionDate?: string;
      comments?: string;
      status?: string;
      expectedVersion?: number;
      expectedHash?: string;
      signerName?: string;
      relationship?: string;
      signerPhone?: string;
      signatureImage?: string;
      overrideReason?: string;
      decisions?: { lineId: string; decision: LineDecision }[];
      channel?: "COUNTER" | "PHONE";
      phone?: { approverName: string; approverPhone: string; approvedAt: Date };
      requestId?: string;
    },
    actorId?: string,
    capture?: { deviceOrIp: string; allowOverride?: boolean },
  ) {
    const identity = await prisma.estimate.findUnique({
      where: { id: estimateId },
      select: { jobCardId: true },
    });
    if (!identity?.jobCardId)
      throw new NotFoundError("Job-linked estimate not found");
    const approvalJobCardId = identity.jobCardId;
    const phone = data.channel === "PHONE";
    return prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${identity.jobCardId} FOR UPDATE`,
        );
        if (data.requestId) {
          const replay = await tx.customerApproval.findUnique({ where: { requestId: data.requestId } });
          if (replay) {
            if (replay.estimateId !== estimateId)
              throw new ConflictError("This request was already used for another estimate. Reload the page.");
            return replay;
          }
        }
        const estimates = await tx.estimate.findMany({
          where: { jobCardId: identity.jobCardId },
          ...latestEstimateQuery,
        });
        const estimate = estimates[0];
        if (!estimate || estimate.id !== estimateId)
          throw new ConflictError(
            "Only the latest estimate revision can receive a decision",
          );
        const card = await tx.jobCard.findUniqueOrThrow({
          where: { id: approvalJobCardId },
        });
        if (
          card.billedAt ||
          ["BILLED", "DELIVERED", "CANCELLED"].includes(
            canonicalJobStatus(card.status),
          )
        )
          throw new BadRequestError(
            "This job is closed for estimate decisions",
          );
        if (card.customerId !== data.customerId)
          throw new BadRequestError(
            "Approval must be from the bill-to customer",
          );
        if (estimate.approvals.length)
          throw new ConflictError(
            "This revision already has a decision. Create a new revision to change scope.",
          );
        if (!data.decisions && !data.approved && !data.comments?.trim())
          throw new BadRequestError("A decline reason is required");
        // The content the customer was shown: either hash form is accepted (older screens send version 1).
        if (
          (data.expectedVersion !== undefined && data.expectedVersion !== estimate.version) ||
          (data.expectedHash !== estimateContentHash(estimate) && data.expectedHash !== stagedContentHash(estimate))
        )
          throw new ConflictError(
            "The estimate changed. Reload it and show the customer the latest version.",
          );
        const staged = !!data.decisions;
        let decisionMap: Map<string, LineDecision | null>;
        if (staged) {
          const resolved = resolveDecisions(estimate.lines, data.decisions!);
          if (resolved.problems.length)
            throw new BadRequestError(resolved.problems[0].message).withCode("FIELD_VALIDATION", { field: "decisions", lineId: resolved.problems[0].lineId });
          decisionMap = resolved.decisions;
        } else {
          decisionMap = new Map(estimate.lines.map((line) => [line.id, line.payer === "CUSTOMER" ? (data.approved ? "APPROVED" : "DECLINED") : null]));
        }
        const decided = withDecisions(
          estimate.lines.map((line) => ({ ...line, customerDecision: line.customerDecision ?? null })),
          decisionMap,
        );
        const outcome = estimateOutcome(decided);
        const approved = outcome !== "ALL_DECLINED";
        const override = !phone && !!data.overrideReason?.trim();
        if (override && !capture?.allowOverride)
          throw new BadRequestError("Only Admin may override with a reason");
        if (!override && !phone) {
          if (!data.signatureImage || !data.signerName?.trim() || !actorId)
            throw new BadRequestError(
              "A customer signature and signer name are required; portal capture is not yet available",
            );
          assertSignaturePng(data.signatureImage);
          if (approved && !data.consentAccepted)
            throw new BadRequestError(
              "Accept the estimate terms before approving",
            );
          if (!staged) {
            const customer = await tx.customer.findUniqueOrThrow({
              where: { id: card.customerId! },
            });
            const customerName =
              `${customer.firstName} ${customer.lastName}`.trim();
            if (
              data.signerName.trim().toLowerCase() !==
                customerName.toLowerCase() &&
              !data.relationship?.trim()
            )
              throw new BadRequestError(
                "Relationship is required when signing for the customer",
              );
          }
        }
        const status = approved ? "Approved" : "Declined";
        if (approved) {
          const services = estimate.lines.filter(
            (line) => line.type === "SERVICE" && decisionMap.get(line.id) !== "DECLINED",
          );
          const chargeReference = serviceChargeReference(card);
          if (
            chargeReference &&
            (services.length !== 1 ||
              services[0].referenceId !== chargeReference ||
              Number(services[0].quantity) !== 1)
          )
            throw new BadRequestError(
              staged
                ? `Approve the ${serviceChargeDescription(card)} line, or ask the advisor to remove the service type before the customer approves`
                : "Revise the estimate to include the selected service exactly once",
            );
          if (services.length)
            await tx.jobCard.update({
              where: { id: card.id },
              data: { serviceCharge: services[0].amount },
            });
        }
        for (const line of estimate.lines) {
          const decision = decisionMap.get(line.id) ?? null;
          if ((line.customerDecision ?? null) !== decision)
            await tx.estimateLine.update({ where: { id: line.id }, data: { customerDecision: decision } });
        }
        const signedContent = { ...estimate, lines: decided };
        const hash = stagedContentHash(signedContent);
        const totals = estimateTotals(decided, estimate.vatRate);
        await tx.estimate.update({
          where: { id: estimateId },
          data: { status },
        });
        if (actorId)
          await tx.auditLog.create({
            data: {
              userId: actorId,
              action: phone ? "ESTIMATE_PHONE_APPROVAL_RECORDED" : "ESTIMATE_DECISION_RECORDED",
              details: JSON.stringify({
                jobCardId: card.id,
                estimateId,
                version: estimate.version,
                customerId: data.customerId,
                status,
                outcome,
                channel: phone ? "PHONE" : "COUNTER",
                approvedTotal: totals.approvedTotal,
                decisions: decided.filter((line) => line.customerDecision).map((line) => ({ lineId: line.id, description: line.description, decision: line.customerDecision })),
                comments: data.comments,
                overrideReason: data.overrideReason,
                ...(phone ? { approverName: data.phone!.approverName, approverPhone: data.phone!.approverPhone, approvedAt: data.phone!.approvedAt } : {}),
                contentHash: hash,
              }),
            },
          });
        const approval = await tx.customerApproval.create({
          data: {
            estimateId,
            customerId: data.customerId,
            approved,
            signatureRequired: true,
            overrideReason: override ? data.overrideReason!.trim() : null,
            decisionDate: phone ? data.phone!.approvedAt : new Date(),
            comments: data.comments,
            status,
            channel: phone ? "PHONE" : "COUNTER",
            contentHash: hash,
            requestId: data.requestId,
            ...(phone
              ? {
                  approverName: data.phone!.approverName,
                  approverPhone: data.phone!.approverPhone,
                  approvedAt: data.phone!.approvedAt,
                  recordedById: actorId,
                  signatureDueAtDelivery: true,
                }
              : {}),
          },
        });
        const terms =
          approved && !override && !phone
            ? await tx.documentTerms.findFirst({
                where: {
                  type: "JOB_ESTIMATE",
                  OR: [{ branchId: card.branchId }, { branchId: null }],
                },
                orderBy: { branchId: { sort: "asc", nulls: "last" } },
              })
            : null;
        if (!override && !phone)
          await tx.estimateSignature.create({
            data: {
              consentStatement: approved
                ? [
                    "I approve this estimate and accept its terms and conditions.",
                    ...(terms?.terms ?? []),
                  ].join("\n")
                : null,
              estimateId,
              approvalId: approval.id,
              imageReference: data.signatureImage!,
              signerName: data.signerName!.trim(),
              relationship: data.relationship?.trim(),
              signerPhone: data.signerPhone,
              capturedByUserId: actorId,
              deviceOrIp: capture?.deviceOrIp ?? "unknown",
              estimateVersion: estimate.version,
              totalSigned: totals.approvedTotal,
              contentHash: hash,
              hashVersion: ESTIMATE_HASH_VERSION,
            },
          });
        return approval;
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }

  async getApprovals(estimateId: string) {
    const estimate = await prisma.estimate.findUnique({
      where: { id: estimateId },
    });
    if (!estimate) {
      throw new NotFoundError("Estimate not found");
    }

    return this.serviceRepository.getApprovals(estimateId);
  }

  async listInspections(params?: InspectionListFilter & { page?: number; limit?: number }) {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 10;
    const skip = (page - 1) * limit;
    const filter = { branchId: params?.branchId, result: params?.result, search: params?.search };

    const [inspections, total] = await Promise.all([
      this.serviceRepository.listInspections({ ...filter, skip, take: limit }),
      prisma.inspection.count({ where: inspectionListWhere(filter) }),
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

    const where: Record<string, unknown> = { jobCardId: { not: null } };
    if (params?.branchId) where.jobCard = { branchId: params.branchId };
    if (params?.status) where.status = params.status;

    if (params?.search) {
      where.OR = [
        { description: { contains: params.search, mode: "insensitive" } },
        {
          jobCard: {
            jobNumber: { contains: params.search, mode: "insensitive" },
          },
        },
        {
          jobCard: {
            customer: {
              firstName: { contains: params.search, mode: "insensitive" },
            },
          },
        },
        {
          jobCard: {
            customer: {
              lastName: { contains: params.search, mode: "insensitive" },
            },
          },
        },
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

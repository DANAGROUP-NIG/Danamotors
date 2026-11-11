import { notifyWorkshopEvent } from '../notification/workshop-notifications';
import { JOB_TRANSITION_ROLES, assertTransitionRole } from "./job-transitions";
import { assertDepositPaid } from "./job-deposit.service";
import { sumMoney } from '../finance/money';
import { assertBookable, assertPromisedDate, bookingComplaints } from './booking.logic';
import { assertApprovedOperation, assertRecordedScope } from './estimate-approval';
import { getBranchSettings } from '../company-settings/company-settings.service';
import { Prisma, WarrantyCoverageStatus } from "@prisma/client";
import { z } from "zod";
import prisma from "../../prisma/client";
import {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "../../shared/errors/appError";
import { ROLES } from "../../shared/constants/roles";
import { nextDocumentNumber } from "../finance/document-number";
import { requireMaster } from "../workshop/workshop-master.service";
import { ServiceTypeService } from "../workshop/service-type.service";
import { resolveJobComplaints } from './job-card-complaints';
import { jobOpeningBody, jobUpdateBody } from "./service.validation";
import { NOTIFICATION_TYPES, NotificationService } from "../notification/notification.service";
import { assertMileage } from "../warranty/warranty.logic";
import { OpenCampaign, buildCheck, findOpenCampaigns, loadVehicleForWarranty } from "../warranty/warranty.coverage";
import { WarrantyCaseService, notifyWarrantyOfficers } from "../warranty/warrantyCase.service";
import { assertCampaignAttendance, completeCampaignVehiclesForJobCard, jobCardCampaignAttendance, markCampaignVehiclesInWorkshop } from "../campaign/campaign.hooks";
import { notAttendedReasonText, type NotAttendedReason } from "../campaign/campaign.logic";

export const JOB_TRANSITIONS: Record<string, readonly string[]> = Object.fromEntries(Object.entries(JOB_TRANSITION_ROLES).map(([from, next]) => [from, Object.keys(next)]));

// Legacy rows remain readable; new writes always use the canonical lifecycle.
export function canonicalJobStatus(status: string) {
  const aliases: Record<string, string> = {
    Open: "OPEN",
    Pending: "OPEN",
    "In Progress": "IN_PROGRESS",
    "On Hold": "IN_PROGRESS",
    "Quality Check": "QC",
    Ready: "READY",
    Completed: "READY",
    Billed: "BILLED",
    Closed: "DELIVERED",
    Cancelled: "CANCELLED",
  };

  return aliases[status] ?? status;
}

export function jobStatusFilter(status: string) {
  const canonical = canonicalJobStatus(status);
  return { in: ["OPEN", "IN_PROGRESS", "QC", "READY", "BILLED", "DELIVERED", "CANCELLED", "WAITING_PARTS", "Open", "Pending", "In Progress", "On Hold", "Quality Check", "Ready", "Completed", "Billed", "Closed", "Cancelled"].filter((value) => canonicalJobStatus(value) === canonical) };
}

export function repeatWindowStart(
  now = new Date(),
  days = Number(process.env.JOB_REPEAT_WINDOW_DAYS ?? 30),
) {
  if (!Number.isInteger(days) || days < 1 || days > 3650)
    throw new BadRequestError("Invalid repeat window days");

  return new Date(now.getTime() - days * 86400000);
}

// A previous job qualifies for a repeat when it is within the branch's repeat days, or within
// its repeat km of the current reading (legacy: either limit is enough).
export function repeatCandidateWhere(
  window: { repeatWindowDays: number; repeatWindowKm: number | null },
  mileage?: number,
  now = new Date(),
): Prisma.JobCardWhereInput {
  return {
    OR: [
      { createdAt: { gte: repeatWindowStart(now, window.repeatWindowDays) } },
      ...(window.repeatWindowKm && mileage !== undefined
        ? [{ mileage: { gte: mileage - window.repeatWindowKm, lte: mileage } }]
        : []),
    ],
  };
}

export function assertTransition(
  from: string,
  to: string,
  input: {
    remarks?: string;
    promisedAt: Date | null;
    lateReasonIds?: string[];
  },
  now: Date,
) {
  if (!JOB_TRANSITIONS[canonicalJobStatus(from)]?.includes(to))
    throw new BadRequestError(`Cannot move from ${from} to ${to}`);

  if (to === "CANCELLED" && !input.remarks?.trim())
    throw new BadRequestError("Cancellation requires a reason");

  if (to === "DELIVERED") {
    if (!input.promisedAt)
      throw new BadRequestError("A promised delivery time is required");

    if (now > input.promisedAt && !input.lateReasonIds?.length)
      throw new BadRequestError("Late delivery requires at least one reason");

    if ((input.lateReasonIds?.length ?? 0) > 6)
      throw new BadRequestError(
        "At most six late-delivery reasons are allowed",
      );
  }
}

async function openingField<T>(field: string, action: () => T | Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) {
    if (error instanceof AppError && !error.details) error.withCode(error.code ?? 'FIELD_VALIDATION', { field });
    throw error;
  }
}

async function requireStaff(
  tx: Prisma.TransactionClient,
  id: string,
  branchId: string,
  role?: string,
) {
  const user = await tx.user.findFirst({
    where: {
      id,
      branchId,
      isActive: true,

      ...(role
        ? {
            role: {
              name: role,
            },
          }
        : {}),
    },
  });

  if (!user)
    throw new BadRequestError(
      "Select an active staff member with the required role in this branch",
    ).withCode("FIELD_VALIDATION", { field: role === ROLES.TECHNICIAN ? "technicianId" : role === ROLES.ENGINEER ? "engineerId" : "serviceAdvisorId" });

  return user;
}

export class JobCardWorkflowService {
  async open(
    input: z.infer<typeof jobOpeningBody> & {
      createdById?: string;
      bookingVersion?: string;
    },
  ) {
    const { createdById, bookingVersion, ...body } = input;

    if (!createdById) throw new UnauthorizedError();

    const data = jobOpeningBody.parse(body);
    if (!data.appointmentId) assertPromisedDate(data.promisedAt, new Date());

    const result = await prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findFirst({
        where: {
          name: data.branchName,
          isActive: true,
        },
      });

      if (!branch) throw new NotFoundError("Active branch not found").withCode("FIELD_VALIDATION", { field: "branchName" });

      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "Vehicle" WHERE id = ${data.vehicleId} FOR UPDATE`,
      );

      const vehicle = await openingField("vehicleId", () => loadVehicleForWarranty(tx, data.vehicleId));

      if (
        !(await tx.customer.findFirst({
          where: {
            id: data.customerId,
            mergedIntoId: null,
          },
        }))
      )
        throw new NotFoundError("Customer not found").withCode("FIELD_VALIDATION", { field: "customerId" });

      // Odometer only moves forward, except for an audited replacement.
      await openingField("mileage", () => assertMileage(data.mileage, vehicle.lastRecordedMileage, data.odometerReplaced));

      // Warranty & campaign check: the server recomputes coverage from today's mileage and
      // refuses the job card (409 WARRANTY_ACK_REQUIRED) unless the adviser acknowledged a
      // covered vehicle and every open campaign.
      const openCampaigns = await findOpenCampaigns(tx, vehicle);
      const check = buildCheck(vehicle, data.mileage, openCampaigns);
      const acknowledged = new Set(data.acknowledgedCampaignIds ?? []);
      const unacknowledgedCampaigns = openCampaigns.filter((c) => !acknowledged.has(c.campaignId));
      const coverageNeedsAck = check.coverage.status === WarrantyCoverageStatus.ACTIVE && !data.warrantyAcknowledged;
      if (coverageNeedsAck || unacknowledgedCampaigns.length > 0)
        throw new ConflictError(
          coverageNeedsAck
            ? "This vehicle is under warranty. Inform the customer and acknowledge the warranty before creating the job card."
            : `This vehicle has open campaigns (${unacknowledgedCampaigns.map((c) => c.code).join(", ")}). Acknowledge them before creating the job card.`,
        ).withCode("WARRANTY_ACK_REQUIRED", check);

      if (data.appointmentId) {
        await tx.$queryRaw`SELECT id FROM "ServiceAppointment" WHERE id = ${data.appointmentId} FOR UPDATE`;
        const appointment = await tx.serviceAppointment.findUnique({
          where: {
            id: data.appointmentId,
          },
          include: { requests: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
        });

        if (
          !appointment ||
          appointment.branchId !== branch.id ||
          appointment.vehicleId !== vehicle.id ||
          appointment.customerId !== data.customerId
        )
          throw new BadRequestError(
            "Appointment must match the vehicle and branch",
          ).withCode("FIELD_VALIDATION", { field: "appointmentId" });

        assertBookable(appointment);
        assertPromisedDate(data.promisedAt, appointment.scheduledAt);
        data.remarks = [appointment.notes, data.remarks].filter(Boolean).join("\n") || undefined;
        if (bookingVersion && appointment.updatedAt.toISOString() !== bookingVersion) throw new ConflictError("Booking changed; reload before converting");
        if (appointment.serviceTypeId && appointment.serviceTypeId !== data.serviceTypeId) throw new ConflictError('Booking service changed; reload before converting');
        data.serviceId = appointment.serviceId ?? undefined;
        data.acFitted = appointment.acFitted ?? data.acFitted;
        if (appointment.acFitted !== null) data.acType = undefined;
        if (appointment.requests.length) data.complaints = bookingComplaints(appointment.requests);

        if (
          await tx.jobCard.count({
            where: {
              appointmentId: appointment.id,

            },
          })
        )
          throw new BadRequestError("Appointment already has a job card").withCode("FIELD_VALIDATION", { field: "appointmentId" });
      }

      await openingField("bayId", () => requireMaster(tx, data.bayId, "BAY"));

      const serviceType = await openingField("serviceTypeId", () => new ServiceTypeService().requireAvailable(
        tx, vehicle.id, data.serviceTypeId, new Date(),
      ));
      // Appointment services remain a separate catalogue and are never used
      // to determine the opening dropdown or its model-specific charge.
      if (data.serviceId && !(await tx.service.findFirst({
        where: { id: data.serviceId, isActive: true }, select: { id: true },
      }))) throw new BadRequestError("Select an active appointment service");

      if (data.teamId) await openingField("teamId", () => requireMaster(tx, data.teamId!, "TEAM"));

      await requireStaff(
        tx,
        data.serviceAdvisorId,
        branch.id,
        ROLES.SERVICE_ADVISOR,
      );

      if (data.engineerId) await requireStaff(tx, data.engineerId, branch.id, ROLES.ENGINEER);

      if (data.technicianId)
        await requireStaff(tx, data.technicianId, branch.id, ROLES.TECHNICIAN);

      if (data.isRepeat) {
        const previous = await tx.jobCard.findFirst({
          where: {
            id: data.previousJobId,
            vehicleId: vehicle.id,
            ...repeatCandidateWhere(await getBranchSettings(branch.id, tx), data.mileage),

            status: {
              notIn: ["CANCELLED", "Cancelled"],
            },
          },
        });

        if (!previous)
          throw new BadRequestError(
            "Previous job must be for this vehicle within the repeat window",
          );
      }

      const complaints = await resolveJobComplaints(tx, data.complaints);

      const tyres = data.tyres
        ? await Promise.all(
            data.tyres.map(async (tyre) => ({
              number: tyre.number ?? "",
              make: tyre.makeId
                ? (await requireMaster(tx, tyre.makeId, "TYRE_MAKE"))
                    .description
                : "",
              makeId: tyre.makeId ?? "",
            })),
          )
        : undefined;
      const batteryMake = data.batteryMakeId
        ? (await requireMaster(tx, data.batteryMakeId, "BATTERY_MAKE"))
            .description
        : undefined;
      const hasRequestAmounts = data.complaints.some(
        (row) =>
          row.spare !== undefined ||
          row.oil !== undefined ||
          row.labour !== undefined,
      );
      const sum = (key: "spare" | "oil" | "labour") => sumMoney(complaints.map(row => row[key]));
      const estimatedParts = hasRequestAmounts
        ? sum("spare")
        : data.estimatedParts;
      const estimatedOil = hasRequestAmounts ? sum("oil") : data.estimatedOil;
      const estimatedLabour = hasRequestAmounts
        ? sum("labour")
        : data.estimatedLabour;
      const {
        tyres: _tyres,
        batteryMakeId: _batteryMakeId,
        branchName: _branchName,
        complaints: _complaints,
        odometerReplaced,
        odometerReplacedReason,
        warrantyAcknowledged: _warrantyAcknowledged,
        acknowledgedCampaignIds: _acknowledgedCampaignIds,
        promisedAt,
        ...fields
      } = data;
      const now = new Date();

      const serviceCharge = data.serviceCharge ?? serviceType.serviceCharge;
      const card = await tx.jobCard.create({
        data: {
          ...fields,
          serviceCharge,
          tyres,
          batteryMake,
          acFitted: data.acType ? data.acType !== "NONE" : data.acFitted,
          estimatedParts,
          estimatedOil,
          estimatedLabour,
          estimatedCost: [
            estimatedParts,
            estimatedOil,
            estimatedLabour,
            serviceCharge,
          ].some((value) => value !== undefined)
            ? sumMoney([estimatedParts ?? 0, estimatedOil ?? 0, estimatedLabour ?? 0, serviceCharge ?? 0])
            : data.estimatedCost,
          branchId: branch.id,
          createdById,
          promisedAt: new Date(promisedAt),
          status: "OPEN",
          jobNumber: await nextDocumentNumber(tx, "JOB_CARD"),

          complaints: {
            create: complaints,
          },

          statusHistory: {
            create: {
              toStatus: "OPEN",
              actorId: createdById,
            },
          },

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
            odometerReplaced: Boolean(odometerReplaced),
            odometerReplacedReason: odometerReplaced ? odometerReplacedReason!.trim() : null,
            previousMileage: vehicle.lastRecordedMileage,
          } as unknown as Prisma.InputJsonValue,
          ...(check.requiresAcknowledgement && { warrantyAcknowledgedById: createdById, warrantyAcknowledgedAt: now }),
        },
      });

      if (data.appointmentId) {
        await tx.serviceAppointment.update({ where: { id: data.appointmentId }, data: { bookingStatus: 'CONVERTED' } });
        await tx.auditLog.create({ data: { userId: createdById, action: 'BOOKING_CONVERTED', details: JSON.stringify({ bookingId: data.appointmentId, jobCardId: card.id, branchId: branch.id }) } });
      }

      await tx.vehicle.update({
        where: {
          id: vehicle.id,
        },

        data: {
          lastRecordedMileage: odometerReplaced ? data.mileage : Math.max(vehicle.lastRecordedMileage ?? 0, data.mileage),
          lastMileageAt: now,
        },
      });

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
        await markCampaignVehiclesInWorkshop(tx, openCampaigns.map((c) => c.campaignVehicleId), vehicle.id);
      }

      const warrantyCase =
        check.coverage.status === WarrantyCoverageStatus.ACTIVE
          ? await new WarrantyCaseService().openForJobCard(tx, {
              jobCardId: card.id,
              vehicleId: vehicle.id,
              customerId: card.customerId,
              branchId: branch.id,
              complaint: card.description,
              mileage: data.mileage,
              coverageStatus: check.coverage.status,
              actorId: createdById,
              automatic: true,
            })
          : null;

      return { card, check, openCampaigns, warrantyCase, vehicle, branch };
    }, { maxWait: 5000, timeout: 15000 });

    await notifyWarrantyJob(result);
    if (result.card.technicianId) await notifyWorkshopEvent('TECHNICIAN_ASSIGNED', result.card.id, result.card.technicianId);
    return { ...result.card, warrantyCase: result.warrantyCase, warrantyCheck: result.check };
  }

  async update(
    id: string,
    input: z.infer<typeof jobUpdateBody>,
    actorId?: string,
  ) {
    if (!actorId) throw new UnauthorizedError();

    const data = jobUpdateBody.parse(input);

    let transitionId: string | undefined;
    const card = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${id} FOR UPDATE`,
      );

      const current = await tx.jobCard.findUnique({
        where: {
          id,
        },

        include: {
          invoices: true,
          consolidatedInvoices: true,
        },
      });

      if (!current) throw new NotFoundError("Job card not found");
      current.invoices.push(...(current.consolidatedInvoices ?? []));

      const from = canonicalJobStatus(current.status);

      if (["DELIVERED", "CANCELLED"].includes(from))
        throw new BadRequestError("This job card is closed");

      const billed =
        from === "BILLED" ||
        !!current.billedAt ||
        current.invoices.some(
          (bill) =>
            !["CANCELLED", "CANCELED", "VOID"].includes(
              bill.status.toUpperCase(),
            ),
        );

      if (
        billed &&
        (data.status !== "DELIVERED" ||
          data.description !== undefined ||
          data.observations !== undefined ||
          data.workDone !== undefined ||
          data.serviceCharge !== undefined ||
          data.engineerId !== undefined)
      )
        throw new BadRequestError("Billed job cards can only be delivered");

      if (data.engineerId) await requireStaff(tx, data.engineerId, current.branchId, ROLES.ENGINEER);

      const now = new Date();

      const update: Prisma.JobCardUncheckedUpdateInput = {
        description: data.description,
        observations: data.observations,
        workDone: data.workDone,
        serviceCharge: data.serviceCharge,
        engineerId: data.engineerId,
        ...(data.serviceCharge !== undefined ? { estimatedCost: [current.estimatedParts, current.estimatedOil, current.estimatedLabour, data.serviceCharge].reduce<number>((sum, value) => sum + Math.round((value ?? 0) * 100), 0) / 100 } : {}),
      };

      if (data.status && data.status !== from && ['IN_PROGRESS', 'QC', 'READY'].includes(data.status)) {
        await assertApprovedOperation(tx, id, current.customerId, []);
      }
      if (data.status === 'IN_PROGRESS' && data.status !== from) await assertDepositPaid(tx, id);
      if (data.status === 'READY' && current.qcStatus?.toUpperCase() !== 'PASSED') throw new BadRequestError('Record a passed quality check before marking the job Ready');

      if (data.status === 'READY' || (data.status === 'DELIVERED' && !billed)) await assertRecordedScope(tx, id);
      if (data.status && data.status !== from) {
        const actor = await tx.user.findUnique({ where: { id: actorId }, include: { role: true } });
        if (!actor?.isActive) throw new UnauthorizedError();
        assertTransitionRole(from, data.status, actor.role.name, actorId, current.technicianId);
        if (from === 'QC' && data.status === 'IN_PROGRESS' && current.qcStatus?.toUpperCase() !== 'FAILED') throw new BadRequestError('QC must fail before returning the job for rework');
        assertTransition(
          from,
          data.status,
          {
            ...data,
            promisedAt: current.promisedAt,
          },
          now,
        );

        if (data.status === "DELIVERED") {
          if ((!billed || current.invoices.some(invoice => !["CANCELLED", "CANCELED", "VOID"].includes(invoice.status.toUpperCase()) && invoice.outstandingAmount > 0)) && !current.creditApprovedById)
            throw new BadRequestError(
              "Delivery requires a fully paid bill or approved credit",
            );

          if (!data.deliveryAdvisorId)
            throw new BadRequestError("Select a delivery advisor");

          await requireStaff(
            tx,
            data.deliveryAdvisorId,
            current.branchId,
            ROLES.SERVICE_ADVISOR,
          );

          for (const reason of data.lateReasonIds ?? [])
            await requireMaster(tx, reason, "LATE_REASON");

          update.deliveredAt = now;
          update.deliveryAdvisorId = data.deliveryAdvisorId;
          update.lateReasonIds = data.lateReasonIds ?? [];
          update.gatePassNumber = await nextDocumentNumber(
            tx,
            "GATE_PASS",
            now,
          );
        }

        if (data.status === "READY") {
          update.readyAt = now;
          // Every linked campaign needs a done / not done answer. Campaigns marked done are
          // completed for the vehicle; the others go back to outstanding.
          await assertCampaignAttendance(tx, id, actorId);
          await completeCampaignVehiclesForJobCard(tx, id);
        }

        update.status = data.status;

        const history = await tx.jobCardStatusHistory.create({
          data: {
            jobCardId: id,
            fromStatus: from,
            toStatus: data.status,
            actorId,
            remarks: data.remarks,
          },
        });
        transitionId = history?.id;
      }

      return tx.jobCard.update({
        where: {
          id,
        },

        data: update,
      });
    }, { maxWait: 5000, timeout: 15000 });

    if (transitionId && data.status === 'QC') await notifyWorkshopEvent('JOB_SENT_FOR_QC', id, transitionId);
    if (transitionId && data.status === 'WAITING_PARTS') await notifyWorkshopEvent('PARTS_UNAVAILABLE', id, transitionId);
    if (transitionId && data.status === 'READY') await notifyWorkshopEvent('JOB_READY', id, transitionId);
    if (transitionId && card.status === "READY" && data.status === "READY") {
      await new NotificationService().notifyRole(
        ROLES.BILLING_OFFICER,
        card.branchId,
        {
          type: "JOB_CARD_READY_FOR_BILLING",
          title: "Job card ready for billing",
          message: `Job card ${card.jobNumber} is ready to be billed.`,
          link: `/invoices/new?jobCardId=${card.id}`,
          branchId: card.branchId,
        },
      );
    }

    return card;
  }

  /**
   * Records whether the work of a linked campaign was done on this job. Allowed until the job
   * card is closed; once the job is READY or BILLED the campaign vehicle follows the new answer.
   */
  async setCampaignAttendance(
    id: string,
    campaignId: string,
    input: { attended: boolean; reason?: NotAttendedReason | null; note?: string | null },
    actorId: string,
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${id} FOR UPDATE`);
      const card = await tx.jobCard.findUnique({ where: { id }, select: { status: true } });
      if (!card) throw new NotFoundError("Job card not found");
      const status = canonicalJobStatus(card.status);
      if (["DELIVERED", "CANCELLED"].includes(status)) throw new BadRequestError("This job card is closed");
      const link = await tx.jobCardCampaign.findUnique({ where: { jobCardId_campaignId: { jobCardId: id, campaignId } }, select: { campaignId: true } });
      if (!link) throw new NotFoundError("This campaign is not linked to the job card");
      if (!input.attended && !input.reason) throw new BadRequestError("Give the reason the campaign work was not done");

      await tx.jobCardCampaign.update({
        where: { jobCardId_campaignId: { jobCardId: id, campaignId } },
        data: {
          attended: input.attended,
          attendedAt: new Date(),
          attendedById: actorId,
          notAttendedReason: input.attended ? null : notAttendedReasonText(input.reason!, input.note),
        },
      });
      if (["READY", "BILLED"].includes(status)) await completeCampaignVehiclesForJobCard(tx, id, [campaignId]);
      return jobCardCampaignAttendance(tx, id);
    });
  }

  /** Authorizes delivery before full payment. Allowed once, on a READY or BILLED job. */
  async approveCredit(id: string, actorId: string, remarks: string) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.jobCard.updateMany({
        where: { id, OR: [{ status: jobStatusFilter("READY") }, { status: jobStatusFilter("BILLED") }], creditApprovedById: null },
        data: { creditApprovedById: actorId },
      });
      if (!updated.count)
        throw new ConflictError(
          "Credit approval requires a READY or BILLED job without an existing approval",
        );
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "JOB_CREDIT_APPROVED",
          details: JSON.stringify({
            jobCardId: id,
            remarks,
          }),
        },
      });
      return updated;
    });
  }
}

/** After a job card commits: tell warranty officers about a warranty job, and the adviser about open campaigns. */
async function notifyWarrantyJob(result: {
  card: { id: string; jobNumber: string; description: string; mileage: number | null; customerId: string | null; createdById: string | null };
  warrantyCase: { id: string; caseNumber: string } | null;
  openCampaigns: Pick<OpenCampaign, "code" | "title">[];
  vehicle: { vin: string; make: string | null; model: string | null };
  branch: { id: string; name: string };
}) {
  const { card, warrantyCase, openCampaigns, vehicle, branch } = result;
  if (!warrantyCase && (openCampaigns.length === 0 || !card.createdById)) return;
  const customer = card.customerId
    ? await prisma.customer.findUnique({ where: { id: card.customerId }, select: { firstName: true, lastName: true, phoneNumber: true } })
    : null;
  const who = customer ? `${customer.firstName} ${customer.lastName}${customer.phoneNumber ? ` (${customer.phoneNumber})` : ""}` : "Customer";
  const car = [vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle";
  const km = card.mileage != null ? `${card.mileage.toLocaleString("en-NG")} km` : "mileage not recorded";

  if (warrantyCase) {
    await notifyWarrantyOfficers(branch.id, {
      type: NOTIFICATION_TYPES.WARRANTY_JOB_CREATED,
      title: "Warranty job opened",
      message: `${who} · ${car} · VIN ${vehicle.vin} · ${km} · job card ${card.jobNumber} at ${branch.name}. Complaint: ${card.description}. Case ${warrantyCase.caseNumber} opened.`,
      link: `/warranty/${warrantyCase.id}`,
      branchId: branch.id,
    });
  }
  if (openCampaigns.length > 0 && card.createdById) {
    await new NotificationService().notifyUsers([card.createdById], {
      type: NOTIFICATION_TYPES.CAMPAIGN_VEHICLE_CHECKED_IN,
      title: "Open campaign on this vehicle",
      message: `Job card ${card.jobNumber} (${car}, VIN ${vehicle.vin}) has open campaign work: ${openCampaigns
        .map((c) => `${c.code} ${c.title}`)
        .join("; ")}. Include it in the job.`,
      link: `/job-cards/${card.id}`,
      branchId: branch.id,
    });
  }
}

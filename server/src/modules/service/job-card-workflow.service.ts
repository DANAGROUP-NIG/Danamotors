import { assertApprovedOperation, assertRecordedScope } from './estimate-approval';
import { Prisma, WarrantyCoverageStatus } from "@prisma/client";
import { z } from "zod";
import prisma from "../../prisma/client";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "../../shared/errors/appError";
import { ROLES } from "../../shared/constants/roles";
import { nextDocumentNumber } from "../finance/document-number";
import { requireMaster } from "../workshop/workshop-master.service";
import { jobOpeningBody, jobUpdateBody } from "./service.validation";
import { linkEstimateToOpenedJob } from "./pre-job-estimate.service";
import { NOTIFICATION_TYPES, NotificationService } from "../notification/notification.service";
import { assertMileage } from "../warranty/warranty.logic";
import { OpenCampaign, buildCheck, findOpenCampaigns, loadVehicleForWarranty } from "../warranty/warranty.coverage";
import { WarrantyCaseService, notifyWarrantyOfficers } from "../warranty/warrantyCase.service";
import { completeCampaignVehiclesForJobCard, markCampaignVehiclesInWorkshop } from "../campaign/campaign.hooks";

export const JOB_TRANSITIONS: Record<string, readonly string[]> = {
  OPEN: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["QC", "CANCELLED"],
  QC: ["READY", "CANCELLED"],
  READY: ["BILLED", "DELIVERED", "CANCELLED"],
  BILLED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

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
  return { in: ["OPEN", "IN_PROGRESS", "QC", "READY", "BILLED", "DELIVERED", "CANCELLED", "Open", "Pending", "In Progress", "On Hold", "Quality Check", "Ready", "Completed", "Billed", "Closed", "Cancelled"].filter((value) => canonicalJobStatus(value) === canonical) };
}

export function repeatWindowStart(
  now = new Date(),
  days = Number(process.env.JOB_REPEAT_WINDOW_DAYS ?? 30),
) {
  if (!Number.isInteger(days) || days < 1 || days > 3650)
    throw new BadRequestError("Invalid JOB_REPEAT_WINDOW_DAYS configuration");

  return new Date(now.getTime() - days * 86400000);
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
    );

  return user;
}

export class JobCardWorkflowService {
  async open(
    input: z.infer<typeof jobOpeningBody> & {
      createdById?: string;
    },
  ) {
    const { createdById, ...body } = input;

    if (!createdById) throw new UnauthorizedError();

    const data = jobOpeningBody.parse(body);

    const result = await prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findFirst({
        where: {
          name: data.branchName,
          isActive: true,
        },
      });

      if (!branch) throw new NotFoundError("Active branch not found");

      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "Vehicle" WHERE id = ${data.vehicleId} FOR UPDATE`,
      );

      const vehicle = await loadVehicleForWarranty(tx, data.vehicleId);

      if (
        !(await tx.customer.findFirst({
          where: {
            id: data.customerId,
            mergedIntoId: null,
          },
        }))
      )
        throw new NotFoundError("Customer not found");

      // Odometer only moves forward, except for an audited replacement.
      assertMileage(data.mileage, vehicle.lastRecordedMileage, data.odometerReplaced);

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
        const appointment = await tx.serviceAppointment.findUnique({
          where: {
            id: data.appointmentId,
          },
        });

        if (
          !appointment ||
          appointment.branchId !== branch.id ||
          appointment.vehicleId !== vehicle.id
        )
          throw new BadRequestError(
            "Appointment must match the vehicle and branch",
          );

        if (["Cancelled", "Completed", "Closed", "No Show"].includes(appointment.status))
          throw new BadRequestError("Appointment is no longer open");

        if (
          await tx.jobCard.count({
            where: {
              appointmentId: appointment.id,

              status: {
                notIn: ["CANCELLED", "Cancelled"],
              },
            },
          })
        )
          throw new BadRequestError("Appointment already has a job card");
      }

      await requireMaster(tx, data.bayId, "BAY");

      const service = await tx.service.findFirst({
        where: { id: data.serviceId, isActive: true },
        select: { id: true, price: true },
      });
      if (!service) throw new BadRequestError("Select an active service");

      if (data.teamId) await requireMaster(tx, data.teamId, "TEAM");
      if (data.serviceTypeId) await requireMaster(tx, data.serviceTypeId, "SERVICE_TYPE");

      await requireStaff(
        tx,
        data.serviceAdvisorId,
        branch.id,
        ROLES.SERVICE_ADVISOR,
      );

      if (data.technicianId)
        await requireStaff(tx, data.technicianId, branch.id, ROLES.TECHNICIAN);

      if (data.isRepeat) {
        const previous = await tx.jobCard.findFirst({
          where: {
            id: data.previousJobId,
            vehicleId: vehicle.id,

            createdAt: {
              gte: repeatWindowStart(),
            },

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

      const complaints: {
        complaintCodeId?: string;
        defectCode?: string;
        description: string;
        spare: number;
        oil: number;
        labour: number;
      }[] = [];

      for (const complaint of data.complaints) {
        const code = complaint.complaintCodeId
          ? await requireMaster(tx, complaint.complaintCodeId, "COMPLAINT")
          : null;

        complaints.push({
          complaintCodeId: code?.id,
          defectCode: code?.code ?? complaint.defectCode,
          spare: complaint.spare ?? 0,
          oil: complaint.oil ?? 0,
          labour: complaint.labour ?? 0,
          description: complaint.description || code!.description,
        });
      }

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
      const sum = (key: "spare" | "oil" | "labour") =>
        complaints.reduce(
          (total, row) => total + Math.round(row[key] * 100),
          0,
        ) / 100;
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
        estimateId,
        promisedAt,
        ...fields
      } = data;
      const now = new Date();

      const serviceCharge = data.serviceCharge ?? service.price ?? 0;
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
            ? [
                estimatedParts,
                estimatedOil,
                estimatedLabour,
                serviceCharge,
              ].reduce<number>(
                (total, value) => total + Math.round((value ?? 0) * 100),
                0,
              ) / 100
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

      await tx.vehicle.update({
        where: {
          id: vehicle.id,
        },

        data: {
          lastRecordedMileage: odometerReplaced ? data.mileage : Math.max(vehicle.lastRecordedMileage ?? 0, data.mileage),
          lastMileageAt: now,
        },
      });

      // The job was opened from a pre-job estimate: it is now converted.
      if (estimateId) await linkEstimateToOpenedJob(tx, estimateId, { id: card.id, vehicleId: vehicle.id, branchId: branch.id });

      // The booking arrived: it now counts as converted on the service booking report.
      if (data.appointmentId)
        await tx.serviceAppointment.update({ where: { id: data.appointmentId }, data: { bookingStatus: "CONVERTED" } });

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
    return { ...result.card, warrantyCase: result.warrantyCase, warrantyCheck: result.check };
  }

  async update(
    id: string,
    input: z.infer<typeof jobUpdateBody>,
    actorId?: string,
  ) {
    if (!actorId) throw new UnauthorizedError();

    const data = jobUpdateBody.parse(input);

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
        },
      });

      if (!current) throw new NotFoundError("Job card not found");

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
          data.serviceTypeId !== undefined ||
          data.freeServiceCouponNo !== undefined)
      )
        throw new BadRequestError("Billed job cards can only be delivered");

      if (data.serviceTypeId) await requireMaster(tx, data.serviceTypeId, "SERVICE_TYPE");

      const now = new Date();

      const update: Prisma.JobCardUncheckedUpdateInput = {
        description: data.description,
        observations: data.observations,
        workDone: data.workDone,
        serviceCharge: data.serviceCharge,
        serviceTypeId: data.serviceTypeId,
        freeServiceCouponNo: data.freeServiceCouponNo === undefined ? undefined : data.freeServiceCouponNo || null,
        ...(data.serviceCharge !== undefined ? { estimatedCost: [current.estimatedParts, current.estimatedOil, current.estimatedLabour, data.serviceCharge].reduce<number>((sum, value) => sum + Math.round((value ?? 0) * 100), 0) / 100 } : {}),
      };

      if (data.status && data.status !== from && ['IN_PROGRESS', 'QC', 'READY'].includes(data.status)) {
        await assertApprovedOperation(tx, id, current.customerId, []);
      }
      if (data.status === 'READY' && current.qcStatus?.toUpperCase() !== 'PASSED') throw new BadRequestError('Record a passed quality check before marking the job Ready');
      if (data.status === 'READY' || (data.status === 'DELIVERED' && !billed)) await assertRecordedScope(tx, id);
      if (data.status && data.status !== from) {
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
          // The campaign work this job card was opened for is done once the job is ready.
          await completeCampaignVehiclesForJobCard(tx, id);
        }

        update.status = data.status;

        await tx.jobCardStatusHistory.create({
          data: {
            jobCardId: id,
            fromStatus: from,
            toStatus: data.status,
            actorId,
            remarks: data.remarks,
          },
        });
      }

      return tx.jobCard.update({
        where: {
          id,
        },

        data: update,
      });
    }, { maxWait: 5000, timeout: 15000 });

    if (card.status === "READY" && data.status === "READY") {
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

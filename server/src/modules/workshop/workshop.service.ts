import { notifyWorkshopEvent } from "../notification/workshop-notifications";
import { enqueueWorkshopNotification } from "../notification/workshop-notification-outbox";
import { setNotificationActor } from "../notification/jobcard-notification-router";
import { assertRecordedScope } from "../service/estimate-approval";
import { Prisma } from "@prisma/client";
import { collectionContentHash } from "./part-collection";
import { assertSignaturePng } from "../service/estimate-signature";
import { WorkshopRepository } from "./workshop.repository";
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  ConflictError,
} from "../../shared/errors/appError";
import prisma from "../../prisma/client";
import { jobUpdateBody } from "../service/service.validation";
import { canonicalJobStatus } from "../service/job-card-workflow.service";
import { ServiceService } from "../service/service.service";
import { requireServiceJobAction } from "../service/service-job-policy";
import { ROLES } from "../../shared/constants/roles";

export class WorkshopService {
  private workshopRepository: WorkshopRepository;

  constructor() {
    this.workshopRepository = new WorkshopRepository();
  }

  async listTechnicians(params?: {
    page?: number;
    limit?: number;
    branchId?: string;
    search?: string;
    activeOnly?: boolean;
  }) {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      role: { is: { name: "Technician" } },
    };
    if (params?.branchId) where.branchId = params.branchId;
    if (params?.activeOnly) where.isActive = true;

    if (params?.search) {
      where.OR = [
        { firstName: { contains: params.search, mode: "insensitive" } },
        { lastName: { contains: params.search, mode: "insensitive" } },
        { email: { contains: params.search, mode: "insensitive" } },
      ];
    }

    const [technicians, total] = await Promise.all([
      this.workshopRepository.listTechnicians({
        skip,
        take: limit,
        branchId: params?.branchId,
        search: params?.search,
        activeOnly: params?.activeOnly,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      technicians: await this.withJobCounts(technicians, params?.branchId),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async withJobCounts<T extends { id: string }>(
    technicians: T[],
    branchId?: string,
  ) {
    if (!technicians.length) return [];
    const counts = await prisma.jobCard.groupBy({
      by: ["technicianId", "status"],
      where: {
        branchId,
        technicianId: { in: technicians.map((technician) => technician.id) },
      },
      _count: { _all: true },
    });
    const totals = new Map<string, { openJobs: number; closedJobs: number }>();
    for (const row of counts) {
      if (!row.technicianId) continue;
      const total = totals.get(row.technicianId) ?? {
        openJobs: 0,
        closedJobs: 0,
      };
      const closed = ["BILLED", "DELIVERED", "CANCELLED"].includes(
        canonicalJobStatus(row.status),
      );
      if (closed) total.closedJobs += row._count._all;
      else total.openJobs += row._count._all;
      totals.set(row.technicianId, total);
    }
    return technicians.map((technician) => {
      return {
        ...technician,
        ...(totals.get(technician.id) ?? { openJobs: 0, closedJobs: 0 }),
      };
    });
  }

  /** Records immutable collection evidence for the assigned technician, once per issuance. */
  async receiveParts(id: string, actorId: string, signatureImage: string) {
    assertSignaturePng(signatureImage);
    return prisma.$transaction(async (tx) => {
      const owner = await tx.partIssuance.findUnique({
        where: { id },
        select: { jobCardId: true },
      });
      if (!owner?.jobCardId)
        throw new NotFoundError("Job part issuance not found");
      // Match assignment, billing and stock writers: job first, issuance second.
      await tx.$queryRaw`SELECT id FROM "JobCard" WHERE id = ${owner.jobCardId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "PartIssuance" WHERE id = ${id} FOR UPDATE`;
      const issue = await tx.partIssuance.findUnique({
        where: { id },
        include: {
          jobCard: true,
          requisitionLine: { include: { requisition: true } },
        },
      });
      if (!issue?.jobCard)
        throw new NotFoundError("Job part issuance not found");
      if (issue.requisitionLine?.requisition.status === "CANCELLED")
        throw new BadRequestError("This requisition is cancelled");
      const actor = await tx.user.findUnique({
        where: { id: actorId },
        include: { role: true },
      });
      if (
        !actor?.isActive ||
        actor.role.name !== "Technician" ||
        actor.branchId !== issue.branchId ||
        issue.jobCard.technicianId !== actorId
      )
        throw new ForbiddenError(
          "Only the assigned technician may confirm part collection",
        );
      if (issue.receivedAt) return issue;
      if (
        issue.jobCard.billedAt ||
        ["READY", "BILLED", "DELIVERED", "CANCELLED"].includes(
          canonicalJobStatus(issue.jobCard.status),
        )
      )
        throw new BadRequestError("This job card is no longer open");
      const signedAt = new Date();
      const contentHash = collectionContentHash(
        { ...issue, jobCardId: issue.jobCard.id },
        actorId,
        signedAt,
        signatureImage,
      );
      await tx.partCollectionSignature.create({
        data: {
          issuanceId: id,
          signerId: actorId,
          signedAt,
          contentHash,
          signatureImage,
        },
      });
      const received = await tx.partIssuance.update({
        where: { id },
        data: { receivedById: actorId, receivedAt: signedAt },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "PART_RECEIVED",
          details: JSON.stringify({
            partIssuanceId: id,
            jobCardId: issue.jobCard.id,
          }),
        },
      });
      await enqueueWorkshopNotification(
        tx,
        "PART_RECEIVED",
        issue.jobCard,
        id,
        actorId,
      );
      return received;
    });
  }

  async assignTechnician(
    id: string,
    technicianId: string,
    qualityInspectorId?: string,
    actorId?: string,
    workflowVersion?: number,
  ) {
    const jobCard = await this.workshopRepository.findJobCardById(id);
    if (!jobCard) {
      throw new NotFoundError("Job card not found");
    }

    if (jobCard.billedAt)
      throw new BadRequestError("Billed job cards cannot be edited");
    if (
      ["READY", "DELIVERED", "CANCELLED"].includes(
        canonicalJobStatus(jobCard.status),
      )
    )
      throw new BadRequestError("This job card is no longer open");
    const technician = await prisma.user.findUnique({
      where: { id: technicianId },
      include: { role: true },
    });
    if (
      !technician ||
      !technician.isActive ||
      technician.role.name !== "Technician"
    ) {
      throw new NotFoundError("Technician not found");
    }
    if (technician.branchId !== jobCard.branchId)
      throw new BadRequestError(
        "Technician must belong to the job card branch",
      );

    if (qualityInspectorId) {
      const inspector = await prisma.user.findUnique({
        where: { id: qualityInspectorId },
      });
      if (!inspector || !inspector.isActive) {
        throw new NotFoundError("Quality inspector not found");
      }
      if (inspector.branchId !== jobCard.branchId)
        throw new BadRequestError(
          "Quality inspector must belong to the job card branch",
        );
    }

    const updatedJobCard = await prisma.$transaction(async (tx) => {
      await setNotificationActor(tx, actorId);
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${id} FOR UPDATE`,
      );
      const current = await tx.jobCard.findUniqueOrThrow({
        where: { id },
        include: { serviceWorkflow: true },
      });
      if (
        current.billedAt ||
        ["READY", "BILLED", "DELIVERED", "CANCELLED"].includes(
          canonicalJobStatus(current.status),
        )
      )
        throw new BadRequestError("This job card is no longer open");
      if (current.serviceWorkflow) {
        const actor = actorId
          ? await tx.user.findUnique({
              where: { id: actorId },
              include: { role: true },
            })
          : null;
        if (!actor?.isActive)
          throw new ForbiddenError("An active staff account is required");
        const stage = requireServiceJobAction(
          current.technicianId ? "reassignTechnician" : "assignTechnician",
          {
            stage: current.serviceWorkflow.stage,
            technicianId: current.technicianId,
            actorId: actor.id,
            role: actor.role.name,
            warrantyBypassEnabled: false,
          },
        );
        if (
          current.technicianId === technicianId &&
          (qualityInspectorId === undefined ||
            qualityInspectorId === current.qualityInspectorId)
        )
          return current;
        const completedWork = await tx.jobCardStatusHistory.findFirst({
          where: { jobCardId: id, toStatus: "QC" },
          select: { id: true },
        });
        if (completedWork)
          throw new ConflictError(
            "Technician assignment is locked once work is complete",
          ).withCode("WORKFLOW_STAGE_CONFLICT");
        if (workflowVersion !== current.serviceWorkflow.version)
          throw new ConflictError(
            "Refresh the job card before changing its Technician assignment",
          ).withCode("WORKFLOW_VERSION_CONFLICT");
        if (current.technicianId !== technicianId) {
          await tx.serviceJobWorkflow.update({
            where: { jobCardId: id, version: current.serviceWorkflow.version },
            data: { stage, version: { increment: 1 } },
          });
          await tx.jobCardStatusHistory.create({
            data: {
              jobCardId: id,
              fromStatus: current.serviceWorkflow.stage,
              toStatus: stage,
              actorId: actor.id,
              remarks: current.technicianId
                ? "Technician reassigned"
                : "Technician assigned",
            },
          });
          if (current.technicianId) {
            await enqueueWorkshopNotification(
              tx,
              "TECHNICIAN_UNASSIGNED",
              current,
              String(workflowVersion + 1),
              actor.id,
            );
          }
        }
      }
      const updated = await tx.jobCard.update({
        where: { id },
        data: { technicianId, qualityInspectorId },
      });
      if (actorId)
        await tx.auditLog.create({
          data: {
            userId: actorId,
            action: "TECHNICIAN_ASSIGNED",
            details: JSON.stringify({
              jobCardId: id,
              previousTechnicianId: current.technicianId,
              technicianId,
              qualityInspectorId,
            }),
          },
        });
      return updated;
    });

    await notifyWorkshopEvent("TECHNICIAN_ASSIGNED", id, technicianId);

    return updatedJobCard;
  }

  async updateProgress(
    id: string,
    _progress: number,
    status?: string,
    actorId?: string,
  ) {
    const jobCard = await this.workshopRepository.findJobCardById(id);
    if (!jobCard) {
      throw new NotFoundError("Job card not found");
    }

    if (jobCard.billedAt)
      throw new BadRequestError("Billed job cards cannot be edited");
    if (
      ["READY", "DELIVERED", "CANCELLED"].includes(
        canonicalJobStatus(jobCard.status),
      )
    )
      throw new BadRequestError("This job card is no longer open");
    if (!status)
      throw new BadRequestError(
        "Use the job-card lifecycle instead of progress percentages",
      );
    return new ServiceService().updateJobCard(
      id,
      jobUpdateBody.parse({ status: canonicalJobStatus(status) }),
      actorId,
    );
  }

  async updateQC(
    id: string,
    qcStatus: string,
    qcNotes?: string,
    actorId?: string,
    workflowVersion?: number,
  ) {
    const jobCard = await this.workshopRepository.findJobCardById(id);
    if (!jobCard) {
      throw new NotFoundError("Job card not found");
    }

    if (jobCard.billedAt)
      throw new BadRequestError("Billed job cards cannot be edited");
    if (
      ["READY", "DELIVERED", "CANCELLED"].includes(
        canonicalJobStatus(jobCard.status),
      )
    )
      throw new BadRequestError("This job card is no longer open");
    return prisma.$transaction(
      async (tx) => {
        await setNotificationActor(tx, actorId);
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${id} FOR UPDATE`,
        );
        const current = await tx.jobCard.findUniqueOrThrow({
          where: { id },
          include: { serviceWorkflow: true },
        });
        if (
          current.billedAt ||
          ["READY", "BILLED", "DELIVERED", "CANCELLED"].includes(
            canonicalJobStatus(current.status),
          )
        )
          throw new BadRequestError("This job card is no longer open");
        const workflow = current.serviceWorkflow;
        if (workflow) {
          const actor = actorId
            ? await tx.user.findUnique({
                where: { id: actorId },
                include: { role: true },
              })
            : null;
          if (!actor?.isActive || actor.role.name !== ROLES.QC_OFFICER)
            throw new ForbiddenError(
              "Only a QC Officer can record this review",
            );
          const notes = qcNotes?.trim();
          if (!notes || notes.length > 5000)
            throw new BadRequestError(
              "Enter QC remarks with up to 5000 characters",
            ).withCode("FIELD_VALIDATION", { field: "qcNotes" });
          if (qcStatus !== "PASSED" && qcStatus !== "FAILED")
            throw new BadRequestError("Select Passed or Failed").withCode(
              "FIELD_VALIDATION",
              { field: "qcStatus" },
            );
          const duplicate =
            workflowVersion === workflow.version - 1 &&
            current.qcStatus === qcStatus &&
            current.qcNotes === notes;
          if (duplicate) return current;
          if (workflowVersion !== workflow.version)
            throw new ConflictError(
              "Refresh the job card before recording QC",
            ).withCode("WORKFLOW_VERSION_CONFLICT");
          const stage = requireServiceJobAction(
            qcStatus === "PASSED" ? "passQc" : "failQc",
            {
              stage: workflow.stage,
              technicianId: current.technicianId,
              actorId: actor.id,
              role: actor.role.name,
              warrantyBypassEnabled: false,
            },
          );
          if (qcStatus === "PASSED") await assertRecordedScope(tx, id);
          await tx.serviceJobWorkflow.update({
            where: { jobCardId: id, version: workflow.version },
            data: { stage, version: { increment: 1 } },
          });
          await tx.jobCardStatusHistory.create({
            data: {
              jobCardId: id,
              fromStatus: workflow.stage,
              toStatus: stage,
              actorId: actor.id,
              remarks: notes,
            },
          });
          return tx.jobCard.update({
            where: { id },
            data: {
              qcStatus,
              qcNotes: notes,
              ...(qcStatus === "FAILED" ? { status: "IN_PROGRESS" } : {}),
            },
          });
        }
        if (canonicalJobStatus(current.status) !== "QC")
          throw new BadRequestError(
            "Send this job for QC before recording a review",
          );
        if (
          current.qcStatus === qcStatus &&
          (current.qcNotes ?? "") === (qcNotes ?? "")
        )
          return current;
        if (qcStatus === "PASSED") await assertRecordedScope(tx, id);
        const reviewed = await tx.jobCard.update({
          where: { id },
          data: { qcStatus, qcNotes },
        });
        if (actorId && current.qcStatus !== qcStatus) {
          await tx.auditLog.create({
            data: {
              userId: actorId,
              action: "JOB_QC_OUTCOME_CHANGED",
              details: JSON.stringify({
                jobCardId: id,
                branchId: current.branchId,
                previousOutcome: current.qcStatus,
                outcome: qcStatus,
              }),
            },
          });
        }
        return reviewed;
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }
}

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
} from "../../shared/errors/appError";
import prisma from "../../prisma/client";
import { jobUpdateBody } from "../service/service.validation";
import { canonicalJobStatus } from "../service/job-card-workflow.service";
import { syncStage } from "../service/job-stage.writer";
import { DIAGNOSIS_SUPERVISORS, IN_WORKSHOP_STAGES, availability, canAllocate, diagnosisSubStep } from "../service/job-diagnosis.logic";
import { ConflictError } from "../../shared/errors/appError";
import { ServiceService } from "../service/service.service";

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
    // One grouped query for the page: open and closed totals, and the jobs in the workshop now.
    const counts = await prisma.jobCard.groupBy({
      by: ["technicianId", "status", "stage"],
      where: {
        branchId,
        technicianId: { in: technicians.map((technician) => technician.id) },
      },
      _count: { _all: true },
    });
    const totals = new Map<string, { openJobs: number; closedJobs: number; jobsInHand: number }>();
    const inWorkshop = new Set<string>(IN_WORKSHOP_STAGES);
    for (const row of counts) {
      if (!row.technicianId) continue;
      const total = totals.get(row.technicianId) ?? {
        openJobs: 0,
        closedJobs: 0,
        jobsInHand: 0,
      };
      if (inWorkshop.has(row.stage)) total.jobsInHand += row._count._all;
      const closed = ["BILLED", "DELIVERED", "CANCELLED"].includes(
        canonicalJobStatus(row.status),
      );
      if (closed) total.closedJobs += row._count._all;
      else total.openJobs += row._count._all;
      totals.set(row.technicianId, total);
    }
    return technicians.map((technician) => {
      const total = totals.get(technician.id) ?? { openJobs: 0, closedJobs: 0, jobsInHand: 0 };
      return { ...technician, ...total, availability: availability(total.jobsInHand) };
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

  /**
   * Assigns the technician (and inspector). At Diagnosis this is the supervisor's allocation: it
   * also needs a bay, keeps the note to the technician and takes a request ID so a double click
   * assigns once. The job's team follows the technician's employee team, for the reports.
   */
  async assignTechnician(
    id: string,
    technicianId: string,
    qualityInspectorId?: string,
    actorId?: string,
    allocation: { bayId?: string; note?: string; requestId?: string; actorRole?: string } = {},
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
      include: { role: true, employee: { select: { teamId: true } } },
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

    if (allocation.bayId) {
      const bay = await prisma.workshopMaster.findFirst({
        where: { id: allocation.bayId, kind: "BAY", active: true },
        select: { id: true },
      });
      if (!bay)
        throw new BadRequestError("Choose an active bay").withCode("FIELD_VALIDATION", { field: "bayId" });
    }

    const updatedJobCard = await prisma.$transaction(async (tx) => {
      await setNotificationActor(tx, actorId);
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${id} FOR UPDATE`,
      );
      // A repeated request ID (double click, retry after a dropped connection) assigns once.
      if (allocation.requestId) {
        const replay = await tx.jobStageEvent.findUnique({
          where: { jobCardId_requestId: { jobCardId: id, requestId: allocation.requestId } },
          select: { id: true },
        });
        if (replay) return { job: await tx.jobCard.findUniqueOrThrow({ where: { id } }), replayed: true };
      }
      const current = await tx.jobCard.findUniqueOrThrow({
        where: { id },
        include: { diagnosis: { select: { submittedAt: true, returnedAt: true } } },
      });
      const atDiagnosis = current.stage === "DIAGNOSIS";
      if (atDiagnosis) {
        const subStep = diagnosisSubStep(current.technicianId, current.diagnosis);
        const actor = { id: actorId ?? "", role: allocation.actorRole ?? "" };
        if (!canAllocate(subStep, actor))
          throw (DIAGNOSIS_SUPERVISORS.includes(actor.role)
            ? new ConflictError("The service engineer is reviewing the findings. The technician can be changed after the engineer returns the job.")
            : new ForbiddenError("Only the workshop supervisor can assign the technician and bay.")
          ).withCode("ALLOCATION_LOCKED");
        if (!allocation.bayId && !current.bayId)
          throw new BadRequestError("Choose a bay").withCode("FIELD_VALIDATION", { field: "bayId" });
      }
      if (
        current.billedAt ||
        ["READY", "BILLED", "DELIVERED", "CANCELLED"].includes(
          canonicalJobStatus(current.status),
        )
      )
        throw new BadRequestError("This job card is no longer open");
      const teamId = technician.employee?.teamId ?? current.teamId;
      const updated = await tx.jobCard.update({
        where: { id },
        data: { technicianId, qualityInspectorId, teamId, ...(allocation.bayId ? { bayId: allocation.bayId } : {}) },
      });
      if (atDiagnosis) {
        const note = allocation.note?.trim() || null;
        await tx.jobDiagnosis.upsert({
          where: { jobCardId: id },
          create: { jobCardId: id, allocationNote: note, allocatedById: actorId ?? null, allocatedAt: new Date() },
          update: { allocationNote: note, allocatedById: actorId ?? null, allocatedAt: new Date() },
        });
      }
      // The technician now holds diagnosis or repair, and the inspector holds the quality check.
      await syncStage(tx, id, actorId ?? null, allocation.requestId ? { action: "ASSIGNED", requestId: allocation.requestId, note: allocation.note } : undefined);
      if (actorId)
        await tx.auditLog.create({
          data: {
            userId: actorId,
            action: "TECHNICIAN_ASSIGNED",
            details: JSON.stringify({
              jobCardId: id,
              branchId: current.branchId,
              previousTechnicianId: current.technicianId,
              technicianId,
              qualityInspectorId,
              previousBayId: current.bayId,
              bayId: updated.bayId,
              teamId,
              requestId: allocation.requestId ?? null,
            }),
          },
        });
      return { job: updated, replayed: false };
    });

    if (!updatedJobCard.replayed) await notifyWorkshopEvent("TECHNICIAN_ASSIGNED", id, technicianId);

    return updatedJobCard.job;
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
        const current = await tx.jobCard.findUniqueOrThrow({ where: { id } });
        if (
          current.billedAt ||
          ["READY", "BILLED", "DELIVERED", "CANCELLED"].includes(
            canonicalJobStatus(current.status),
          )
        )
          throw new BadRequestError("This job card is no longer open");
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
        // A changed QC result after the handoff to billing returns the job to the quality check step.
        await syncStage(tx, id, actorId ?? null);
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

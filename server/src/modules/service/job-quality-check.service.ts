import { JobCardType, Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { PERMISSIONS, ROLES } from "../../shared/constants/roles";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors/appError";
import { drainJobcardNotifications, queueQcReviewNotification } from "../notification/jobcard-notification-router";
import { assertSignaturePng } from "./estimate-signature";
import { QC_STATE_SELECT, qcStateFrom, supersedeCurrentInspection } from "./job-qc-state";
import {
  CERTIFICATION_STATEMENT,
  QC_GENERAL_CHECKS,
  inspectionChecks,
  inspectionContentHash,
  passProblems,
  qualityCheckFieldProblems,
  readChecks,
  type QualityCheckInput,
} from "./job-quality-check.logic";
import { STAGE_ROLES } from "./job-stage.logic";
import { JobStageService } from "./job-stage.service";
import type { RepairActor } from "./job-repair.service";

type Tx = Prisma.TransactionClient;
const TX = { maxWait: 5000, timeout: 20000 };
const lock = (tx: Tx, jobId: string) => tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${jobId} FOR UPDATE`);
const fullName = (user: { firstName: string; lastName: string } | null | undefined) => (user ? `${user.firstName} ${user.lastName}`.trim() : null);
const has = (actor: RepairActor, permission: string) => actor.role === ROLES.SUPER_ADMIN || actor.permissions.includes(permission);

export const QC_DENIED = "Only the workshop supervisor or the service manager can do the quality check.";

const person = { select: { firstName: true, lastName: true } } as const;
const jobSelect = {
  id: true,
  jobNumber: true,
  branchId: true,
  jobType: true,
  stage: true,
  status: true,
  mileage: true,
  technicianId: true,
  qualityInspectorId: true,
  serviceAdvisorId: true,
  deliveryAdvisorId: true,
  createdById: true,
  customerId: true,
  promisedAt: true,
  ...QC_STATE_SELECT,
} satisfies Prisma.JobCardSelect;
type QcJob = Prisma.JobCardGetPayload<{ select: typeof jobSelect }>;

/** Who may record the check: the quality check's roles (supervisors, service manager) with qcstatus:update. */
function recordProblem(job: Pick<QcJob, "stage" | "jobType">, actor: RepairActor): { kind: "forbidden" | "blocked"; message: string } | null {
  if (job.jobType === JobCardType.PDI) return { kind: "blocked", message: "PDI job cards are checked from the PDI menu." };
  if (!STAGE_ROLES.QUALITY_CHECK.includes(actor.role) || !has(actor, PERMISSIONS.QCSTATUS_UPDATE) || !has(actor, PERMISSIONS.JOBCARD_UPDATE))
    return { kind: "forbidden", message: QC_DENIED };
  if (job.stage !== "QUALITY_CHECK") return { kind: "blocked", message: "This job is not at the quality check. Reload the job." };
  return null;
}

export class JobQualityCheckService {
  private readonly stages = new JobStageService();

  /** The quality check step: approved work, general checks, every inspection so far, and what this person may do. */
  async view(jobId: string, actor: RepairActor) {
    const job = await prisma.jobCard.findUnique({ where: { id: jobId }, select: jobSelect });
    if (!job) throw new NotFoundError("Job card not found");
    const [workLines, inspections] = await Promise.all([
      prisma.jobWorkLine.findMany({
        where: { jobCardId: jobId },
        orderBy: [{ supplementary: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, description: true, kind: true, supplementary: true, status: true, doneAt: true, reopenedAt: true, technician: person },
      }),
      prisma.inspection.findMany({
        where: { jobCardId: jobId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          result: true,
          checks: true,
          notes: true,
          roadTestStartKm: true,
          roadTestEndKm: true,
          roadTestNotes: true,
          acOutletTempC: true,
          certifiedAt: true,
          supersededAt: true,
          createdAt: true,
          inspector: person,
          certifiedBy: person,
          signature: { select: { signedAt: true } },
        },
      }),
    ]);
    const problem = recordProblem(job, actor);
    return {
      jobCardId: job.id,
      jobNumber: job.jobNumber,
      stage: job.stage,
      state: qcStateFrom(job),
      statement: CERTIFICATION_STATEMENT,
      generalChecks: QC_GENERAL_CHECKS,
      /** The check-in odometer, offered as the road test start. */
      startKm: job.mileage ?? null,
      workLines: workLines.map((line) => ({
        id: line.id,
        description: line.description,
        kind: line.kind,
        supplementary: line.supplementary,
        status: line.status,
        doneAt: line.doneAt,
        reopened: !!line.reopenedAt,
        technician: fullName(line.technician),
      })),
      history: inspections.map((row) => {
        const checks = readChecks(row.checks);
        return {
          id: row.id,
          result: row.result,
          at: row.createdAt,
          current: !row.supersededAt,
          inspector: fullName(row.inspector),
          notes: row.notes,
          failedLines: checks.lines.filter((line) => line.result === "FAIL").map((line) => line.description),
          lines: checks.lines,
          general: checks.general,
          roadTest: row.roadTestStartKm === null && row.roadTestEndKm === null ? null : { startKm: row.roadTestStartKm, endKm: row.roadTestEndKm, notes: row.roadTestNotes },
          acOutletTempC: row.acOutletTempC?.toFixed(1) ?? null,
          certified: row.certifiedAt ? { by: fullName(row.certifiedBy), at: row.certifiedAt, signed: !!row.signature } : null,
        };
      }),
      access: { canRecord: !problem, reason: problem?.message ?? null },
    };
  }

  /**
   * Pass or fail, in one transaction under the job lock: the inspection (and the certification
   * signature on a pass), then the stage action through the one workflow path. Pass moves Quality
   * check to Billing with the service advisor; fail returns the job to Repair and reopens the failed
   * work lines. A repeated requestId records once.
   */
  async record(jobId: string, actor: RepairActor, input: QualityCheckInput) {
    await prisma.$transaction(async (tx) => {
      await lock(tx, jobId);
      const replay = await tx.inspection.findUnique({ where: { jobCardId_requestId: { jobCardId: jobId, requestId: input.requestId } }, select: { result: true } });
      if (replay) {
        if ((replay.result === "PASSED") !== (input.outcome === "PASS"))
          throw new ConflictError("This request was already used for a different result. Reload the job and try again.").withCode("QC_REQUEST_REUSED");
        return;
      }
      const job = await tx.jobCard.findUnique({ where: { id: jobId }, select: jobSelect });
      if (!job) throw new NotFoundError("Job card not found");
      const problem = recordProblem(job, actor);
      if (problem?.kind === "forbidden") throw new ForbiddenError(problem.message).withCode("QC_FORBIDDEN");
      if (problem) throw new ConflictError(problem.message).withCode("QC_BLOCKED", { reasons: [problem.message] });

      const workLines = await tx.jobWorkLine.findMany({
        where: { jobCardId: jobId },
        orderBy: [{ supplementary: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, description: true },
      });
      const [fieldProblem] = qualityCheckFieldProblems(input, workLines);
      if (fieldProblem) throw new BadRequestError(fieldProblem.message).withCode("FIELD_VALIDATION", { field: fieldProblem.field });
      const pass = input.outcome === "PASS";
      if (pass) {
        const reasons = passProblems(input, workLines);
        if (reasons.length) throw new ConflictError(reasons.join(" ")).withCode("QC_BLOCKED", { reasons });
        try {
          assertSignaturePng(input.signatureImage ?? "");
        } catch (error) {
          if (error instanceof BadRequestError) throw error.withCode("FIELD_VALIDATION", { field: "signatureImage" });
          throw error;
        }
      }

      const now = new Date();
      const checks = inspectionChecks(input, workLines);
      const notes = input.notes?.trim() || null;
      await supersedeCurrentInspection(tx, jobId, now);
      const inspection = await tx.inspection.create({
        data: {
          jobCardId: jobId,
          inspectorId: actor.id,
          result: pass ? "PASSED" : "FAILED",
          checks: checks as unknown as Prisma.InputJsonObject,
          notes,
          roadTestStartKm: input.roadTestStartKm,
          roadTestEndKm: input.roadTestEndKm,
          roadTestNotes: input.roadTestNotes?.trim() || null,
          acOutletTempC: input.acOutletTempC === null ? null : new Prisma.Decimal(input.acOutletTempC.toFixed(1)),
          certifiedById: pass ? actor.id : null,
          certifiedAt: pass ? now : null,
          requestId: input.requestId,
          createdAt: now,
        },
      });
      if (pass && input.signatureImage) {
        const contentHash = inspectionContentHash(
          { ...inspection, checks, acOutletTempC: inspection.acOutletTempC?.toFixed(1) ?? null },
          actor.id,
          now,
          input.signatureImage,
        );
        await tx.inspectionSignature.create({
          data: { inspectionId: inspection.id, signerId: actor.id, signedAt: now, contentHash, signatureImage: input.signatureImage },
        });
      }
      const failedLineIds = checks.lines.filter((line) => line.result === "FAIL").map((line) => line.workLineId);
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: pass ? "JOB_QC_PASSED" : "JOB_QC_FAILED",
          details: JSON.stringify({
            jobCardId: jobId,
            branchId: job.branchId,
            inspectionId: inspection.id,
            failedLineIds,
            roadTestStartKm: input.roadTestStartKm,
            roadTestEndKm: input.roadTestEndKm,
            certified: pass,
          }),
        },
      });

      await this.stages.actInTx(tx, jobId, { action: pass ? "QC_PASSED_TO_ADVISOR" : "RETURN_TO_REPAIR", requestId: input.requestId, note: notes ?? undefined }, actor);

      // The failed work goes back on the technician's list; labour already recorded is not charged again.
      if (failedLineIds.length)
        await tx.jobWorkLine.updateMany({
          where: { jobCardId: jobId, id: { in: failedLineIds } },
          data: { status: "NOT_STARTED", doneAt: null, resumedAt: null, reopenedAt: now, lastRequestId: input.requestId },
        });

      const moved = await tx.jobCard.findUniqueOrThrow({ where: { id: jobId }, select: jobSelect });
      await queueQcReviewNotification(
        tx,
        {
          id: moved.id,
          branchId: moved.branchId,
          jobNumber: moved.jobNumber,
          status: moved.status,
          technicianId: moved.technicianId,
          qualityInspectorId: moved.qualityInspectorId,
          serviceAdvisorId: moved.serviceAdvisorId,
          deliveryAdvisorId: moved.deliveryAdvisorId,
          createdById: moved.createdById,
          customerId: moved.customerId,
          promisedAt: moved.promisedAt?.toISOString() ?? null,
          stage: moved.stage,
        },
        pass ? "QC_PASSED" : "QC_FAILED",
        inspection.id,
        actor.id,
      );
    }, TX);
    await drainJobcardNotifications(jobId);
    return this.view(jobId, actor);
  }
}

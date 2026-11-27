import { JobCardType, Prisma, type FindingPayer } from "@prisma/client";
import type { z } from "zod";
import prisma from "../../prisma/client";
import { PERMISSIONS, ROLES } from "../../shared/constants/roles";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors/appError";
import { drainJobcardNotifications } from "../notification/jobcard-notification-router";
import { enqueueWorkshopNotification } from "../notification/workshop-notification-outbox";
import { resolveFindingItems } from "./job-diagnosis.service";
import {
  chargeTypeFor,
  lagosDayStart,
  moveWorkLine,
  myJobNextAction,
  partRows,
  partsReadiness,
  pauseLine,
  qualityCheckGate,
  secondsWorked,
  workLinePlans,
  type IssuedPart,
  type MyJobTab,
  type RequestedPart,
  type myJobsQuery,
  type repairFindingBody,
  type workLineActionBody,
} from "./job-repair.logic";
import { canWorkStage, type StageActor } from "./job-stage.logic";
import { LabourSlipService } from "./labour-slip.service";

type Tx = Prisma.TransactionClient;
type Database = Tx | typeof prisma;

export interface RepairActor extends StageActor {
  permissions: string[];
  branchId: string | null;
}

const has = (actor: RepairActor, permission: string) => actor.role === ROLES.SUPER_ADMIN || actor.permissions.includes(permission);
const fullName = (user: { firstName: string; lastName: string } | null | undefined) => (user ? `${user.firstName} ${user.lastName}`.trim() : null);
const TX = { maxWait: 5000, timeout: 20000 };
const ADVISOR_ROLES: readonly string[] = [ROLES.SERVICE_ADVISOR, ROLES.SERVICE_MANAGER, ROLES.ADMIN, ROLES.SUPER_ADMIN];
const lock = (tx: Tx, jobId: string) => tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${jobId} FOR UPDATE`);

const jobSelect = {
  id: true,
  jobNumber: true,
  branchId: true,
  jobType: true,
  stage: true,
  status: true,
  technicianId: true,
  serviceAdvisorId: true,
  qualityInspectorId: true,
  deliveryAdvisorId: true,
  createdById: true,
  customerId: true,
  qcStatus: true,
  qcNotes: true,
  promisedAt: true,
  warrantyDecisionReason: true,
  technician: { select: { firstName: true, lastName: true } },
  serviceAdvisor: { select: { firstName: true, lastName: true } },
} satisfies Prisma.JobCardSelect;
type RepairJob = Prisma.JobCardGetPayload<{ select: typeof jobSelect }>;

async function loadJob(db: Database, jobId: string) {
  const job = await db.jobCard.findUnique({ where: { id: jobId }, select: jobSelect });
  if (!job) throw new NotFoundError("Job card not found");
  return job;
}

/** The assigned technician, or a workshop supervisor standing in (the stage's own rule). */
function canWork(job: RepairJob, actor: RepairActor) {
  return job.stage === "REPAIR" && job.jobType !== JobCardType.PDI && has(actor, PERMISSIONS.JOBCARD_UPDATE) && canWorkStage("REPAIR", actor, job.technicianId);
}
const WORK_DENIED = "Only the technician assigned to this job, or the workshop supervisor, can update the work while the job is in repair.";

/** Findings raised during repair and where each one is: waiting for the estimate, for the customer, or answered. */
async function repairFindings(db: Database, jobId: string) {
  const rows = await db.jobFinding.findMany({
    where: { jobCardId: jobId, raisedDuringRepair: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      causeAndDefect: true,
      createdAt: true,
      createdBy: { select: { firstName: true, lastName: true } },
      items: { orderBy: { sortOrder: "asc" }, select: { id: true, kind: true, description: true, quantity: true } },
      estimate: { select: { id: true, version: true, presentedAt: true, approvals: { select: { id: true } }, lines: { select: { findingItemId: true, customerDecision: true } } } },
    },
  });
  return rows.map((row) => {
    const decided = !!row.estimate?.approvals.length;
    const decisions = row.estimate?.lines.filter((line) => line.findingItemId && row.items.some((item) => item.id === line.findingItemId)) ?? [];
    const state = !row.estimate
      ? ("WAITING_ESTIMATE" as const)
      : !decided
        ? ("WAITING_APPROVAL" as const)
        : decisions.length && decisions.every((line) => line.customerDecision === "DECLINED")
          ? ("DECLINED" as const)
          : ("APPROVED" as const);
    return {
      id: row.id,
      description: row.causeAndDefect,
      raisedBy: fullName(row.createdBy),
      raisedAt: row.createdAt,
      kind: row.items.every((item) => item.kind !== "LABOUR") ? ("PART" as const) : ("FINDING" as const),
      items: row.items.map((item) => ({ id: item.id, kind: item.kind, description: item.description, quantity: item.quantity.toFixed(2) })),
      state,
      estimateId: row.estimate?.id ?? null,
      estimateVersion: row.estimate?.version ?? null,
    };
  });
}

/** Facts for the stage rules while the job is in repair: what stops "Send for quality check". */
export async function loadRepairProblems(tx: Tx, jobId: string) {
  const [lines, waiting, latest] = await Promise.all([
    tx.jobWorkLine.findMany({ where: { jobCardId: jobId }, select: { status: true } }),
    tx.jobFinding.count({ where: { jobCardId: jobId, raisedDuringRepair: true, estimateId: null } }),
    tx.estimate.findFirst({
      where: { jobCardId: jobId },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: { supplementary: true, approvals: { select: { id: true } } },
    }),
  ]);
  return qualityCheckGate({
    lines: lines.map((line) => line.status),
    findingsWithoutEstimate: waiting,
    supplementaryPending: !!latest?.supplementary && !latest.approvals.length,
  });
}

/**
 * Creates the work lines for an approved revision: on release from the approved estimate, and when a
 * supplementary estimate is approved (only its newly approved lines). Safe to run again.
 */
export async function createWorkLines(tx: Tx, jobId: string, options: { supplementary: boolean }) {
  const job = await tx.jobCard.findUniqueOrThrow({ where: { id: jobId }, select: { technicianId: true, jobType: true } });
  if (job.jobType === JobCardType.PDI) return 0;
  const estimate = await tx.estimate.findFirst({
    where: { jobCardId: jobId, approvals: { some: { approved: true } } },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { lines: { include: { findingItem: { select: { campaignId: true } } } } },
  });
  if (!estimate) return 0;
  const existing = await tx.jobWorkLine.findMany({ where: { jobCardId: jobId }, select: { sourceKey: true } });
  const plans = workLinePlans(
    estimate.lines.map((line) => ({ ...line, campaignId: line.findingItem?.campaignId ?? null })),
    new Set(existing.map((line) => line.sourceKey)),
    options.supplementary,
  );
  if (!plans.length) return 0;
  await tx.jobWorkLine.createMany({
    data: plans.map((plan) => ({ ...plan, jobCardId: jobId, technicianId: job.technicianId })),
    skipDuplicates: true,
  });
  return plans.length;
}

/** Pausing the job for parts stops the clock on every line in progress. */
export async function pauseWorkLines(tx: Tx, jobId: string, now = new Date()) {
  const running = await tx.jobWorkLine.findMany({ where: { jobCardId: jobId, status: "IN_PROGRESS" } });
  for (const line of running) {
    const next = pauseLine(line, now);
    await tx.jobWorkLine.update({ where: { id: line.id }, data: { status: next.status, resumedAt: next.resumedAt, workedSeconds: next.workedSeconds } });
  }
}

/** Parts for the job: requested (automatic parts request), issued by the store, collected with a signature. */
async function loadParts(db: Database, jobId: string) {
  const [requests, issuances] = await Promise.all([
    db.jobPartsRequest.findMany({ where: { jobCardId: jobId, status: "SENT" }, select: { lines: true, sentAt: true } }),
    db.partIssuance.findMany({
      where: { jobCardId: jobId },
      orderBy: [{ issuedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        sparePartId: true,
        quantity: true,
        issuedAt: true,
        receivedAt: true,
        issuedBy: { select: { firstName: true, lastName: true } },
        receivedById: true,
        sparePart: { select: { name: true } },
        returns: { select: { quantity: true, status: true } },
        requisitionLine: { select: { requisition: { select: { status: true } } } },
      },
    }),
  ]);
  const collectorIds = [...new Set(issuances.flatMap((issue) => (issue.receivedById ? [issue.receivedById] : [])))];
  const collectors = new Map(
    (collectorIds.length ? await db.user.findMany({ where: { id: { in: collectorIds } }, select: { id: true, firstName: true, lastName: true } }) : []).map((user) => [user.id, fullName(user)]),
  );
  const requested: RequestedPart[] = requests.flatMap((request) =>
    (request.lines as { sparePartId: string; description: string; quantity: string }[]).map((line) => ({
      sparePartId: line.sparePartId,
      description: line.description,
      quantity: Number(line.quantity),
      requestedAt: request.sentAt,
    })),
  );
  const issued: IssuedPart[] = issuances.map((issue) => {
    const cancelled = issue.requisitionLine?.requisition.status === "CANCELLED";
    const returned = issue.returns.filter((row) => !["REJECTED", "CANCELLED"].includes(row.status.toUpperCase())).reduce((sum, row) => sum + row.quantity, 0);
    return {
      id: issue.id,
      sparePartId: issue.sparePartId,
      description: issue.sparePart.name,
      quantity: cancelled ? 0 : issue.quantity - returned,
      issuedAt: issue.issuedAt,
      issuedBy: fullName(issue.issuedBy),
      receivedAt: issue.receivedAt,
      receivedBy: issue.receivedById ? (collectors.get(issue.receivedById) ?? null) : null,
    };
  });
  const rows = partRows(requested, issued);
  return {
    rows,
    ...partsReadiness(rows),
    // What the technician can collect now: issued, not cancelled or returned, not yet signed for.
    collectable: issued
      .filter((issue) => issue.quantity > 0 && !issue.receivedAt)
      .map((issue) => ({ issuanceId: issue.id, description: issue.description, quantity: issue.quantity, issuedBy: issue.issuedBy })),
  };
}

export class JobRepairService {
  private readonly labourSlips = new LabourSlipService();

  /** The repair step for one job: work list, parts, labour, new findings and the supplementary estimate. No prices. */
  async view(jobId: string, actor: RepairActor, now = new Date()) {
    const job = await loadJob(prisma, jobId);
    const [lines, findings, parts, labour, latest, returned] = await Promise.all([
      prisma.jobWorkLine.findMany({
        where: { jobCardId: jobId },
        orderBy: [{ supplementary: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        include: { technician: { select: { firstName: true, lastName: true } } },
      }),
      repairFindings(prisma, jobId),
      loadParts(prisma, jobId),
      prisma.jobCardLabour.findMany({
        where: { jobCardId: jobId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          description: true,
          hours: true,
          createdAt: true,
          technician: { select: { firstName: true, lastName: true } },
          mechanic: { select: { name: true } },
        },
      }),
      prisma.estimate.findFirst({
        where: { jobCardId: jobId },
        orderBy: [{ version: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        select: { id: true, version: true, supplementary: true, presentedAt: true, approvals: { select: { id: true } } },
      }),
      prisma.jobStageEvent.findFirst({
        where: { jobCardId: jobId, toStage: "REPAIR" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { action: true, note: true, createdAt: true, actor: { select: { firstName: true, lastName: true } } },
      }),
    ]);
    const working = canWork(job, actor);
    const paused = job.status === "WAITING_PARTS";
    const supplementaryPending = !!latest?.supplementary && !latest.approvals.length;
    return {
      jobCardId: job.id,
      jobNumber: job.jobNumber,
      stage: job.stage,
      status: job.status,
      paused,
      serverNow: now,
      technician: fullName(job.technician),
      serviceAdvisor: fullName(job.serviceAdvisor),
      access: {
        canWork: working,
        // Collection is signed by the assigned technician only (the existing collection rule).
        canCollect: working && actor.role === ROLES.TECHNICIAN && job.technicianId === actor.id,
        canPrepareSupplementary:
          job.stage === "REPAIR" && ADVISOR_ROLES.includes(actor.role) && has(actor, PERMISSIONS.JOBCARD_UPDATE) && has(actor, PERMISSIONS.ESTIMATE_CREATE),
      },
      workLines: lines.map((line) => ({
        id: line.id,
        kind: line.kind,
        description: line.description,
        payer: line.payer,
        supplementary: line.supplementary,
        status: line.status,
        hours: line.quantity.toFixed(2),
        technician: fullName(line.technician),
        startedAt: line.startedAt,
        doneAt: line.doneAt,
        secondsWorked: secondsWorked(line, now),
      })),
      qualityCheckProblems: job.stage === "REPAIR" ? await prisma.$transaction((tx) => loadRepairProblems(tx, jobId)) : [],
      findings,
      parts,
      labour: labour.map((row) => ({
        id: row.id,
        description: row.description,
        hours: row.hours.toFixed(2),
        technician: row.mechanic?.name ?? fullName(row.technician),
        recordedAt: row.createdAt,
      })),
      supplementary: latest?.supplementary
        ? { estimateId: latest.id, version: latest.version, state: latest.approvals.length ? ("DECIDED" as const) : latest.presentedAt ? ("PRESENTED" as const) : ("DRAFT" as const) }
        : null,
      supplementaryPending,
      // A failed quality check sends the job back (phase 7): who, when and the note.
      returnedFromQc:
        returned?.action === "RETURN_TO_REPAIR"
          ? { by: fullName(returned.actor), at: returned.createdAt, note: returned.note ?? job.qcNotes ?? null }
          : null,
    };
  }

  /** Start, Done or Waiting parts on one work line. Done records the labour through the labour slip. */
  async moveLine(jobId: string, lineId: string, actor: RepairActor, input: z.infer<typeof workLineActionBody>) {
    await prisma.$transaction(async (tx) => {
      await lock(tx, jobId);
      const job = await loadJob(tx, jobId);
      if (!canWork(job, actor)) throw new ForbiddenError(WORK_DENIED);
      const line = await tx.jobWorkLine.findFirst({ where: { id: lineId, jobCardId: jobId } });
      if (!line) throw new NotFoundError("This work line is no longer on the job. Reload the job.");
      if (line.lastRequestId === input.requestId) return;
      const now = new Date();
      const move = moveWorkLine(line, input.action, now, job.status === "WAITING_PARTS");
      if (!move.ok) throw new ConflictError(move.reason).withCode("WORK_LINE_BLOCKED", { reasons: [move.reason] });
      if (!move.changed) return;
      let labourLineId = line.labourLineId;
      if (move.next.status === "DONE" && line.kind === "LABOUR" && line.labourItemId && !labourLineId)
        labourLineId = await this.recordLabour(tx, job, line, actor);
      await tx.jobWorkLine.update({
        where: { id: line.id },
        data: {
          status: move.next.status,
          startedAt: move.next.startedAt,
          resumedAt: move.next.resumedAt,
          workedSeconds: move.next.workedSeconds,
          doneAt: move.next.doneAt,
          labourLineId,
          technicianId: job.technicianId ?? line.technicianId,
          lastRequestId: input.requestId,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: `JOB_WORK_LINE_${input.action}`,
          details: JSON.stringify({ jobCardId: jobId, workLineId: line.id, description: line.description, from: line.status, to: move.next.status, secondsWorked: move.next.workedSeconds, labourLineId }),
        },
      });
    }, TX);
    return this.view(jobId, actor);
  }

  /**
   * The labour for a finished line, on the job's repair labour slip (created with the first line).
   * Charged hours are the approved hours, so the bill matches the approval; time worked stays on the
   * work line. TODO(confirm): charge the approved hours, not the time worked.
   */
  private async recordLabour(tx: Tx, job: RepairJob, line: { id: string; labourItemId: string | null; quantity: Prisma.Decimal; payer: FindingPayer; campaignId: string | null; technicianId: string | null }, actor: RepairActor) {
    // The technician on the job now (a reassignment during repair moves the remaining work).
    const technicianId = job.technicianId ?? line.technicianId;
    if (!technicianId) throw new ConflictError("Assign a technician to this job before you mark work done.");
    const labourActor = {
      userId: actor.id,
      branchId: job.branchId,
      allBranches: false,
      // Goodwill was decided at the warranty check by someone allowed to; the slip records that decision.
      goodwill: line.payer === "GOODWILL",
    };
    const slipLine = {
      labourItemId: line.labourItemId!,
      chargedHours: Number(line.quantity),
      chargeType: chargeTypeFor(line.payer),
      technicianId,
      ...(line.payer === "CAMPAIGN" && line.campaignId ? { campaignId: line.campaignId } : {}),
      ...(line.payer === "GOODWILL" ? { reason: job.warrantyDecisionReason || "Goodwill decided at the warranty check" } : {}),
    };
    const previous = await tx.jobWorkLine.findFirst({
      where: { jobCardId: job.id, labourLine: { labourSlipId: { not: null } } },
      select: { labourLine: { select: { labourSlipId: true } } },
    });
    try {
      const slip = previous?.labourLine?.labourSlipId
        ? await this.labourSlips.saveInTx(tx, previous.labourLine.labourSlipId, slipLine, labourActor)
        : await this.labourSlips.createInTx(tx, { branchId: job.branchId, jobCardId: job.id, lines: [slipLine] }, labourActor);
      const recorded = slip.lines.filter((row) => row.labourItemId === line.labourItemId).at(-1);
      if (!recorded) throw new ConflictError("The labour was not recorded. Try again.");
      return recorded.id;
    } catch (error) {
      // The labour slip's own rules (approved hours, payer) explain the problem in plain words.
      if (error instanceof BadRequestError) throw new ConflictError(`The work was not marked done. ${error.message}`).withCode("WORK_LINE_BLOCKED", { reasons: [error.message] });
      throw error;
    }
  }

  /** "Need a part" or "Add a finding": a new finding the customer must approve before the work is done. */
  async raiseFinding(jobId: string, actor: RepairActor, input: z.infer<typeof repairFindingBody>) {
    await prisma.$transaction(async (tx) => {
      await lock(tx, jobId);
      const replay = await tx.jobFinding.findUnique({ where: { requestId: input.requestId }, select: { jobCardId: true } });
      if (replay) {
        if (replay.jobCardId !== jobId) throw new ConflictError("This request was already used on another job. Reload the page.");
        return;
      }
      const job = await loadJob(tx, jobId);
      if (!canWork(job, actor)) throw new ForbiddenError(WORK_DENIED);
      const items = await resolveFindingItems(tx, input.items);
      const finding = await tx.jobFinding.create({
        data: {
          jobCardId: jobId,
          complaintId: null,
          causeAndDefect: input.description,
          raisedDuringRepair: true,
          requestId: input.requestId,
          createdById: actor.id,
          updatedById: actor.id,
          items: { createMany: { data: items } },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: "JOB_REPAIR_FINDING_RAISED",
          details: JSON.stringify({ jobCardId: jobId, findingId: finding.id, kind: input.kind, description: input.description, items: items.map((item) => ({ kind: item.kind, description: item.description, quantity: item.quantity.toFixed(2) })) }),
        },
      });
      const who = fullName(await tx.user.findUnique({ where: { id: actor.id }, select: { firstName: true, lastName: true } })) ?? "The technician";
      await enqueueWorkshopNotification(tx, "REPAIR_FINDING", job, finding.id, actor.id, false, { findingText: `${who}: ${input.description}` });
    }, TX);
    await drainJobcardNotifications(jobId);
    return this.view(jobId, actor);
  }

  /** The technician's home: jobs assigned to them in their branch, by tab, with counts. Never prices. */
  async myJobs(actor: RepairActor, query: z.infer<typeof myJobsQuery>, now = new Date()) {
    if (!actor.branchId) return { tab: query.tab, counts: { TODAY: 0, WAITING_PARTS: 0, DONE: 0 }, page: query.page, limit: query.limit, total: 0, jobs: [] };
    const base = { technicianId: actor.id, branchId: actor.branchId, jobType: { not: JobCardType.PDI } } satisfies Prisma.JobCardWhereInput;
    const where: Record<MyJobTab, Prisma.JobCardWhereInput> = {
      TODAY: {
        ...base,
        OR: [
          { stage: "DIAGNOSIS", OR: [{ diagnosis: { is: null } }, { diagnosis: { is: { submittedAt: null } } }] },
          { stage: "REPAIR", status: "IN_PROGRESS" },
        ],
      },
      WAITING_PARTS: { ...base, stage: "REPAIR", status: "WAITING_PARTS" },
      // Sent for the quality check today (Lagos time).
      DONE: { ...base, stageEvents: { some: { fromStage: "REPAIR", toStage: "QUALITY_CHECK", createdAt: { gte: lagosDayStart(now) } } } },
    };
    const [today, waiting, done] = await Promise.all([
      prisma.jobCard.count({ where: where.TODAY }),
      prisma.jobCard.count({ where: where.WAITING_PARTS }),
      prisma.jobCard.count({ where: where.DONE }),
    ]);
    const rows = await prisma.jobCard.findMany({
      where: where[query.tab],
      orderBy: [{ promisedAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        jobNumber: true,
        stage: true,
        status: true,
        promisedAt: true,
        qcNotes: true,
        bay: { select: { code: true, description: true } },
        vehicle: { select: { registrationNumber: true, model: true, year: true } },
        diagnosis: { select: { returnedAt: true, submittedAt: true } },
        _count: { select: { complaints: true } },
        workLines: { where: { status: { not: "DONE" } }, orderBy: [{ supplementary: "asc" }, { sortOrder: "asc" }], select: { description: true, status: true } },
        partIssuances: { where: { receivedAt: null, quantity: { gt: 0 } }, select: { id: true, requisitionLine: { select: { requisition: { select: { status: true } } } } } },
        stageEvents: { where: { toStage: { in: ["REPAIR", "QUALITY_CHECK"] } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { action: true, note: true, toStage: true, createdAt: true } },
      },
    });
    return {
      tab: query.tab,
      counts: { TODAY: today, WAITING_PARTS: waiting, DONE: done },
      page: query.page,
      limit: query.limit,
      total: { TODAY: today, WAITING_PARTS: waiting, DONE: done }[query.tab],
      jobs: rows.map((row) => {
        const last = row.stageEvents[0];
        const returnedFromQc = row.stage === "REPAIR" && last?.toStage === "REPAIR" && last.action === "RETURN_TO_REPAIR";
        const next = row.workLines.find((line) => line.status === "IN_PROGRESS") ?? row.workLines[0];
        const action = myJobNextAction({
          stage: row.stage,
          status: row.status,
          diagnosisReturned: !!row.diagnosis?.returnedAt && !row.diagnosis.submittedAt,
          returnedFromQc,
          readyToCollect: row.partIssuances.filter((issue) => issue.requisitionLine?.requisition.status !== "CANCELLED").length,
          nextWork: next?.description ?? null,
          linesLeft: row.workLines.length,
          findingRequests: row._count.complaints,
        });
        return {
          id: row.id,
          jobNumber: row.jobNumber,
          plate: row.vehicle?.registrationNumber ?? null,
          model: row.vehicle?.model ?? null,
          year: row.vehicle?.year ?? null,
          bay: row.bay ? row.bay.description || row.bay.code : null,
          stage: row.stage,
          status: row.status,
          promisedAt: row.promisedAt,
          returnedFromQc: returnedFromQc ? { note: last?.note ?? row.qcNotes ?? null, at: last?.createdAt ?? null } : null,
          sentForQcAt: query.tab === "DONE" && last?.toStage === "QUALITY_CHECK" ? last.createdAt : null,
          next: action,
        };
      }),
    };
  }
}

import { JobCardType, Prisma, WarrantyCoverageStatus } from "@prisma/client";
import prisma from "../../prisma/client";
import { drainJobcardNotifications } from "../notification/jobcard-notification-router";
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../shared/errors/appError";
import { assertAdvanceOrExempt } from "./job-deposit.service";
import { assertSignedJobOpening } from "./job-opening-signature.service";
import { assertApprovedOperation } from "./estimate-approval";
import { JobCardWorkflowService } from "./job-card-workflow.service";
import { loadCheckInGates } from "./job-check-in.service";
import { canWorkDiagnosis, diagnosisRoute, diagnosisSubStep } from "./job-diagnosis.logic";
import { applyDiagnosisAction, diagnosisEventNote, loadDiagnosisFacts } from "./job-diagnosis.service";
import { applyWarrantyHandoff, loadWarrantyFacts } from "./job-warranty.service";
import { loadEstimateStageFacts, vehicleDeclinedItems } from "./job-estimate.service";
import { createWorkLines, loadRepairProblems, pauseWorkLines } from "./job-repair.service";
import { moveStage } from "./job-stage.writer";
import {
  ACTION_RULES,
  availableActions,
  canWorkStage,
  checkStageAction,
  currentSubStep,
  normaliseJobStatus,
  stageAlerts,
  isWarrantyJob,
  stageSummaries,
  type StageAction,
  type StageActor,
  type StageFacts,
} from "./job-stage.logic";

const ACTIVE_INVOICE = (status: string) => !["CANCELLED", "CANCELED", "VOID"].includes(status.toUpperCase());

const workspaceJob = {
  id: true,
  jobNumber: true,
  branchId: true,
  jobType: true,
  customerId: true,
  vehicleId: true,
  createdAt: true,
  stage: true,
  status: true,
  qcStatus: true,
  technicianId: true,
  billedAt: true,
  creditApprovedById: true,
  promisedAt: true,
  openingSignatureRequired: true,
  warrantyStatusAtCreation: true,
  stageEnteredAt: true,
  stageOwnerRole: true,
  stageOwner: { select: { id: true, firstName: true, lastName: true } },
  warrantyCase: { select: { id: true } },
  campaigns: { select: { attended: true } },
  diagnosis: { select: { submittedAt: true, returnedAt: true } },
  invoices: { select: { status: true } },
  consolidatedInvoices: { select: { status: true } },
  _count: { select: { complaints: true } },
} satisfies Prisma.JobCardSelect;

type WorkspaceJob = Prisma.JobCardGetPayload<{ select: typeof workspaceJob }>;

const fullName = (user: { firstName: string; lastName: string } | null) =>
  user ? `${user.firstName} ${user.lastName}`.trim() : null;

/** Runs an existing gate check and returns its message instead of throwing, so screens can show the reason. */
async function gateProblem(check: () => Promise<unknown>): Promise<string | null> {
  try {
    await check();
    return null;
  } catch (error) {
    if (error instanceof AppError && error.statusCode < 500) return error.message;
    throw error;
  }
}

// Check-in has its own gates (loadCheckInGates); these stages use the existing work-start gates.
const GATED_STAGES = new Set(["ESTIMATE", "REPAIR", "QUALITY_CHECK", "BILLING"]);

async function stageFacts(tx: Prisma.TransactionClient, job: WorkspaceJob, now: Date = new Date()): Promise<StageFacts> {
  const gated = GATED_STAGES.has(job.stage);
  const checkInGates = job.stage === "CHECK_IN" ? await loadCheckInGates(tx, job.id, now) : null;
  const diagnosis = job.stage === "DIAGNOSIS" ? await loadDiagnosisFacts(tx, job.id) : null;
  const warrantyProblems = job.stage === "WARRANTY" && job.jobType !== JobCardType.PDI ? await loadWarrantyFacts(tx, job.id) : [];
  const estimate = job.stage === "ESTIMATE" && job.jobType !== JobCardType.PDI ? await loadEstimateStageFacts(tx, job.id) : null;
  const repairProblems = job.stage === "REPAIR" && job.jobType !== JobCardType.PDI ? await loadRepairProblems(tx, job.id) : [];
  const [openingSignatureProblem, approvalProblem, depositProblem] = gated
    ? await Promise.all([
        job.openingSignatureRequired ? gateProblem(() => assertSignedJobOpening(tx, job.id)) : null,
        gateProblem(() => assertApprovedOperation(tx, job.id, job.customerId, [])),
        gateProblem(() => assertAdvanceOrExempt(tx, job.id)),
      ])
    : [null, null, null];
  return {
    stage: job.stage,
    status: job.status,
    qcStatus: job.qcStatus,
    technicianId: job.technicianId,
    complaintCount: job._count.complaints,
    openingSignatureProblem,
    checkInGates,
    approvalProblem,
    depositProblem,
    warrantyRelevant:
      diagnosisRoute({
        coverageActive: job.warrantyStatusAtCreation === WarrantyCoverageStatus.ACTIVE,
        openCampaigns: job.campaigns.length,
        warrantyCase: !!job.warrantyCase,
        flaggedFindings: diagnosis?.flaggedFindings ?? 0,
      }) === "WARRANTY",
    diagnosisSubmitted: diagnosis?.submitted ?? false,
    findingProblems: diagnosis?.findingProblems ?? [],
    warrantyProblems,
    billed:
      !!job.billedAt ||
      normaliseJobStatus(job.status) === "BILLED" ||
      [...job.invoices, ...job.consolidatedInvoices].some((invoice) => ACTIVE_INVOICE(invoice.status)),
    creditApproved: !!job.creditApprovedById,
    unansweredCampaigns: job.campaigns.filter((campaign) => campaign.attended === null).length,
    estimate,
    repairProblems,
  };
}

export interface StageActionInput {
  action: StageAction;
  note?: string;
  requestId: string;
}

const NOTE_REQUIRED: Partial<Record<StageAction, string>> = {
  CANCEL: "Give the reason for cancelling the job.",
  RETURN_TO_TECHNICIAN: "Write a note for the technician saying what to check again.",
};

/** Inside Diagnosis, only the person on the current part (supervisor, technician, engineer) works it. */
function canWorkCurrentPart(job: Pick<WorkspaceJob, "stage" | "technicianId" | "diagnosis">, actor: StageActor) {
  if (job.stage !== "DIAGNOSIS") return true;
  return canWorkDiagnosis(diagnosisSubStep(job.technicianId, job.diagnosis), actor, job.technicianId);
}

export class JobStageService {
  private readonly workflow = new JobCardWorkflowService();

  /**
   * Everything the staged job card needs to show the current step to this person. Someone who
   * cannot update job cards (no jobcard:update) sees every step read-only, with no actions.
   */
  async workspace(id: string, actor: StageActor, options: { now?: Date; canUpdate?: boolean } = {}) {
    const now = options.now ?? new Date();
    const canUpdate = options.canUpdate ?? true;
    return prisma.$transaction(
      async (tx) => {
        const job = await tx.jobCard.findUnique({ where: { id }, select: workspaceJob });
        if (!job) throw new NotFoundError("Job card not found");
        const facts = await stageFacts(tx, job, now);
        const events = await tx.jobStageEvent.findMany({
          where: { jobCardId: id },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            fromStage: true,
            toStage: true,
            action: true,
            note: true,
            ownerRole: true,
            createdAt: true,
            actor: { select: { firstName: true, lastName: true } },
            owner: { select: { firstName: true, lastName: true } },
          },
        });
        const eventFacts = events.map((event) => ({ ...event, actorName: fullName(event.actor) }));
        const pdi = job.jobType === JobCardType.PDI;
        // PDI jobs keep their own screens; the staged actions do not apply to them.
        const actions = pdi || !canUpdate ? [] : availableActions(facts, actor);
        return {
          jobCardId: job.id,
          jobNumber: job.jobNumber,
          jobType: job.jobType,
          stage: job.stage,
          status: normaliseJobStatus(job.status) ?? job.status,
          subStep: currentSubStep(facts),
          owner: job.stageOwnerRole
            ? { id: job.stageOwner?.id ?? null, name: fullName(job.stageOwner), role: job.stageOwnerRole }
            : null,
          enteredAt: job.stageEnteredAt,
          readOnly: pdi || !canUpdate || !canWorkStage(job.stage, actor, job.technicianId) || !canWorkCurrentPart(job, actor),
          actions,
          alerts: stageAlerts({ ...facts, promisedAt: job.promisedAt }, now),
          summaries: stageSummaries(job.stage, eventFacts),
          cancellation: job.stage === "CANCELLED" ? await cancellation(tx, id, eventFacts) : null,
          warrantyJob: isWarrantyJob(job.warrantyStatusAtCreation, !!job.warrantyCase),
          // Newest first, for the Activity tab of the Job file.
          activity: [...eventFacts].reverse().map((event) => ({
            id: event.id,
            at: event.createdAt,
            fromStage: event.fromStage,
            toStage: event.toStage,
            action: event.action,
            by: event.actorName,
            ownerName: fullName(event.owner),
            ownerRole: event.ownerRole,
            note: event.note,
          })),
          previousVisits: await previousVisits(tx, job),
          // Recommended work the customer declined on earlier visits (Visit history tab, check-in).
          declinedItems: job.vehicleId ? await vehicleDeclinedItems(tx, job.vehicleId, job.id) : [],
        };
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }

  /**
   * Runs one stage action under the job lock. Status-changing actions go through the
   * existing workflow, so its gates, status history and notifications still apply.
   * Repeating a requestId returns the current workspace without acting twice.
   */
  async act(id: string, input: StageActionInput, actor: StageActor) {
    const rule = ACTION_RULES[input.action];
    const note = input.note?.trim() || undefined;
    if (rule.requiresNote && !note)
      throw new BadRequestError(NOTE_REQUIRED[input.action] ?? "Write a note before you continue.").withCode("FIELD_VALIDATION", { field: "note" });

    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${id} FOR UPDATE`);
        const replay = await tx.jobStageEvent.findUnique({
          where: { jobCardId_requestId: { jobCardId: id, requestId: input.requestId } },
          select: { action: true },
        });
        if (replay) {
          if (replay.action !== input.action)
            throw new ConflictError("This request was already used for a different action. Reload the job and try again.").withCode(
              "STAGE_REQUEST_REUSED",
            );
          return;
        }
        const job = await tx.jobCard.findUnique({ where: { id }, select: workspaceJob });
        if (!job) throw new NotFoundError("Job card not found");
        if (job.jobType === JobCardType.PDI)
          throw new ConflictError("PDI job cards are updated from the PDI menu.").withCode("STAGE_ACTION_BLOCKED", {
            reasons: ["PDI job cards are updated from the PDI menu."],
          });

        const check = checkStageAction(input.action, await stageFacts(tx, job), actor);
        if (!check.ok) {
          const error =
            check.kind === "forbidden" ? new ForbiddenError(check.reasons[0]) : new ConflictError(check.reasons.join(" "));
          throw error.withCode(check.kind === "forbidden" ? "STAGE_ACTION_FORBIDDEN" : "STAGE_ACTION_BLOCKED", {
            reasons: check.reasons,
          });
        }

        const ctx = { action: input.action, requestId: input.requestId, note: diagnosisEventNote(input.action, note) };
        if (!check.toStatus) {
          // Diagnosis records who sent, returned or confirmed before the owner moves.
          await applyDiagnosisAction(tx, id, input.action, actor, note);
          // The warranty check opens the warranty case for warranty items and records the decision.
          if (input.action === "WARRANTY_TO_ADVISOR") {
            const decided = await applyWarrantyHandoff(tx, id, actor);
            await moveStage(tx, id, check.to, actor.id, { ...ctx, note: note ? `${decided} ${note}` : decided });
            return;
          }
          await moveStage(tx, id, check.to, actor.id, ctx);
          // Check-in is finished: record who completed it and when.
          if (input.action === "SEND_TO_SUPERVISOR")
            await tx.jobCheckIn.upsert({
              where: { jobCardId: id },
              create: { jobCardId: id, completedAt: new Date(), completedById: actor.id },
              update: { completedAt: new Date(), completedById: actor.id },
            });
          return;
        }
        try {
          await this.workflow.updateInTx(tx, id, { status: check.toStatus, remarks: note }, actor.id, ctx);
          // Repair (phase 6): the approved work becomes the technician's list; a pause stops the clock.
          if (input.action === "RELEASE_TO_REPAIR") await createWorkLines(tx, id, { supplementary: false });
          if (input.action === "PAUSE_FOR_PARTS") await pauseWorkLines(tx, id);
        } catch (error) {
          // A workflow gate that our facts did not catch is still a blocked move, not a bad request.
          if (error instanceof BadRequestError)
            throw new ConflictError(error.message).withCode("STAGE_ACTION_BLOCKED", { reasons: [error.message] });
          throw error;
        }
      },
      { maxWait: 5000, timeout: 15000 },
    );

    await drainJobcardNotifications(id);
    return this.workspace(id, actor);
  }
}

/** Who cancelled the job, when and why. Falls back to the status history for jobs cancelled before the stage log. */
async function cancellation(
  tx: Prisma.TransactionClient,
  id: string,
  events: { toStage: string; note: string | null; createdAt: Date; actorName: string | null }[],
) {
  const event = [...events].reverse().find((row) => row.toStage === "CANCELLED");
  if (event) return { by: event.actorName, at: event.createdAt, reason: event.note };
  const history = await tx.jobCardStatusHistory.findFirst({
    where: { jobCardId: id, toStatus: { in: ["CANCELLED", "Cancelled"] } },
    orderBy: { createdAt: "desc" },
    select: { remarks: true, createdAt: true, actor: { select: { firstName: true, lastName: true } } },
  });
  return history ? { by: fullName(history.actor), at: history.createdAt, reason: history.remarks } : { by: null, at: null, reason: null };
}

/**
 * The vehicle's last two visits before this job, for the Visit history tab (the paper card's
 * "last two visits"). Any branch, as service history is shared; cancelled and PDI jobs are not visits.
 */
async function previousVisits(tx: Prisma.TransactionClient, job: Pick<WorkspaceJob, "id" | "vehicleId" | "createdAt">) {
  if (!job.vehicleId) return [];
  const visits = await tx.jobCard.findMany({
    where: {
      vehicleId: job.vehicleId,
      id: { not: job.id },
      createdAt: { lt: job.createdAt },
      jobType: JobCardType.SERVICE,
      stage: { not: "CANCELLED" },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 2,
    select: {
      id: true,
      jobNumber: true,
      createdAt: true,
      deliveredAt: true,
      mileage: true,
      stage: true,
      workDone: true,
      branch: { select: { name: true } },
      serviceType: { select: { description: true } },
      service: { select: { name: true } },
      complaints: { select: { description: true }, orderBy: { id: "asc" }, take: 5 },
    },
  });
  return visits.map((visit) => ({
    id: visit.id,
    jobNumber: visit.jobNumber,
    openedAt: visit.createdAt,
    deliveredAt: visit.deliveredAt,
    mileage: visit.mileage,
    stage: visit.stage,
    branchName: visit.branch.name,
    service: visit.serviceType?.description ?? visit.service?.name ?? null,
    requests: visit.complaints.map((complaint) => complaint.description),
    workDone: visit.workDone,
  }));
}

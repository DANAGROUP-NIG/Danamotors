import { FindingPayer, JobCardType, Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { ROLES } from "../../shared/constants/roles";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors/appError";
import { COVERAGE_REASON_TEXT, dayNumberToIso, lagosDayNumber } from "../warranty/warranty.logic";
import { coverageFor, loadVehicleForWarranty } from "../warranty/warranty.coverage";
import { WarrantyCaseService } from "../warranty/warrantyCase.service";
import {
  DEFAULT_SERVICE_RULE,
  INSUFFICIENT_FIX,
  evaluateServiceHistory,
  insufficientText,
  resolveServiceRule,
  verdictSentence,
  type CountedService,
  type ServiceHistory,
  type ServiceRule,
} from "../warranty/service-history.logic";
import { decodePhoto, PhotoProblem } from "./job-check-in.logic";
import {
  checkPayer,
  decisionProblems,
  decisionsBody,
  decisionSummary,
  outsideRecordBody,
  reasonNeeded,
  recordDateProblem,
  removeRecordBody,
  serviceRuleBody,
  type DecisionItem,
} from "./job-warranty.logic";
import { STAGE_ROLES, type StageActor } from "./job-stage.logic";

type Tx = Prisma.TransactionClient;
type Database = Tx | typeof prisma;

const person = { select: { id: true, firstName: true, lastName: true } } as const;
const fullName = (user: { firstName: string; lastName: string } | null | undefined) =>
  user ? `${user.firstName} ${user.lastName}`.trim() : null;
const audit = (tx: Tx, userId: string, action: string, details: Record<string, unknown>) =>
  tx.auditLog.create({ data: { userId, action, details: JSON.stringify(details) } });
const lockJob = (tx: Tx, id: string) => tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${id} FOR UPDATE`);
const fieldError = (field: string, message: string) => new BadRequestError(message).withCode("FIELD_VALIDATION", { field });
const ADMINS: readonly string[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN];
const lagosToday = () => dayNumberToIso(lagosDayNumber(new Date()));

/** What this person may do here, from their permissions (the routes work these out). */
export interface WarrantyAccess {
  /** jobcard:update, like every stage action. */
  canUpdate: boolean;
  /** warranty:update: decisions, goodwill (as for job card lines) and outside records. */
  canDecide: boolean;
}

// ── Service history ──────────────────────────────────────────────────────────

/** The warranty settings rule (one row, created by the migration; the defaults if missing). */
export async function loadSettingsRule(db: Database): Promise<ServiceRule> {
  const row = await db.warrantySettings.findUnique({ where: { id: "default" } });
  if (!row) return DEFAULT_SERVICE_RULE;
  return {
    intervalMonths: row.serviceIntervalMonths,
    intervalKm: row.serviceIntervalKm,
    servicesPerYear: row.servicesPerYear,
    graceKm: row.serviceGraceKm,
    graceDays: row.serviceGraceDays,
  };
}

/**
 * The vehicle's service history as of a job's opening: its delivered jobs whose service type is
 * periodic maintenance (any branch, not PDI), and outside service records not removed. The job
 * itself is not counted; its date and reading are "today" for the rule.
 */
export async function loadServiceHistory(
  db: Database,
  job: { id: string; vehicleId: string | null; createdAt: Date; mileage: number | null },
): Promise<ServiceHistory | null> {
  if (!job.vehicleId) return null;
  const [vehicle, settings, jobs, records] = await Promise.all([
    db.vehicle.findUnique({
      where: { id: job.vehicleId },
      select: {
        saleDate: true,
        vehicleModel: {
          select: { serviceIntervalMonths: true, serviceIntervalKm: true, servicesPerYear: true, serviceGraceKm: true, serviceGraceDays: true },
        },
      },
    }),
    loadSettingsRule(db),
    db.jobCard.findMany({
      where: {
        vehicleId: job.vehicleId,
        id: { not: job.id },
        jobType: JobCardType.SERVICE,
        serviceType: { isPeriodicMaintenance: true },
        OR: [{ stage: "CLOSED" }, { deliveredAt: { not: null } }],
      },
      select: { id: true, jobNumber: true, createdAt: true, mileage: true },
    }),
    db.externalServiceRecord.findMany({
      where: { vehicleId: job.vehicleId, removedAt: null },
      select: { id: true, serviceDate: true, mileage: true, dealerName: true },
    }),
  ]);
  if (!vehicle) return null;
  const services: CountedService[] = [
    ...jobs.map((row) => ({ id: row.id, date: row.createdAt, mileage: row.mileage, source: "JOB" as const, label: row.jobNumber })),
    // Stored as a calendar date; noon UTC keeps it on the same Lagos day.
    ...records.map((row) => ({
      id: row.id,
      date: new Date(`${row.serviceDate.toISOString().slice(0, 10)}T11:00:00Z`),
      mileage: row.mileage,
      source: "OUTSIDE" as const,
      label: row.dealerName,
    })),
  ];
  return evaluateServiceHistory({
    saleDate: vehicle.saleDate,
    asOf: job.createdAt,
    currentMileage: job.mileage,
    services,
    rule: resolveServiceRule(settings, vehicle.vehicleModel),
  });
}

/** The check-in note: the verdict and its sentence. Null without a vehicle. */
export async function serviceHistoryNote(
  db: Database,
  job: { id: string; vehicleId: string | null; createdAt: Date; mileage: number | null },
) {
  const history = await loadServiceHistory(db, job);
  if (!history) return null;
  return { verdict: history.verdict.kind, sentence: verdictSentence(history.verdict) };
}

// ── Items ────────────────────────────────────────────────────────────────────

const itemSelect = {
  id: true,
  kind: true,
  referenceId: true,
  description: true,
  quantity: true,
  payer: true,
  campaignId: true,
  decidedAt: true,
  decidedBy: person,
  finding: {
    select: { id: true, causeAndDefect: true, possibleWarranty: true, complaint: { select: { id: true, description: true } } },
  },
} satisfies Prisma.JobFindingItemSelect;

async function loadItems(db: Database, jobCardId: string) {
  const rows = await db.jobFindingItem.findMany({
    where: { finding: { jobCardId } },
    // Customer requests in the order they were entered, then findings the customer did not mention.
    orderBy: [{ finding: { complaintId: { sort: "asc", nulls: "last" } } }, { finding: { createdAt: "asc" } }, { sortOrder: "asc" }],
    select: itemSelect,
  });
  const partIds = rows.filter((row) => row.kind !== "LABOUR").map((row) => row.referenceId);
  const parts = partIds.length
    ? await db.sparePart.findMany({ where: { id: { in: partIds } }, select: { id: true, warrantyApplicable: true } })
    : [];
  const applicable = new Map(parts.map((part) => [part.id, part.warrantyApplicable]));
  return rows.map((row) => ({ ...row, partWarrantyApplicable: row.kind === "LABOUR" ? null : (applicable.get(row.referenceId) ?? false) }));
}
type ItemRow = Awaited<ReturnType<typeof loadItems>>[number];

const decisionItems = (rows: ItemRow[]): DecisionItem[] =>
  rows.map((row) => ({ id: row.id, label: row.description, kind: row.kind, payer: row.payer }));

const jobSelect = {
  id: true,
  jobNumber: true,
  jobType: true,
  stage: true,
  branchId: true,
  vehicleId: true,
  customerId: true,
  createdAt: true,
  mileage: true,
  description: true,
  warrantyStatusAtCreation: true,
  warrantyDecisionReason: true,
  warrantyCase: { select: { id: true, caseNumber: true, status: true } },
  campaigns: { select: { campaignId: true, campaignCode: true, campaignTitle: true, campaignType: true, attended: true } },
} satisfies Prisma.JobCardSelect;
type JobRow = Prisma.JobCardGetPayload<{ select: typeof jobSelect }>;

async function loadJob(db: Database, id: string): Promise<JobRow> {
  const job = await db.jobCard.findUnique({ where: { id }, select: jobSelect });
  if (!job) throw new NotFoundError("Job card not found");
  return job;
}

/** Why this person cannot decide on this job now, or null. */
function decideProblem(job: Pick<JobRow, "stage" | "jobType">, actor: StageActor, access: WarrantyAccess) {
  if (job.jobType === JobCardType.PDI) return { status: 409 as const, message: "PDI job cards are updated from the PDI menu." };
  if (!access.canUpdate || !access.canDecide || !STAGE_ROLES.WARRANTY.includes(actor.role))
    return { status: 403 as const, message: "Only the warranty officer can decide who pays." };
  if (job.stage !== "WARRANTY")
    return { status: 409 as const, message: "The warranty check is finished. Decisions can no longer be changed." };
  return null;
}

/** Facts for the stage rules: what stops the warranty officer returning the job. */
export async function loadWarrantyFacts(db: Database, id: string) {
  const job = await loadJob(db, id);
  const [items, history] = await Promise.all([loadItems(db, id), loadServiceHistory(db, job)]);
  return decisionProblems({
    items: decisionItems(items),
    verdict: history?.verdict ?? { kind: "INSUFFICIENT_DATA", missing: ["NO_SALE_DATE"] },
    reason: job.warrantyDecisionReason,
  });
}

/**
 * Runs with WARRANTY_TO_ADVISOR, under the job lock, after the gates passed: opens the warranty
 * case for the warranty items through the existing case service (idempotent, one per job) and
 * records the decision. Returns the note for the stage event ("3 items warranty, 6 items customer pay.").
 */
export async function applyWarrantyHandoff(tx: Tx, id: string, actor: StageActor): Promise<string> {
  const job = await loadJob(tx, id);
  const items = await loadItems(tx, id);
  const warrantyItems = items.filter((item) => item.payer === FindingPayer.WARRANTY);
  let caseNumber: string | null = job.warrantyCase?.caseNumber ?? null;
  if (warrantyItems.length && job.vehicleId) {
    const complaint = [...new Set(warrantyItems.map((item) => item.finding.causeAndDefect.trim()).filter(Boolean))].join(" ") || job.description;
    const opened = await new WarrantyCaseService().openForJobCard(tx, {
      jobCardId: id,
      vehicleId: job.vehicleId,
      customerId: job.customerId,
      branchId: job.branchId,
      complaint,
      mileage: job.mileage,
      coverageStatus: job.warrantyStatusAtCreation,
      actorId: actor.id,
      automatic: false,
    });
    caseNumber = opened.caseNumber;
  }
  const summary = decisionSummary(decisionItems(items));
  await audit(tx, actor.id, "JOB_WARRANTY_DECIDED", {
    jobCardId: id,
    branchId: job.branchId,
    summary,
    warrantyItems: warrantyItems.length,
    warrantyCase: caseNumber,
    reason: job.warrantyDecisionReason,
  });
  return caseNumber && warrantyItems.length ? `${summary} Warranty case ${caseNumber}.` : summary;
}

// ── Service ──────────────────────────────────────────────────────────────────

export class JobWarrantyService {
  /** Coverage, service history, outside records, campaigns and the items to decide, with what this person may do. */
  async get(id: string, actor: StageActor, access: WarrantyAccess) {
    const job = await loadJob(prisma, id);
    if (!job.vehicleId) throw new ConflictError("This job card has no vehicle, so there is nothing to check for warranty.");
    const [vehicle, items, history, records] = await Promise.all([
      loadVehicleForWarranty(prisma, job.vehicleId),
      loadItems(prisma, id),
      loadServiceHistory(prisma, job),
      prisma.externalServiceRecord.findMany({
        where: { vehicleId: job.vehicleId, removedAt: null },
        orderBy: [{ serviceDate: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          serviceDate: true,
          mileage: true,
          dealerName: true,
          note: true,
          photoId: true,
          jobCardId: true,
          createdAt: true,
          addedBy: person,
        },
      }),
    ]);
    const coverage = coverageFor(vehicle, job.mileage, job.createdAt);
    const problem = decideProblem(job, actor, access);
    const verdict = history?.verdict ?? { kind: "INSUFFICIENT_DATA" as const, missing: ["NO_SALE_DATE" as const] };
    const decision = decisionItems(items);
    const isAdmin = ADMINS.includes(actor.role);
    return {
      jobCardId: job.id,
      jobNumber: job.jobNumber,
      stage: job.stage,
      editable: !problem,
      readOnlyReason: problem?.message ?? null,
      canAddRecords: access.canDecide && job.jobType !== JobCardType.PDI,
      vehicle: {
        id: vehicle.id,
        vin: vehicle.vin,
        registrationNumber: vehicle.registrationNumber,
        model: vehicle.vehicleModel?.name ?? vehicle.model,
        saleDate: vehicle.saleDate,
      },
      coverage: {
        ...coverage,
        reasonText: coverage.reasons.map((reason) => COVERAGE_REASON_TEXT[reason]),
        atOpening: job.warrantyStatusAtCreation,
      },
      history: history && {
        ...history,
        sentence: verdictSentence(history.verdict),
        insufficient:
          history.verdict.kind === "INSUFFICIENT_DATA"
            ? history.verdict.missing.map((reason) => ({ reason, text: insufficientText(reason), fix: INSUFFICIENT_FIX[reason] }))
            : [],
      },
      outsideRecords: records.map((row) => ({
        id: row.id,
        serviceDate: row.serviceDate.toISOString().slice(0, 10),
        mileage: row.mileage,
        dealerName: row.dealerName,
        note: row.note,
        photo: row.photoId && row.jobCardId ? { id: row.photoId, jobCardId: row.jobCardId } : null,
        addedBy: fullName(row.addedBy),
        createdAt: row.createdAt,
        canRemove: access.canDecide && (isAdmin || row.addedBy.id === actor.id),
      })),
      campaigns: job.campaigns.map((row) => ({
        id: row.campaignId,
        code: row.campaignCode,
        title: row.campaignTitle,
        type: row.campaignType,
        attended: row.attended,
      })),
      items: items.map((row) => ({
        id: row.id,
        kind: row.kind,
        description: row.description,
        // Quantities are decimals (never money); sent as numbers with at most 2 places.
        quantity: Number(row.quantity),
        request: row.finding.complaint?.description ?? null,
        technicianNote: row.finding.causeAndDefect,
        possibleWarranty: row.finding.possibleWarranty,
        partWarrantyApplicable: row.partWarrantyApplicable,
        payer: row.payer,
        campaignId: row.campaignId,
        decidedBy: fullName(row.decidedBy),
        decidedAt: row.decidedAt,
      })),
      reason: job.warrantyDecisionReason,
      reasonNeeded: reasonNeeded(verdict, decision),
      problems: decisionProblems({ items: decision, verdict, reason: job.warrantyDecisionReason }),
      summary: decisionSummary(decision),
      warrantyCase: job.warrantyCase,
    };
  }

  /**
   * Saves decisions (who pays for each listed item) and, when sent, the reason. Each decision is
   * checked with the job card line rules; a refused one names the item. Audited with the changes.
   */
  async saveDecisions(id: string, input: unknown, actor: StageActor, access: WarrantyAccess) {
    const body = decisionsBody.parse(input);
    await prisma.$transaction(
      async (tx) => {
        await lockJob(tx, id);
        const job = await loadJob(tx, id);
        const problem = decideProblem(job, actor, access);
        if (problem) throw (problem.status === 403 ? new ForbiddenError(problem.message) : new ConflictError(problem.message)).withCode("WARRANTY_LOCKED");
        const items = new Map((await loadItems(tx, id)).map((row) => [row.id, row]));
        const linkedCampaignIds = job.campaigns.map((row) => row.campaignId);
        const changes: { itemId: string; from: FindingPayer | null; to: FindingPayer }[] = [];
        const now = new Date();
        for (const [index, decision] of body.items.entries()) {
          const row = items.get(decision.itemId);
          if (!row) throw fieldError(`items.${index}.itemId`, "This item is no longer on the job. Reload the page.");
          const check = checkPayer(decision.payer, decision.campaignId, {
            kind: row.kind,
            label: row.description,
            coverageAtCreation: job.warrantyStatusAtCreation,
            hasWarrantyCase: !!job.warrantyCase,
            partWarrantyApplicable: row.partWarrantyApplicable,
            linkedCampaignIds,
            canChargeGoodwill: access.canDecide,
          });
          if (!check.ok) throw fieldError(`items.${index}.payer`, check.problem);
          if (row.payer === decision.payer && row.campaignId === check.campaignId) continue;
          await tx.jobFindingItem.update({
            where: { id: row.id },
            data: { payer: decision.payer, campaignId: check.campaignId, decidedById: actor.id, decidedAt: now },
          });
          changes.push({ itemId: row.id, from: row.payer, to: decision.payer });
        }
        const reason = body.reason === undefined ? undefined : body.reason?.trim() || null;
        const reasonChanged = reason !== undefined && reason !== job.warrantyDecisionReason;
        if (reasonChanged) await tx.jobCard.update({ where: { id }, data: { warrantyDecisionReason: reason } });
        if (changes.length || reasonChanged)
          await audit(tx, actor.id, "JOB_WARRANTY_DECISIONS_SAVED", {
            jobCardId: id,
            branchId: job.branchId,
            changes,
            ...(reasonChanged && { reason }),
          });
      },
      { maxWait: 5000, timeout: 15000 },
    );
    return this.get(id, actor, access);
  }

  /**
   * Adds a service done at another authorised dealer, with the stamped service book photo (stored
   * like other job photos). Repeating the request ID returns the record already stored.
   */
  async addOutsideRecord(id: string, input: unknown, actor: StageActor, access: WarrantyAccess) {
    const body = outsideRecordBody.parse(input);
    if (!access.canDecide) throw new ForbiddenError("Only warranty staff can add outside service records.");
    let photo;
    try {
      photo = decodePhoto(body.image);
    } catch (error) {
      if (error instanceof PhotoProblem) throw fieldError("image", error.message);
      throw error;
    }
    await prisma.$transaction(
      async (tx) => {
        await lockJob(tx, id);
        const replay = await tx.externalServiceRecord.findUnique({ where: { requestId: body.requestId }, select: { jobCardId: true } });
        if (replay) {
          if (replay.jobCardId !== id) throw new ConflictError("This request was already used. Reload the page and try again.");
          return;
        }
        const job = await loadJob(tx, id);
        if (job.jobType === JobCardType.PDI) throw new ConflictError("PDI job cards are updated from the PDI menu.");
        if (!job.vehicleId) throw new ConflictError("This job card has no vehicle.");
        const vehicle = await tx.vehicle.findUniqueOrThrow({ where: { id: job.vehicleId }, select: { saleDate: true } });
        const sale = vehicle.saleDate ? dayNumberToIso(lagosDayNumber(vehicle.saleDate)) : null;
        const dateProblem = recordDateProblem(body.serviceDate, lagosToday(), sale);
        if (dateProblem) throw fieldError("serviceDate", dateProblem);
        const stored = await tx.jobPhoto.create({
          data: {
            jobCardId: id,
            category: "SERVICE_BOOK",
            contentType: photo.contentType,
            byteSize: photo.data.length,
            width: photo.width,
            height: photo.height,
            sha256: photo.sha256,
            data: photo.data,
            requestId: body.requestId,
            createdById: actor.id,
          },
          select: { id: true },
        });
        const record = await tx.externalServiceRecord.create({
          data: {
            vehicleId: job.vehicleId,
            jobCardId: id,
            serviceDate: new Date(`${body.serviceDate}T00:00:00Z`),
            mileage: body.mileage,
            dealerName: body.dealerName,
            note: body.note?.trim() || null,
            photoId: stored.id,
            addedById: actor.id,
            requestId: body.requestId,
          },
          select: { id: true },
        });
        await audit(tx, actor.id, "EXTERNAL_SERVICE_RECORD_ADDED", {
          jobCardId: id,
          branchId: job.branchId,
          vehicleId: job.vehicleId,
          recordId: record.id,
          serviceDate: body.serviceDate,
          mileage: body.mileage,
          dealerName: body.dealerName,
          photoId: stored.id,
          sha256: photo.sha256,
        });
      },
      { maxWait: 5000, timeout: 20000 },
    );
    return this.get(id, actor, access);
  }

  /** Removes an outside record (soft delete, with a reason). Only its creator or an admin. */
  async removeOutsideRecord(id: string, recordId: string, input: unknown, actor: StageActor, access: WarrantyAccess) {
    const body = removeRecordBody.parse(input);
    if (!access.canDecide) throw new ForbiddenError("Only warranty staff can remove outside service records.");
    await prisma.$transaction(
      async (tx) => {
        await lockJob(tx, id);
        const job = await loadJob(tx, id);
        const record = await tx.externalServiceRecord.findFirst({
          where: { id: recordId, vehicleId: job.vehicleId ?? undefined },
          select: { id: true, addedById: true, removedAt: true, serviceDate: true, dealerName: true },
        });
        if (!record) throw new NotFoundError("Outside service record not found. Reload the page.");
        if (record.removedAt) return;
        if (record.addedById !== actor.id && !ADMINS.includes(actor.role))
          throw new ForbiddenError("Only the person who added this record, or an admin, can remove it.");
        await tx.externalServiceRecord.update({
          where: { id: record.id },
          data: { removedAt: new Date(), removedById: actor.id, removedReason: body.reason },
        });
        await audit(tx, actor.id, "EXTERNAL_SERVICE_RECORD_REMOVED", {
          jobCardId: id,
          branchId: job.branchId,
          vehicleId: job.vehicleId,
          recordId: record.id,
          serviceDate: record.serviceDate.toISOString().slice(0, 10),
          dealerName: record.dealerName,
          reason: body.reason,
        });
      },
      { maxWait: 5000, timeout: 15000 },
    );
    return this.get(id, actor, access);
  }
}

// ── Settings ─────────────────────────────────────────────────────────────────

export async function getServiceRuleSettings() {
  const row = await prisma.warrantySettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
  return {
    serviceIntervalMonths: row.serviceIntervalMonths,
    serviceIntervalKm: row.serviceIntervalKm,
    servicesPerYear: row.servicesPerYear,
    serviceGraceKm: row.serviceGraceKm,
    serviceGraceDays: row.serviceGraceDays,
    updatedAt: row.updatedAt,
  };
}

export async function updateServiceRuleSettings(input: unknown, actorId: string) {
  const body = serviceRuleBody.parse(input);
  await prisma.$transaction(async (tx) => {
    const before = await tx.warrantySettings.findUnique({ where: { id: "default" } });
    await tx.warrantySettings.upsert({ where: { id: "default" }, create: { id: "default", ...body, updatedById: actorId }, update: { ...body, updatedById: actorId } });
    await audit(tx, actorId, "WARRANTY_SERVICE_RULE_UPDATED", {
      before: before && {
        serviceIntervalMonths: before.serviceIntervalMonths,
        serviceIntervalKm: before.serviceIntervalKm,
        servicesPerYear: before.servicesPerYear,
        serviceGraceKm: before.serviceGraceKm,
        serviceGraceDays: before.serviceGraceDays,
      },
      after: body,
    });
  });
  return getServiceRuleSettings();
}


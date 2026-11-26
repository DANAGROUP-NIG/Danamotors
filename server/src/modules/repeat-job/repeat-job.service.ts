import { Prisma, RepeatJobStatus } from '@prisma/client';
import prisma from '../../prisma/client';
import { ForbiddenError, NotFoundError } from '../../shared/errors/appError';
import { defaultBranchSettings, getBranchSettings } from '../company-settings/company-settings.service';
import { localDayRange } from '../reports/core/dates';
import { earlierServiceJobsWhere, findRepeatCandidate, windowOf } from './repeat-job.detect';
import { canReview, isNotRepeatReason, reviewOutcome, type ReasonOption } from './repeat-job.logic';
import type { RepeatListQuery, RepeatReviewBody } from './repeat-job.validation';

export interface RepeatActor {
  userId: string;
  role: string;
  branchId: string | null;
  allBranches: boolean;
  canReview: boolean;
}

const person = { select: { id: true, firstName: true, lastName: true } } as const;
const reasonSelect = { orderBy: { position: 'asc' }, select: { position: true, reason: { select: { id: true, code: true, description: true, attributes: true } } } } as const;

function assertBranch(actor: RepeatActor, branchId?: string | null) {
  if (!actor.allBranches && (!actor.branchId || (branchId && branchId !== actor.branchId)))
    throw new ForbiddenError('You can only access repeat jobs in your branch');
}

function branchScope(actor: RepeatActor, branchId?: string) {
  assertBranch(actor, branchId);
  return actor.allBranches ? branchId : actor.branchId!;
}

const fullName = (user: { firstName: string; lastName: string } | null | undefined) => (user ? `${user.firstName} ${user.lastName}`.trim() : null);

type ReasonRow = { position: number; reason: { id: string; code: string; description: string; attributes: Prisma.JsonValue } };
const reasonView = (rows: ReasonRow[]) =>
  rows.map((row) => ({ id: row.reason.id, code: row.reason.code, description: row.reason.description, isNotRepeat: isNotRepeatReason(row.reason) }));

/** Job fields the review screen compares side by side. */
const comparedJobSelect = {
  id: true,
  jobNumber: true,
  createdAt: true,
  mileage: true,
  status: true,
  description: true,
  workDone: true,
  findings: { select: { causeAndDefect: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
  billedAt: true,
  branch: { select: { id: true, name: true } },
  serviceType: { select: { code: true, description: true } },
  serviceAdvisor: person,
  engineer: person,
  technician: person,
  complaints: { select: { id: true, description: true, defectCode: true }, orderBy: { id: 'asc' } },
  labourLines: { select: { id: true, description: true, technicianId: true, labourItem: { select: { code: true, description: true } } } },
  vehicle: { select: { id: true, registrationNumber: true, vin: true, model: true, trim: true, catalogue: { select: { description: true, parent: { select: { description: true } } } } } },
} satisfies Prisma.JobCardSelect;

type ComparedJob = Prisma.JobCardGetPayload<{ select: typeof comparedJobSelect }>;

function jobView(job: ComparedJob) {
  return {
    id: job.id,
    jobNumber: job.jobNumber,
    date: job.createdAt,
    mileage: job.mileage,
    status: job.status,
    branch: job.branch.name,
    serviceType: job.serviceType ? `${job.serviceType.code} · ${job.serviceType.description}` : null,
    serviceAdvisor: fullName(job.serviceAdvisor),
    engineer: fullName(job.engineer),
    technician: fullName(job.technician),
    registration: job.vehicle?.registrationNumber ?? null,
    vin: job.vehicle?.vin ?? null,
    model: job.vehicle?.catalogue?.parent?.description ?? job.vehicle?.model ?? null,
    variant: job.vehicle?.catalogue?.description ?? job.vehicle?.trim ?? null,
    description: job.description,
    customerRequests: job.complaints.map((row) => ({ id: row.id, code: row.defectCode, description: row.description })),
    workDone: job.workDone,
    // The technician's findings (cause and nature of defect), replacing the old free-text observations.
    findings: job.findings.map((finding) => finding.causeAndDefect.trim()).filter(Boolean),
    labour: job.labourLines.map((line) => ({ id: line.id, code: line.labourItem.code, description: line.description || line.labourItem.description })),
    billedAt: job.billedAt,
  };
}

export class RepeatJobService {
  /** REPEAT_REASON master rows for the review form, in legend order. */
  async reasons() {
    const rows = await prisma.workshopMaster.findMany({
      where: { kind: 'REPEAT_REASON' },
      orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
      select: { id: true, code: true, description: true, attributes: true, active: true },
    });
    return rows.map((row) => ({ id: row.id, code: row.code, description: row.description, active: row.active, isNotRepeat: isNotRepeatReason(row) }));
  }

  async list(query: RepeatListQuery, actor: RepeatActor) {
    const branchId = branchScope(actor, query.branchId);
    const range = query.dateFrom || query.dateTo ? localDayRange(query.dateFrom ?? '2000-01-01', query.dateTo ?? '2999-12-31') : null;
    const base: Prisma.RepeatJobWhereInput = {
      branchId,
      jobCard: {
        status: { notIn: ['CANCELLED', 'Cancelled'] },
        ...(range ? { createdAt: { gte: range.start, lt: range.end } } : {}),
      },
      ...(query.source ? { source: query.source } : {}),
      ...(query.search
        ? {
            OR: [
              { jobCard: { jobNumber: { contains: query.search, mode: 'insensitive' } } },
              { previousJob: { jobNumber: { contains: query.search, mode: 'insensitive' } } },
              { jobCard: { vehicle: { registrationNumber: { contains: query.search, mode: 'insensitive' } } } },
              { jobCard: { vehicle: { vin: { contains: query.search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const where: Prisma.RepeatJobWhereInput = query.status === 'ALL' ? base : { ...base, status: query.status };
    const [rows, total, counts] = await Promise.all([
      prisma.repeatJob.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          status: true,
          source: true,
          daysDifference: true,
          kmDifference: true,
          windowDays: true,
          windowKm: true,
          createdAt: true,
          reviewedAt: true,
          remarks: true,
          jobCard: {
            select: {
              id: true,
              jobNumber: true,
              createdAt: true,
              mileage: true,
              status: true,
              branch: { select: { name: true } },
              serviceAdvisor: person,
              vehicle: { select: { registrationNumber: true, vin: true, model: true, catalogue: { select: { description: true } } } },
            },
          },
          previousJob: { select: { id: true, jobNumber: true, createdAt: true, mileage: true } },
          previousEngineer: person,
          previousServiceAdvisor: person,
          reviewedBy: person,
          reasons: reasonSelect,
        },
      }),
      prisma.repeatJob.count({ where }),
      prisma.repeatJob.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    ]);
    const statusCounts: Record<string, number> = { PENDING_REVIEW: 0, CONFIRMED: 0, NOT_REPEAT: 0 };
    for (const row of counts) statusCounts[row.status] = row._count._all;
    return {
      items: rows.map((row) => ({
        id: row.id,
        status: row.status,
        source: row.source,
        daysDifference: row.daysDifference,
        kmDifference: row.kmDifference,
        window: { days: row.windowDays, km: row.windowKm },
        flaggedAt: row.createdAt,
        reviewedAt: row.reviewedAt,
        reviewedBy: fullName(row.reviewedBy),
        remarks: row.remarks,
        job: {
          id: row.jobCard.id,
          jobNumber: row.jobCard.jobNumber,
          date: row.jobCard.createdAt,
          mileage: row.jobCard.mileage,
          status: row.jobCard.status,
          branch: row.jobCard.branch.name,
          serviceAdvisor: fullName(row.jobCard.serviceAdvisor),
          registration: row.jobCard.vehicle?.registrationNumber ?? null,
          vin: row.jobCard.vehicle?.vin ?? null,
          variant: row.jobCard.vehicle?.catalogue?.description ?? row.jobCard.vehicle?.model ?? null,
        },
        previousJob: { id: row.previousJob.id, jobNumber: row.previousJob.jobNumber, date: row.previousJob.createdAt, mileage: row.previousJob.mileage },
        previousEngineer: fullName(row.previousEngineer),
        previousServiceAdvisor: fullName(row.previousServiceAdvisor),
        reasons: reasonView(row.reasons),
      })),
      statusCounts: { ...statusCounts, ALL: statusCounts.PENDING_REVIEW + statusCounts.CONFIRMED + statusCounts.NOT_REPEAT },
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
    };
  }

  async detail(id: string, actor: RepeatActor) {
    const record = await prisma.repeatJob.findUnique({
      where: { id },
      include: {
        jobCard: { select: comparedJobSelect },
        previousJob: { select: comparedJobSelect },
        previousEngineer: person,
        previousServiceAdvisor: person,
        reviewedBy: person,
        reasons: reasonSelect,
      },
    });
    if (!record) throw new NotFoundError('Repeat job not found');
    assertBranch(actor, record.branchId);

    const [technicians, siblings] = await Promise.all([
      record.previousTechnicianIds.length
        ? prisma.user.findMany({ where: { id: { in: record.previousTechnicianIds } }, select: { id: true, firstName: true, lastName: true } })
        : Promise.resolve([]),
      // Older and newer pending records in the same branch, for "save and next" (legacy Prev / Next).
      Promise.all([
        prisma.repeatJob.findFirst({
          where: { branchId: record.branchId, status: RepeatJobStatus.PENDING_REVIEW, id: { not: record.id }, createdAt: { lte: record.createdAt } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { id: true },
        }),
        prisma.repeatJob.findFirst({
          where: { branchId: record.branchId, status: RepeatJobStatus.PENDING_REVIEW, id: { not: record.id }, createdAt: { gt: record.createdAt } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true },
        }),
      ]),
    ]);

    return {
      id: record.id,
      status: record.status,
      source: record.source,
      daysDifference: record.daysDifference,
      kmDifference: record.kmDifference,
      window: { days: record.windowDays, km: record.windowKm },
      openingNote: record.openingNote,
      remarks: record.remarks,
      reasons: reasonView(record.reasons),
      flaggedAt: record.createdAt,
      reviewedAt: record.reviewedAt,
      reviewedBy: record.reviewedBy ? { id: record.reviewedBy.id, name: fullName(record.reviewedBy) } : null,
      canReview: actor.canReview && canReview(record, actor),
      job: jobView(record.jobCard),
      previousJob: {
        ...jobView(record.previousJob),
        // Staff as recorded when the repeat was flagged: the people the repeat counts against.
        engineer: fullName(record.previousEngineer) ?? jobView(record.previousJob).engineer,
        serviceAdvisor: fullName(record.previousServiceAdvisor) ?? jobView(record.previousJob).serviceAdvisor,
        technicians: technicians.map((user) => fullName(user)),
      },
      olderPendingId: siblings[0]?.id ?? null,
      newerPendingId: siblings[1]?.id ?? null,
    };
  }

  /** The repeat summary shown on a job card (badge and print block), for anyone who can read the job. */
  async forJob(jobCardId: string, actor: RepeatActor) {
    const job = await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: { id: true, branchId: true } });
    if (!job) throw new NotFoundError('Job card not found');
    assertBranch(actor, job.branchId);
    const [record, settings] = await Promise.all([
      prisma.repeatJob.findUnique({
        where: { jobCardId },
        include: { previousJob: { select: { id: true, jobNumber: true, createdAt: true, mileage: true } }, previousEngineer: person, reviewedBy: person, reasons: reasonSelect },
      }),
      getBranchSettings(job.branchId),
    ]);
    return {
      printRepeatBlock: settings.printRepeatBlock,
      repeat: record && {
        id: record.id,
        status: record.status,
        source: record.source,
        daysDifference: record.daysDifference,
        kmDifference: record.kmDifference,
        window: { days: record.windowDays, km: record.windowKm },
        openingNote: record.openingNote,
        remarks: record.remarks,
        reasons: reasonView(record.reasons),
        reviewedAt: record.reviewedAt,
        reviewedBy: fullName(record.reviewedBy),
        previousEngineer: fullName(record.previousEngineer),
        previousJob: { id: record.previousJob.id, jobNumber: record.previousJob.jobNumber, date: record.previousJob.createdAt, mileage: record.previousJob.mileage },
      },
    };
  }

  /**
   * Opening-form check: the automatic candidate (last billed job within the branch window) and the
   * vehicle's earlier service jobs for flagging a repeat by hand.
   */
  async preview(vehicleId: string, query: { branchId?: string; mileage?: number }, actor: RepeatActor) {
    const branchId = query.branchId ?? actor.branchId ?? undefined;
    if (branchId) assertBranch(actor, branchId);
    const settings = branchId ? await getBranchSettings(branchId) : defaultBranchSettings();
    const window = windowOf(settings);
    const now = new Date();
    const [candidate, jobs] = await Promise.all([
      findRepeatCandidate(prisma, { vehicleId, mileage: query.mileage ?? null, at: now, window }),
      prisma.jobCard.findMany({
        where: earlierServiceJobsWhere(vehicleId, now),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
        select: { id: true, jobNumber: true, createdAt: true, mileage: true, status: true, billedAt: true, technician: { select: { firstName: true, lastName: true } } },
      }),
    ]);
    return {
      window,
      candidate: candidate && {
        byDays: candidate.match.byDays,
        byKm: candidate.match.byKm,
        daysDifference: candidate.difference.days,
        kmDifference: candidate.difference.km,
        previousJob: {
          id: candidate.previous.id,
          jobNumber: candidate.previous.jobNumber,
          date: candidate.previous.createdAt,
          mileage: candidate.previous.mileage,
          status: candidate.previous.status,
          serviceType: candidate.previous.serviceType ? `${candidate.previous.serviceType.code} · ${candidate.previous.serviceType.description}` : null,
          engineer: fullName(candidate.previous.engineer),
          serviceAdvisor: fullName(candidate.previous.serviceAdvisor),
          technician: fullName(candidate.previous.technician),
          description: candidate.previous.description,
          workDone: candidate.previous.workDone,
        },
      },
      jobs,
    };
  }

  async review(id: string, body: RepeatReviewBody, actor: RepeatActor) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "RepeatJob" WHERE id = ${id} FOR UPDATE`);
      const record = await tx.repeatJob.findUnique({ where: { id }, include: { reasons: { include: { reason: { select: { code: true } } }, orderBy: { position: 'asc' } } } });
      if (!record) throw new NotFoundError('Repeat job not found');
      assertBranch(actor, record.branchId);
      if (!canReview(record, actor)) throw new ForbiddenError('Only the reviewer or an Admin can change a reviewed repeat job');

      const masters = await tx.workshopMaster.findMany({
        where: { kind: 'REPEAT_REASON', id: { in: body.reasonIds } },
        select: { id: true, code: true, active: true, attributes: true },
      });
      const options: ReasonOption[] = masters.map((row) => ({ id: row.id, code: row.code, active: row.active, isNotRepeat: isNotRepeatReason(row) }));
      const outcome = reviewOutcome(body, options, record.reasons.map((row) => row.reasonId));
      const now = new Date();

      await tx.repeatJobReason.deleteMany({ where: { repeatJobId: id } });
      await tx.repeatJobReason.createMany({ data: body.reasonIds.map((reasonId, index) => ({ repeatJobId: id, reasonId, position: index + 1 })) });
      await tx.repeatJob.update({
        where: { id },
        data: { status: outcome.status, remarks: outcome.remarks, reviewedById: actor.userId, reviewedAt: now },
      });
      // isRepeat keeps meaning "counts as a repeat" for older readers (MIS, history card).
      await tx.jobCard.update({ where: { id: record.jobCardId }, data: { isRepeat: outcome.status !== RepeatJobStatus.NOT_REPEAT } });
      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'REPEAT_JOB_REVIEWED',
          details: JSON.stringify({
            repeatJobId: id,
            jobCardId: record.jobCardId,
            before: { status: record.status, reasons: record.reasons.map((row) => row.reason.code), remarks: record.remarks, reviewedById: record.reviewedById },
            after: { status: outcome.status, reasons: body.reasonIds.map((reasonId) => options.find((option) => option.id === reasonId)?.code), remarks: outcome.remarks },
          }),
        },
      });
      return { id, status: outcome.status, reviewedAt: now };
    });
  }
}

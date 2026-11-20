import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../shared/errors/appError';
import { canonicalJobStatus } from '../service/job-card-workflow.service';
import { localDayRange, REPORT_TZ } from '../reports/core/dates';
import { canonicalStatusSql, jobJoinsSql } from '../reports/core/sql';
import { cleanRemarks, entryProblem, lateness, reasonProblem, type LateKind } from './late-delivery.logic';
import { daysLateSql, deliveredWithPromiseSql, lateKindSql, minutesLateSql } from './late-delivery.sql';
import type { LateFindQuery, LateListQuery, LateSaveBody } from './late-delivery.validation';

export interface LateActor {
  userId: string;
  branchId: string | null;
  allBranches: boolean;
}

export const LATE_AUDIT_ACTION = 'LATE_DELIVERY_REASONS_UPDATED';

function assertBranch(actor: LateActor, branchId?: string | null) {
  if (!actor.allBranches && (!actor.branchId || (branchId && branchId !== actor.branchId)))
    throw new ForbiddenError('You can only open jobs of your own branch');
}

/** The branch to list: the user's own, or (branch:all) the one asked for or every branch. */
function branchScope(actor: LateActor, branchId?: string): string | undefined {
  assertBranch(actor, branchId);
  return actor.allBranches ? branchId : actor.branchId!;
}

const fullName = (user: { firstName: string; lastName: string } | null | undefined) => (user ? `${user.firstName} ${user.lastName}`.trim() || null : null);

/** Registration as typed, reduced to letters and digits (LSD 686-KC = LSD686KC). */
const plate = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
const plateSql = Prisma.sql`regexp_replace(UPPER(COALESCE(v."registrationNumber", '')), '[^A-Z0-9]', '', 'g')`;

interface ListRow {
  id: string;
  jobNumber: string;
  jobType: string;
  promisedAt: Date;
  deliveredAt: Date;
  registration: string | null;
  model: string | null;
  variant: string | null;
  serviceType: string | null;
  serviceAdvisor: string | null;
  branchName: string;
  daysLate: number;
  minutesLate: number;
  reasonCount: number;
  lateRemarks: string | null;
}

const detailSelect = {
  id: true,
  jobNumber: true,
  jobType: true,
  status: true,
  branchId: true,
  createdAt: true,
  promisedAt: true,
  deliveredAt: true,
  billedAt: true,
  gatePassNumber: true,
  lateReasonIds: true,
  lateRemarks: true,
  branch: { select: { id: true, name: true } },
  serviceType: { select: { code: true, description: true } },
  serviceAdvisor: { select: { firstName: true, lastName: true } },
  deliveryAdvisor: { select: { firstName: true, lastName: true } },
  customer: { select: { firstName: true, lastName: true, companyName: true } },
  vehicle: {
    select: {
      id: true,
      registrationNumber: true,
      vin: true,
      model: true,
      trim: true,
      catalogue: { select: { description: true, parent: { select: { description: true } } } },
    },
  },
} satisfies Prisma.JobCardSelect;

type DetailJob = Prisma.JobCardGetPayload<{ select: typeof detailSelect }>;

interface AuditDetails {
  jobCardId: string;
  kind: LateKind;
  before: { reasonIds: string[]; remarks: string | null };
  after: { reasonIds: string[]; remarks: string | null };
}

export class LateDeliveryService {
  /** LATE_REASON masters in legend order (codes 1-6 first), inactive ones flagged. */
  async reasons() {
    return prisma.workshopMaster.findMany({
      where: { kind: 'LATE_REASON' },
      orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
      select: { id: true, code: true, description: true, active: true },
    });
  }

  /** Jobs delivered late of one kind (worklist), filtered on the promised date, newest promise first. */
  async list(query: LateListQuery, actor: LateActor) {
    const branchId = branchScope(actor, query.branchId);
    const range = query.dateFrom || query.dateTo ? localDayRange(query.dateFrom ?? '2000-01-01', query.dateTo ?? '2999-12-31', REPORT_TZ) : null;
    const search = query.search ? `%${query.search}%` : null;
    const where = Prisma.sql`
      WHERE ${lateKindSql(REPORT_TZ)} = ${query.kind}
        ${deliveredWithPromiseSql}
        AND ${canonicalStatusSql(Prisma.raw('j."status"'))} <> 'CANCELLED'
        ${branchId ? Prisma.sql`AND j."branchId" = ${branchId}` : Prisma.empty}
        ${range ? Prisma.sql`AND j."promisedAt" >= ${range.start} AND j."promisedAt" < ${range.end}` : Prisma.empty}
        ${search ? Prisma.sql`AND (j."jobNumber" ILIKE ${search} OR v."registrationNumber" ILIKE ${search} OR ${plateSql} LIKE ${`%${plate(query.search!)}%`})` : Prisma.empty}`;
    const reasonFilter =
      query.reasons === 'missing' ? Prisma.sql`AND cardinality(j."lateReasonIds") = 0` : query.reasons === 'recorded' ? Prisma.sql`AND cardinality(j."lateReasonIds") > 0` : Prisma.empty;

    const [rows, [counts]] = await Promise.all([
      prisma.$queryRaw<ListRow[]>(Prisma.sql`
        SELECT j."id", j."jobNumber", j."jobType"::text AS "jobType", j."promisedAt", j."deliveredAt",
          v."registrationNumber" AS "registration",
          COALESCE(mdl."description", v."model", v."customModel") AS "model",
          COALESCE(var."description", v."trim") AS "variant",
          st."description" AS "serviceType",
          NULLIF(TRIM(CONCAT(sa."firstName", ' ', sa."lastName")), '') AS "serviceAdvisor",
          b."name" AS "branchName",
          ${daysLateSql(REPORT_TZ)} AS "daysLate",
          ${minutesLateSql} AS "minutesLate",
          cardinality(j."lateReasonIds") AS "reasonCount",
          j."lateRemarks"
        FROM "JobCard" j ${jobJoinsSql}
        ${where} ${reasonFilter}
        ORDER BY j."promisedAt" DESC, j."jobNumber" DESC
        LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`),
      prisma.$queryRaw<{ all: number; missing: number }[]>(Prisma.sql`
        SELECT COUNT(*)::int AS "all", (COUNT(*) FILTER (WHERE cardinality(j."lateReasonIds") = 0))::int AS "missing"
        FROM "JobCard" j ${jobJoinsSql}
        ${where}`),
    ]);
    const total = query.reasons === 'missing' ? counts.missing : query.reasons === 'recorded' ? counts.all - counts.missing : counts.all;
    return {
      items: rows,
      counts: { all: counts.all, missing: counts.missing, recorded: counts.all - counts.missing },
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
    };
  }

  /**
   * Finds one job by job number or registration (legacy Find). A registration opens the vehicle's most
   * recent job delivered late of this kind. A job that cannot be opened gives the reason why.
   */
  async find(query: LateFindQuery, actor: LateActor) {
    const branchId = branchScope(actor, query.branchId);
    const byNumber = await prisma.jobCard.findFirst({
      where: { jobNumber: { equals: query.q, mode: 'insensitive' } },
      select: { id: true, branchId: true, jobNumber: true, status: true, promisedAt: true, deliveredAt: true },
    });
    if (byNumber) {
      assertBranch(actor, byNumber.branchId);
      if (branchId && byNumber.branchId !== branchId) throw new ForbiddenError('This job belongs to another branch');
      const problem = entryProblem(byNumber, query.kind, canonicalJobStatus(byNumber.status));
      if (problem) throw new BadRequestError(problem).withCode('NOT_LATE');
      return { id: byNumber.id };
    }

    const wanted = plate(query.q);
    if (!wanted) throw new NotFoundError(`No job or vehicle matches "${query.q}"`);
    const [latest] = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT j."id" FROM "JobCard" j ${jobJoinsSql}
      WHERE ${plateSql} = ${wanted} AND ${lateKindSql(REPORT_TZ)} = ${query.kind}
        ${deliveredWithPromiseSql}
        AND ${canonicalStatusSql(Prisma.raw('j."status"'))} <> 'CANCELLED'
        ${branchId ? Prisma.sql`AND j."branchId" = ${branchId}` : Prisma.empty}
      ORDER BY j."deliveredAt" DESC LIMIT 1`);
    if (latest) return { id: latest.id };

    const [vehicle] = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT v."id" FROM "Vehicle" v WHERE ${plateSql} = ${wanted} LIMIT 1`);
    if (!vehicle) throw new NotFoundError(`No job or vehicle matches "${query.q}"`);
    throw new BadRequestError(`No job of ${query.q.toUpperCase()} ${branchId ? 'in this branch ' : ''}was delivered late ${query.kind === 'DATE' ? 'by date' : 'by time'}.`).withCode('NOT_LATE');
  }

  async detail(jobCardId: string, kind: LateKind, actor: LateActor) {
    const job = await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: detailSelect });
    if (!job) throw new NotFoundError('Job card not found');
    assertBranch(actor, job.branchId);
    const problem = entryProblem(job, kind, canonicalJobStatus(job.status));
    if (problem) throw new BadRequestError(problem).withCode('NOT_LATE');
    const history = await this.history(job.id);
    return view(job, history);
  }

  async save(jobCardId: string, body: LateSaveBody, actor: LateActor) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${jobCardId} FOR UPDATE`);
      const job = await tx.jobCard.findUnique({ where: { id: jobCardId }, select: detailSelect });
      if (!job) throw new NotFoundError('Job card not found');
      assertBranch(actor, job.branchId);
      const problem = entryProblem(job, body.kind, canonicalJobStatus(job.status));
      if (problem) throw new BadRequestError(problem).withCode('NOT_LATE');

      const options = await tx.workshopMaster.findMany({ where: { kind: 'LATE_REASON', id: { in: body.reasonIds } }, select: { id: true, active: true } });
      const invalid = reasonProblem(body.reasonIds, options, job.lateReasonIds);
      if (invalid) throw new BadRequestError(invalid);

      const remarks = cleanRemarks(body.remarks);
      const unchanged = remarks === job.lateRemarks && body.reasonIds.join() === job.lateReasonIds.join();
      if (unchanged) return { id: job.id, changed: false };

      await tx.jobCard.update({ where: { id: job.id }, data: { lateReasonIds: body.reasonIds, lateRemarks: remarks } });
      const details: AuditDetails = {
        jobCardId: job.id,
        kind: body.kind,
        before: { reasonIds: job.lateReasonIds, remarks: job.lateRemarks },
        after: { reasonIds: body.reasonIds, remarks },
      };
      await tx.auditLog.create({ data: { userId: actor.userId, action: LATE_AUDIT_ACTION, details: JSON.stringify({ jobNumber: job.jobNumber, ...details }) } });
      return { id: job.id, changed: true };
    });
  }

  /** Corrections made on the entry screens, newest first. */
  private async history(jobCardId: string) {
    const rows = await prisma.auditLog.findMany({
      where: { action: LATE_AUDIT_ACTION, details: { contains: `"jobCardId":"${jobCardId}"` } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, createdAt: true, details: true, user: { select: { firstName: true, lastName: true } } },
    });
    return rows.flatMap((row) => {
      try {
        const details = JSON.parse(row.details ?? '{}') as AuditDetails;
        return [{ id: row.id, at: row.createdAt, by: fullName(row.user), kind: details.kind, before: details.before, after: details.after }];
      } catch {
        return [];
      }
    });
  }
}

function view(job: DetailJob, history: Awaited<ReturnType<LateDeliveryService['history']>>) {
  // entryProblem() has checked both dates.
  const late = lateness(job.promisedAt!, job.deliveredAt!);
  const customer = job.customer ? job.customer.companyName?.trim() || fullName(job.customer) : null;
  return {
    id: job.id,
    jobNumber: job.jobNumber,
    jobType: job.jobType,
    jobDate: job.createdAt,
    branch: job.branch,
    registration: job.vehicle?.registrationNumber ?? null,
    vin: job.vehicle?.vin ?? null,
    model: job.vehicle?.catalogue?.parent?.description ?? job.vehicle?.model ?? null,
    variant: job.vehicle?.catalogue?.description ?? job.vehicle?.trim ?? null,
    customer,
    serviceType: job.serviceType?.description ?? null,
    serviceAdvisor: fullName(job.serviceAdvisor),
    deliveryAdvisor: fullName(job.deliveryAdvisor),
    gatePassNumber: job.gatePassNumber,
    promisedAt: job.promisedAt,
    deliveredAt: job.deliveredAt,
    billedAt: job.billedAt,
    lateness: late,
    reasonIds: job.lateReasonIds,
    remarks: job.lateRemarks,
    history,
  };
}

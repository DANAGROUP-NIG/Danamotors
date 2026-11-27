import { Prisma, type PsfStatus } from '@prisma/client';
import prisma from '../../prisma/client';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors/appError';
import { canonicalJobStatus } from '../service/job-card-workflow.service';
import { createBooking } from '../service/booking.persistence';
import { assertWithinBookingHorizon } from '../service/service.service';
import { localDayRange, REPORT_TZ } from '../reports/core/dates';
import { jobJoinsSql } from '../reports/core/sql';
import {
  callBlocked,
  cleanRemark,
  DEFAULT_REMARK,
  followLines,
  followUpProblem,
  isContacted,
  phoneList,
  remarkProblem,
  resolveLineStatuses,
  statusLabel,
  type FollowLine,
} from './psf.logic';
import { allPhonesSql, plate, plateSql, psfEligibleSql, psfJoinSql, stateSql } from './psf.sql';
import type { PsfCallBody, PsfFindQuery, PsfListQuery, PsfState } from './psf.validation';

export interface PsfActor {
  userId: string;
  branchId: string | null;
  allBranches: boolean;
}

export const PSF_AUDIT_ACTION = 'PSF_CALL_RECORDED';

const ACTIVE_BOOKING = { bookingStatus: 'BOOKED' as const, status: { notIn: ['Closed', 'Cancelled', 'Completed', 'No Show'] } };

function assertBranch(actor: PsfActor, branchId?: string | null) {
  if (!actor.allBranches && (!actor.branchId || (branchId && branchId !== actor.branchId)))
    throw new ForbiddenError('You can only open jobs of your own branch');
}

/** The branch to list: the user's own, or (branch:all) the one asked for or every branch. */
function branchScope(actor: PsfActor, branchId?: string): string | undefined {
  assertBranch(actor, branchId);
  return actor.allBranches ? branchId : actor.branchId!;
}

const fullName = (user: { firstName: string; lastName: string } | null | undefined) => (user ? `${user.firstName} ${user.lastName}`.trim() || null : null);

interface ListRow {
  id: string;
  jobNumber: string;
  deliveredAt: Date;
  registration: string | null;
  model: string | null;
  serviceType: string | null;
  customer: string | null;
  phones: string | null;
  branchName: string;
  status: PsfStatus | null;
  callCount: number;
  lastCalledAt: Date | null;
  lastCalledBy: string | null;
}

const detailSelect = {
  id: true,
  jobNumber: true,
  psfFollowUpDueAt: true,
  jobType: true,
  status: true,
  branchId: true,
  mileage: true,
  createdAt: true,
  deliveredAt: true,
  customerId: true,
  vehicleId: true,
  branch: { select: { id: true, name: true } },
  serviceType: { select: { id: true, code: true, description: true, category: true, preDelivery: true } },
  serviceAdvisor: { select: { firstName: true, lastName: true } },
  deliveryAdvisor: { select: { firstName: true, lastName: true } },
  customer: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      companyName: true,
      contactPerson: true,
      email: true,
      phoneNumber: true,
      mobile2: true,
      residencePhone: true,
      office1: true,
      office2: true,
      address: true,
      city: true,
      state: true,
      preferredFollowupDay: true,
      preferredFollowupTime: true,
      preferredContactMethod: true,
    },
  },
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
  labourLines: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, description: true, labourItem: { select: { code: true, description: true, followUpAnalysis: true, majorLabour: true } } },
  },
  psfFollowUp: {
    select: {
      id: true,
      status: true,
      remark: true,
      callCount: true,
      lastCallId: true,
      lastCalledAt: true,
      lastCalledBy: { select: { firstName: true, lastName: true } },
      closedAt: true,
      closedBy: { select: { firstName: true, lastName: true } },
      calls: {
        orderBy: { calledAt: 'desc' },
        select: {
          id: true,
          status: true,
          remark: true,
          calledAt: true,
          calledBy: { select: { firstName: true, lastName: true } },
          bookingAt: true,
          bookingServiceType: { select: { code: true, description: true } },
          appointment: { select: { id: true, bookingNumber: true, scheduledAt: true } },
          lines: { orderBy: { position: 'asc' }, select: { kind: true, jobCardLabourId: true, code: true, description: true, status: true } },
        },
      },
    },
  },
} satisfies Prisma.JobCardSelect;

type DetailJob = Prisma.JobCardGetPayload<{ select: typeof detailSelect }>;

const isPdiJob = (job: Pick<DetailJob, 'jobType' | 'serviceType'>) =>
  job.jobType === 'PDI' || Boolean(job.serviceType?.preDelivery) || (job.serviceType?.category ?? '').trim().toUpperCase() === 'PDI';

function jobLines(job: DetailJob): FollowLine[] {
  return followLines(
    job.serviceType ? { code: job.serviceType.code, description: job.serviceType.description } : null,
    job.labourLines.map((line) => ({
      id: line.id,
      code: line.labourItem.code,
      description: line.description || line.labourItem.description,
      followUpAnalysis: line.labourItem.followUpAnalysis,
      majorLabour: line.labourItem.majorLabour,
    })),
  );
}

function assertFollowable(job: DetailJob) {
  const problem = followUpProblem({ deliveredAt: job.deliveredAt, status: canonicalJobStatus(job.status), isPdi: isPdiJob(job) });
  if (problem) throw new BadRequestError(problem).withCode('NOT_FOLLOWABLE');
}

export class PsfService {
  /** Active service types for the booking made from a call, in display order. */
  async serviceTypes() {
    return prisma.workshopMaster.findMany({
      where: { kind: 'SERVICE_TYPE', active: true, preDelivery: false },
      orderBy: [{ displayOrder: { sort: 'asc', nulls: 'last' } }, { code: 'asc' }],
      select: { id: true, code: true, description: true },
    });
  }

  /** Delivered jobs to follow up (worklist), filtered on the delivery date, newest delivery first, with a count per tab. */
  async list(query: PsfListQuery, actor: PsfActor) {
    const branchId = branchScope(actor, query.branchId);
    const range = query.dateFrom || query.dateTo ? localDayRange(query.dateFrom ?? '2000-01-01', query.dateTo ?? '2999-12-31', REPORT_TZ) : null;
    const search = query.search ? `%${query.search}%` : null;
    const where = Prisma.sql`
      WHERE TRUE ${psfEligibleSql}
        ${branchId ? Prisma.sql`AND j."branchId" = ${branchId}` : Prisma.empty}
        ${range ? Prisma.sql`AND j."deliveredAt" >= ${range.start} AND j."deliveredAt" < ${range.end}` : Prisma.empty}
        ${search ? Prisma.sql`AND (j."jobNumber" ILIKE ${search} OR v."registrationNumber" ILIKE ${search} OR ${plateSql} LIKE ${`%${plate(query.search!)}%`} OR c."firstName" ILIKE ${search} OR c."lastName" ILIKE ${search} OR c."companyName" ILIKE ${search})` : Prisma.empty}`;

    const [rows, [counts]] = await Promise.all([
      prisma.$queryRaw<ListRow[]>(Prisma.sql`
        SELECT j."id", j."jobNumber", j."deliveredAt",
          v."registrationNumber" AS "registration",
          COALESCE(mdl."description", v."model", v."customModel") AS "model",
          st."description" AS "serviceType",
          CASE WHEN c."id" IS NULL THEN NULL ELSE COALESCE(NULLIF(c."companyName", ''), TRIM(CONCAT(c."firstName", ' ', c."lastName"))) END AS "customer",
          ${allPhonesSql} AS "phones",
          b."name" AS "branchName",
          f."status", COALESCE(f."callCount", 0) AS "callCount", f."lastCalledAt",
          NULLIF(TRIM(CONCAT(fu."firstName", ' ', fu."lastName")), '') AS "lastCalledBy"
        FROM "JobCard" j ${jobJoinsSql} ${psfJoinSql}
        ${where} ${stateSql(query.state)}
        ORDER BY j."deliveredAt" DESC, j."jobNumber" DESC
        LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`),
      prisma.$queryRaw<Record<PsfState, number>[]>(Prisma.sql`
        SELECT COUNT(*)::int AS "all",
          (COUNT(*) FILTER (WHERE f."id" IS NULL OR f."status" IN ('NO_PHONE', 'NOT_AVAILABLE')))::int AS "toCall",
          (COUNT(*) FILTER (WHERE f."status" = 'DISSATISFIED'))::int AS "dissatisfied",
          (COUNT(*) FILTER (WHERE f."status" = 'SATISFIED'))::int AS "satisfied",
          (COUNT(*) FILTER (WHERE f."status" = 'CLOSED'))::int AS "closed"
        FROM "JobCard" j ${jobJoinsSql} ${psfJoinSql}
        ${where}`),
    ]);
    const total = counts[query.state];
    return {
      items: rows.map((row) => ({ ...row, callCount: Number(row.callCount) })),
      counts,
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
    };
  }

  /**
   * Finds one job by job number or registration. A registration opens the vehicle's most recent delivered
   * job that can be followed up. A job that cannot be followed up gives the reason why.
   */
  async find(query: PsfFindQuery, actor: PsfActor) {
    const branchId = branchScope(actor, query.branchId);
    const byNumber = await prisma.jobCard.findFirst({ where: { jobNumber: { equals: query.q, mode: 'insensitive' } }, select: detailSelect });
    if (byNumber) {
      assertBranch(actor, byNumber.branchId);
      if (branchId && byNumber.branchId !== branchId) throw new ForbiddenError('This job belongs to another branch');
      assertFollowable(byNumber);
      return { id: byNumber.id };
    }

    const wanted = plate(query.q);
    if (!wanted) throw new NotFoundError(`No job or vehicle matches "${query.q}"`);
    const [latest] = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT j."id" FROM "JobCard" j ${jobJoinsSql}
      WHERE ${plateSql} = ${wanted} ${psfEligibleSql}
        ${branchId ? Prisma.sql`AND j."branchId" = ${branchId}` : Prisma.empty}
      ORDER BY j."deliveredAt" DESC LIMIT 1`);
    if (latest) return { id: latest.id };

    const [vehicle] = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT v."id" FROM "Vehicle" v WHERE ${plateSql} = ${wanted} LIMIT 1`);
    if (!vehicle) throw new NotFoundError(`No job or vehicle matches "${query.q}"`);
    throw new BadRequestError(`${query.q.toUpperCase()} has no delivered job ${branchId ? 'in this branch ' : ''}to follow up.`).withCode('NOT_FOLLOWABLE');
  }

  async detail(jobCardId: string, actor: PsfActor) {
    const job = await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: detailSelect });
    if (!job) throw new NotFoundError('Job card not found');
    assertBranch(actor, job.branchId);
    assertFollowable(job);
    const activeBooking =
      job.vehicleId && job.customerId
        ? await prisma.serviceAppointment.findFirst({
            where: { vehicleId: job.vehicleId, customerId: job.customerId, ...ACTIVE_BOOKING },
            orderBy: { scheduledAt: 'asc' },
            select: { id: true, bookingNumber: true, scheduledAt: true },
          })
        : null;
    return view(job, activeBooking);
  }

  /**
   * Records one call: a new PsfCall with a status per followed-up line, the job's follow-up moved to it,
   * and an optional booking (a new booking, or the vehicle's active one linked). One transaction, audited.
   */
  async recordCall(jobCardId: string, body: PsfCallBody, actor: PsfActor) {
    const remark = cleanRemark(body.remark) ?? DEFAULT_REMARK[body.status] ?? null;
    const remarkIssue = remarkProblem(body.status, remark);
    if (remarkIssue) throw new BadRequestError(remarkIssue);
    if (body.booking && !isContacted(body.status)) throw new BadRequestError('A booking needs the customer on the phone: choose satisfied or dissatisfied');

    // Checks that read other tables run before the transaction (as CSC does).
    const pre = await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: { branchId: true, customerId: true } });
    if (!pre) throw new NotFoundError('Job card not found');
    assertBranch(actor, pre.branchId);
    const scheduledAt = body.booking ? new Date(body.booking.scheduledAt) : null;
    if (scheduledAt) {
      if (!pre.customerId) throw new BadRequestError('The job has no customer to book for');
      if (scheduledAt.getTime() < Date.now() - 60_000) throw new BadRequestError('The booking date cannot be in the past');
      await assertWithinBookingHorizon(pre.branchId, scheduledAt);
      if (body.booking?.serviceTypeId && !(await prisma.workshopMaster.findFirst({ where: { id: body.booking.serviceTypeId, kind: 'SERVICE_TYPE', active: true }, select: { id: true } })))
        throw new BadRequestError('Choose an active service type for the booking');
    }

    return prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${jobCardId} FOR UPDATE`);
        const job = await tx.jobCard.findUnique({ where: { id: jobCardId }, select: detailSelect });
        if (!job) throw new NotFoundError('Job card not found');
        assertBranch(actor, job.branchId);
        assertFollowable(job);
        const blocked = callBlocked(job.psfFollowUp?.status);
        if (blocked) throw new ConflictError(blocked).withCode('PSF_CLOSED');

        const lines = jobLines(job);
        const resolved = resolveLineStatuses(body.status, lines, body.lines);
        if (!resolved.ok) throw new BadRequestError(resolved.problem);

        const now = new Date();
        let booking: { id: string; bookingNumber: string | null; linked: boolean } | null = null;
        if (scheduledAt && job.customerId && job.vehicleId) {
          const active = await tx.serviceAppointment.findFirst({ where: { vehicleId: job.vehicleId, customerId: job.customerId, ...ACTIVE_BOOKING }, select: { id: true, bookingNumber: true } });
          if (active) booking = { ...active, linked: true };
          else {
            const created = await createBooking(
              {
                customerId: job.customerId,
                vehicleId: job.vehicleId,
                branchId: job.branchId,
                createdById: actor.userId,
                scheduledAt,
                serviceTypeId: body.booking?.serviceTypeId ?? undefined,
                source: 'PSF',
                notes: body.booking?.notes ?? undefined,
                requests: [{ description: `Booked on the post-service follow-up of job ${job.jobNumber}` }],
              },
              tx,
            );
            booking = { id: created.id, bookingNumber: created.bookingNumber ?? null, linked: false };
          }
        }

        const closing = body.status === 'CLOSED';
        const followUp =
          job.psfFollowUp ??
          (await tx.psfFollowUp.create({
            data: { jobCardId: job.id, branchId: job.branchId, customerId: job.customerId, vehicleId: job.vehicleId, status: body.status, remark, lastCalledAt: now, lastCalledById: actor.userId },
            select: { id: true },
          }));
        const call = await tx.psfCall.create({
          data: {
            followUpId: followUp.id,
            status: body.status,
            remark,
            calledAt: now,
            calledById: actor.userId,
            bookingAt: scheduledAt,
            bookingServiceTypeId: scheduledAt ? (body.booking?.serviceTypeId ?? null) : null,
            appointmentId: booking?.id ?? null,
            lines: {
              create: lines.map((line, position) => ({
                kind: line.kind,
                jobCardLabourId: line.jobCardLabourId,
                code: line.code,
                description: line.description,
                status: resolved.statuses.get(line.key) ?? body.status,
                position,
              })),
            },
          },
          select: { id: true },
        });
        await tx.psfFollowUp.update({
          where: { id: followUp.id },
          data: {
            status: body.status,
            remark,
            lastCallId: call.id,
            lastCalledAt: now,
            lastCalledById: actor.userId,
            callCount: { increment: 1 },
            customerId: job.customerId,
            closedAt: closing ? now : null,
            closedById: closing ? actor.userId : null,
          },
        });

        await tx.auditLog.create({
          data: {
            userId: actor.userId,
            action: PSF_AUDIT_ACTION,
            details: JSON.stringify({
              jobCardId: job.id,
              jobNumber: job.jobNumber,
              branchId: job.branchId,
              callId: call.id,
              before: job.psfFollowUp?.status ?? null,
              after: body.status,
              lines: lines.length,
              booking: booking ? { id: booking.id, linked: booking.linked } : null,
            }),
          },
        });
        return { id: job.id, callId: call.id, status: body.status, statusLabel: statusLabel(body.status), booking };
      },
      { timeout: 15000 },
    );
  }
}

function view(job: DetailJob, activeBooking: { id: string; bookingNumber: string | null; scheduledAt: Date } | null) {
  const customer = job.customer;
  const followUp = job.psfFollowUp;
  const lastCall = followUp?.calls.find((call) => call.id === followUp.lastCallId) ?? followUp?.calls[0];
  const current = new Map((lastCall?.lines ?? []).map((line) => [line.kind === 'SERVICE' ? 'SERVICE' : (line.jobCardLabourId ?? ''), line.status]));
  return {
    id: job.id,
    jobNumber: job.jobNumber,
    jobDate: job.createdAt,
    branch: job.branch,
    deliveredAt: job.deliveredAt,
    /** Set at delivery (job card revamp phase 9); null for jobs delivered before it. */
    followUpDueAt: job.psfFollowUpDueAt,
    mileage: job.mileage,
    registration: job.vehicle?.registrationNumber ?? null,
    vin: job.vehicle?.vin ?? null,
    model: job.vehicle?.catalogue?.parent?.description ?? job.vehicle?.model ?? null,
    variant: job.vehicle?.catalogue?.description ?? job.vehicle?.trim ?? null,
    serviceType: job.serviceType ? { code: job.serviceType.code, description: job.serviceType.description } : null,
    serviceAdvisor: fullName(job.serviceAdvisor),
    deliveryAdvisor: fullName(job.deliveryAdvisor),
    customer: customer
      ? {
          id: customer.id,
          name: customer.companyName?.trim() || fullName(customer) || '—',
          contactPerson: customer.contactPerson,
          email: customer.email,
          phones: phoneList(customer),
          address: [customer.address, customer.city, customer.state].map((part) => part?.trim()).filter(Boolean).join(', ') || null,
          preferredFollowupDay: customer.preferredFollowupDay,
          preferredFollowupTime: customer.preferredFollowupTime,
          preferredContactMethod: customer.preferredContactMethod,
        }
      : null,
    lines: jobLines(job).map((line) => ({ ...line, status: current.get(line.key) ?? null })),
    followUp: followUp
      ? {
          status: followUp.status,
          remark: followUp.remark,
          callCount: followUp.callCount,
          lastCalledAt: followUp.lastCalledAt,
          lastCalledBy: fullName(followUp.lastCalledBy),
          closedAt: followUp.closedAt,
          closedBy: fullName(followUp.closedBy),
        }
      : null,
    calls: (followUp?.calls ?? []).map((call) => ({
      id: call.id,
      status: call.status,
      remark: call.remark,
      calledAt: call.calledAt,
      calledBy: fullName(call.calledBy),
      bookingAt: call.bookingAt,
      bookingServiceType: call.bookingServiceType,
      appointment: call.appointment,
      lines: call.lines.map((line) => ({ code: line.code, description: line.description, status: line.status })),
    })),
    blockedReason: callBlocked(followUp?.status),
    activeBooking,
  };
}

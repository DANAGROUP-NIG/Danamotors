import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PERMISSIONS } from '../../shared/constants/roles';
import { localDayRange } from './core/dates';
import { dateQuery, flag, rangeQuery } from './core/filters';
import { capRows, groupRows, MAX_REPORT_ROWS, sumFields } from './core/shape';
import { branchFilter, canonicalStatusSql, inFilter, moneySql } from './core/sql';
import type { FilterKey, ReportDefinition, ReportRow } from './core/types';

// ── 1. Service booking report ───────────────────────────────────────────────

const BOOKING_FILTERS: FilterKey[] = ['model', 'variant', 'serviceType'];
const serviceBookingQuery = dateQuery(BOOKING_FILTERS, {});

export const BOOKING_STATUS_ORDER = ['BOOKED', 'CONVERTED', 'NO_SHOW', 'CANCELLED'] as const;

type BookingRow = ReportRow & {
  id: string;
  serviceTypeId: string | null;
  serviceType: string;
  bookingStatus: (typeof BOOKING_STATUS_ORDER)[number];
  estimatedAmount: number | null;
};

export const serviceBookingReport: ReportDefinition<z.infer<typeof serviceBookingQuery>> = {
  slug: 'service-booking',
  title: 'Service booking report',
  width: 80,
  permission: PERMISSIONS.REPORT_SERVICE_BOOKING,
  summary:
    'Vehicles booked to come in on a date (booked-for date), with booking requests, the estimated amount and whether the vehicle arrived (job opened), was cancelled or did not show. Totals by service type.',
  period: 'date',
  query: serviceBookingQuery,
  filterKeys: BOOKING_FILTERS,
  example: {
    rows: [{ bookingNumber: 'BK2026001204', scheduledAt: '2026-10-06T07:30:00.000Z', registration: 'LND 452 KJ', customer: 'Chinedu Okafor', serviceType: '1st Free Service', mileage: 1020, requests: 'Oil change; AC noise', estimatedAmount: 0, bookingStatus: 'CONVERTED', jobNumber: '2026004812' }],
    groups: [{ key: 'uuid', label: 'Paid Service', count: 15, totals: { count: 15, arrived: 10, estimatedAmount: 1284000 } }],
    summary: { total: 24, BOOKED: 6, CONVERTED: 15, NO_SHOW: 2, CANCELLED: 1 },
  },
  async run(db, scope, q) {
    const { start, end } = localDayRange(q.date, q.date, scope.timeZone);
    const result = await db.$queryRaw<BookingRow[]>(Prisma.sql`
      SELECT a."id", a."bookingNumber", a."scheduledAt", a."createdAt" AS "bookedOn", a."bookingStatus"::text AS "bookingStatus",
        a."status" AS "appointmentStatus", a."mileage", b."name" AS "branchName",
        v."registrationNumber" AS "registration", v."vin",
        COALESCE(mdl."description", v."model", v."customModel") AS "model",
        COALESCE(var."description", v."trim") AS "variant",
        COALESCE(NULLIF(c."companyName", ''), TRIM(CONCAT(c."firstName", ' ', c."lastName"))) AS "customer",
        NULLIF(CONCAT_WS(', ', NULLIF(c."address", ''), NULLIF(c."city", ''), NULLIF(c."state", '')), '') AS "customerAddress",
        NULLIF(CONCAT_WS(' / ', NULLIF(c."phoneNumber", ''), NULLIF(c."mobile2", '')), '') AS "customerPhone",
        a."serviceTypeId", COALESCE(st."description", 'Not set') AS "serviceType",
        req."requests", req."estimatedAmount",
        job."id" AS "jobId", job."jobNumber"
      FROM "ServiceAppointment" a
      JOIN "Branch" b ON b."id" = a."branchId"
      JOIN "Vehicle" v ON v."id" = a."vehicleId"
      LEFT JOIN "WorkshopMaster" var ON var."id" = v."catalogueId"
      LEFT JOIN "WorkshopMaster" mdl ON mdl."id" = var."parentId"
      LEFT JOIN "Customer" c ON c."id" = a."customerId"
      LEFT JOIN "WorkshopMaster" st ON st."id" = a."serviceTypeId"
      LEFT JOIN LATERAL (
        SELECT string_agg(COALESCE(NULLIF(r."description", ''), cc."description"), '; ' ORDER BY r."createdAt", r."description") AS "requests",
               ${moneySql(Prisma.sql`SUM(r."estimatedParts" + r."estimatedLabour" + r."estimatedOil")`)} AS "estimatedAmount"
        FROM "AppointmentRequest" r LEFT JOIN "WorkshopMaster" cc ON cc."id" = r."complaintCodeId"
        WHERE r."appointmentId" = a."id") req ON true
      LEFT JOIN LATERAL (
        SELECT j."id", j."jobNumber" FROM "JobCard" j
        WHERE j."appointmentId" = a."id" AND ${canonicalStatusSql(Prisma.raw('j."status"'))} <> 'CANCELLED'
        ORDER BY j."createdAt" LIMIT 1) job ON true
      WHERE a."scheduledAt" >= ${start} AND a."scheduledAt" < ${end}
        ${branchFilter(Prisma.raw('a."branchId"'), scope)}
        ${inFilter(Prisma.raw('mdl."id"'), q.model)}
        ${inFilter(Prisma.raw('v."catalogueId"'), q.variant)}
        ${inFilter(Prisma.raw('a."serviceTypeId"'), q.serviceType)}
        AND UPPER(COALESCE(st."category", '')) <> 'PDI'
      ORDER BY a."scheduledAt", a."bookingNumber"
      LIMIT ${MAX_REPORT_ROWS + 1}`);
    const { rows: capped, truncated } = capRows(result);
    const rows = capped.map((row) => ({ ...row, arrived: row.bookingStatus === 'CONVERTED' ? 1 : 0, estimatedAmount: row.estimatedAmount ?? 0 }));
    const grouped = groupRows(rows, { key: (row) => row.serviceTypeId ?? 'none', label: (row) => row.serviceType }, ['arrived', 'estimatedAmount']);
    const summary: Record<string, number> = { total: rows.length, ...Object.fromEntries(BOOKING_STATUS_ORDER.map((status) => [status, 0])) };
    for (const row of rows) summary[row.bookingStatus] += 1;
    return {
      rows: grouped.rows,
      groups: grouped.groups.map((group) => ({ ...group, totals: { count: group.count, ...group.totals } })),
      totals: { count: rows.length, ...sumFields(rows, ['arrived', 'estimatedAmount']) },
      summary,
      truncated,
    };
  },
};

// ── 2. Job estimate register ────────────────────────────────────────────────

const ESTIMATE_FILTERS: FilterKey[] = ['model', 'variant'];
const estimateRegisterQuery = rangeQuery(ESTIMATE_FILTERS, {
  estimateStatus: z.enum(['all', 'active', 'pending', 'closed']).default('all'),
  jobStatus: z.enum(['both', 'opened', 'not_opened']).default('both'),
  withLines: flag,
});

const ESTIMATE_STATUS_SQL: Record<string, Prisma.Sql> = {
  active: Prisma.sql` AND e."estimateStatus" = 'ACTIVE'`,
  pending: Prisma.sql` AND e."estimateStatus" = 'PENDING_APPROVAL'`,
  closed: Prisma.sql` AND e."estimateStatus" = 'CLOSED'`,
};
const OPENED_SQL = Prisma.sql`(e."jobCardId" IS NOT NULL OR e."openedJobCardId" IS NOT NULL)`;

type EstimateRow = ReportRow & { id: string; partsAmount: number; labourAmount: number; serviceAmount: number; discountAmount: number; netAmount: number; approval: string; estimateStatus: string };
const ESTIMATE_SUMS = ['partsAmount', 'labourAmount', 'serviceAmount', 'discountAmount', 'netAmount'] as const;

export const jobEstimateRegisterReport: ReportDefinition<z.infer<typeof estimateRegisterQuery>> = {
  slug: 'job-estimate-register',
  title: 'Job estimate register',
  width: 132,
  permission: PERMISSIONS.REPORT_JOB_ESTIMATE_REGISTER,
  summary:
    'Estimates dated in the period: pre-job estimates and the latest estimate of each job card (earlier revisions are left out). Parts, labour, service, discount and net amount, the customer decision and the job opened. withLines=true adds the estimate lines.',
  period: 'range',
  query: estimateRegisterQuery,
  filterKeys: ESTIMATE_FILTERS,
  params: [
    { name: 'estimateStatus', description: 'all (default), active (approved, no job yet), pending (awaiting the customer) or closed (job opened, declined or cancelled).', schema: { type: 'string', enum: ['all', 'active', 'pending', 'closed'] } },
    { name: 'jobStatus', description: 'both (default), opened (a job card exists) or not_opened.', schema: { type: 'string', enum: ['both', 'opened', 'not_opened'] } },
    { name: 'withLines', description: 'true to include the parts, labour and service lines of each estimate.', schema: { type: 'boolean' } },
  ],
  example: {
    rows: [{ estimateNumber: '2026000412', estimateDate: '2026-10-03T09:00:00.000Z', registration: 'EKY 334 AA', customer: 'Ngozi Eze', partsAmount: 184200, labourAmount: 45000, discountAmount: 9210, netAmount: 219990, approval: 'Approved', estimateStatus: 'CLOSED', jobNumber: '2026004790' }],
    totals: { count: 31, partsAmount: 4810000, labourAmount: 1500000, serviceAmount: 260000, discountAmount: 149200, netAmount: 6420800 },
    summary: { count: 31, approved: 18, pending: 9, declined: 2, opened: 16 },
  },
  async run(db, scope, q) {
    const { start, end } = localDayRange(q.from, q.to, scope.timeZone);
    const jobSql = q.jobStatus === 'opened' ? Prisma.sql` AND ${OPENED_SQL}` : q.jobStatus === 'not_opened' ? Prisma.sql` AND NOT ${OPENED_SQL}` : Prisma.empty;
    const result = await db.$queryRaw<EstimateRow[]>(Prisma.sql`
      SELECT e."id", e."estimateNumber", e."estimateDate", e."description", e."status" AS "approval",
        e."estimateStatus"::text AS "estimateStatus", e."closedReason"::text AS "closedReason", b."name" AS "branchName",
        v."registrationNumber" AS "registration", v."vin",
        COALESCE(mdl."description", v."model", v."customModel") AS "model",
        COALESCE(var."description", v."trim") AS "variant",
        COALESCE(NULLIF(c."companyName", ''), TRIM(CONCAT(c."firstName", ' ', c."lastName"))) AS "customer",
        COALESCE(st."description", amt."serviceName") AS "serviceType",
        COALESCE(amt."partsAmount", 0) AS "partsAmount", COALESCE(amt."labourAmount", 0) AS "labourAmount", COALESCE(amt."serviceAmount", 0) AS "serviceAmount",
        ${moneySql(Prisma.sql`e."discountAmount"`)} AS "discountAmount",
        ${moneySql(Prisma.sql`e."amount" - e."discountAmount"`)} AS "netAmount",
        COALESCE(jc."id", oj."id") AS "jobId", COALESCE(jc."jobNumber", oj."jobNumber") AS "jobNumber"
      FROM "Estimate" e
      JOIN "Branch" b ON b."id" = e."branchId"
      LEFT JOIN "Vehicle" v ON v."id" = e."vehicleId"
      LEFT JOIN "WorkshopMaster" var ON var."id" = v."catalogueId"
      LEFT JOIN "WorkshopMaster" mdl ON mdl."id" = var."parentId"
      LEFT JOIN "Customer" c ON c."id" = e."customerId"
      LEFT JOIN "JobCard" jc ON jc."id" = e."jobCardId"
      LEFT JOIN "JobCard" oj ON oj."id" = e."openedJobCardId"
      LEFT JOIN "WorkshopMaster" st ON st."id" = COALESCE(jc."serviceTypeId", oj."serviceTypeId")
      LEFT JOIN LATERAL (
        SELECT ${moneySql(Prisma.sql`SUM(l."amount") FILTER (WHERE l."type" = 'PART')`)} AS "partsAmount",
               ${moneySql(Prisma.sql`SUM(l."amount") FILTER (WHERE l."type" = 'LABOUR')`)} AS "labourAmount",
               ${moneySql(Prisma.sql`SUM(l."amount") FILTER (WHERE l."type" = 'SERVICE')`)} AS "serviceAmount",
               MIN(l."description") FILTER (WHERE l."type" = 'SERVICE') AS "serviceName"
        FROM "EstimateLine" l WHERE l."estimateId" = e."id") amt ON true
      WHERE e."estimateDate" >= ${start} AND e."estimateDate" < ${end}
        AND e."closedReason" IS DISTINCT FROM 'SUPERSEDED'
        ${branchFilter(Prisma.raw('e."branchId"'), scope)}
        ${inFilter(Prisma.raw('mdl."id"'), q.model)}
        ${inFilter(Prisma.raw('v."catalogueId"'), q.variant)}
        ${ESTIMATE_STATUS_SQL[q.estimateStatus] ?? Prisma.empty}
        ${jobSql}
      ORDER BY e."estimateDate", e."estimateNumber"
      LIMIT ${MAX_REPORT_ROWS + 1}`);
    const { rows: capped, truncated } = capRows(result);

    let rows: (EstimateRow & { lines?: unknown[] })[] = capped;
    if (q.withLines && q.mode !== 'summary' && rows.length) {
      const lines = await db.estimateLine.findMany({
        where: { estimateId: { in: rows.map((row) => row.id) }, type: { in: ['PART', 'LABOUR', 'SERVICE', 'INCLUDED_PART', 'INCLUDED_LABOUR'] } },
        select: { estimateId: true, type: true, description: true, quantity: true, rate: true, amount: true },
        orderBy: [{ type: 'asc' }, { description: 'asc' }],
      });
      const byEstimate = new Map<string, unknown[]>();
      for (const { estimateId, ...line } of lines) byEstimate.set(estimateId, [...(byEstimate.get(estimateId) ?? []), line]);
      rows = rows.map((row) => ({ ...row, lines: byEstimate.get(row.id) ?? [] }));
    }

    const lower = (value: string) => value.toLowerCase();
    return {
      rows,
      groups: [],
      totals: { count: rows.length, ...sumFields(rows, ESTIMATE_SUMS) },
      summary: {
        count: rows.length,
        approved: rows.filter((row) => lower(row.approval) === 'approved').length,
        pending: rows.filter((row) => row.estimateStatus === 'PENDING_APPROVAL').length,
        declined: rows.filter((row) => lower(row.approval) === 'declined').length,
        opened: rows.filter((row) => row.jobNumber).length,
      },
      truncated,
    };
  },
};

export const FRONT_OFFICE_REPORTS = [serviceBookingReport, jobEstimateRegisterReport];

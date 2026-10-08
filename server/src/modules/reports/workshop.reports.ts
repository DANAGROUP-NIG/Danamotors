import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PERMISSIONS } from '../../shared/constants/roles';
import {
  canonicalStatus,
  daysOpen,
  JOB_STATUS_LABELS,
  JOB_STATUS_ORDER,
  promiseState,
  PROMISE_STATE_LABELS,
  PROMISE_STATE_ORDER,
  statusAsOn,
} from './core/calc';
import { addDays, localDayRange, startOfLocalDay } from './core/dates';
import { dateQuery, flag, rangeQuery } from './core/filters';
import { capRows, countBy, groupRows, MAX_REPORT_ROWS, sumFields } from './core/shape';
import { activeInvoiceSql, canonicalStatusSql, J, jobColumnsSql, jobFilterSql, jobFromSql, moneySql } from './core/sql';
import type { BreakdownItem, FilterKey, ReportDefinition, ReportRow } from './core/types';
import { getDueSoonHours, MAX_DUE_SOON_HOURS } from './settings';

const STD_FILTERS: FilterKey[] = ['model', 'variant', 'serviceType', 'team', 'receivedBy'];
const STD_WITH_DELIVERED: FilterKey[] = [...STD_FILTERS, 'deliveredBy'];
const LIMIT = Prisma.sql`LIMIT ${MAX_REPORT_ROWS + 1}`;

type Row = ReportRow & {
  jobId: string;
  jobDate: Date;
  serviceTypeId: string | null;
  serviceType: string;
  status: string;
  promisedAt: Date | null;
  readyAt: Date | null;
  billedAt: Date | null;
  deliveredAt: Date | null;
};

function serviceTypeBreakdown(rows: Row[]): BreakdownItem[] {
  const counts = new Map<string, BreakdownItem>();
  for (const row of rows) {
    const key = row.serviceTypeId ?? 'none';
    const item = counts.get(key) ?? { key, label: row.serviceType, count: 0 };
    item.count += 1;
    counts.set(key, item);
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

const lateReasonsSql = Prisma.sql`(
  SELECT string_agg(lr."description", ', ' ORDER BY lr."description")
  FROM "WorkshopMaster" lr WHERE lr."id" = ANY(j."lateReasonIds")) AS "lateReasons"`;

/** The job's current (latest, not cancelled) bill. */
const currentBillJoin = Prisma.sql`
  LEFT JOIN LATERAL (
    SELECT i."id", i."invoiceNumber", i."issuedDate", i."total", i."labourTotal", i."labourDiscountAmount", i."partsTotal", i."partsDiscountAmount"
    FROM "Invoice" i WHERE i."jobCardId" = j."id" AND ${activeInvoiceSql}
    ORDER BY i."issuedDate" DESC LIMIT 1) bill ON true`;

// ── 3. List of job cards open ───────────────────────────────────────────────

const jobCardsOpenQuery = rangeQuery(STD_FILTERS, {});

export const jobCardsOpenReport: ReportDefinition<z.infer<typeof jobCardsOpenQuery>> = {
  slug: 'job-cards-open',
  title: 'List of job cards open',
  width: 80,
  permission: PERMISSIONS.REPORT_JOB_CARDS_OPEN,
  summary: 'Job cards opened in a date range (job date), with the advisor, team, current status and promise time. Totals by service type.',
  period: 'range',
  query: jobCardsOpenQuery,
  filterKeys: STD_FILTERS,
  example: {
    rows: [{ jobNumber: '2026004812', jobDate: '2026-10-06T07:41:00.000Z', registration: 'LND 452 KJ', customer: 'Chinedu Okafor', model: 'Sportage', serviceType: '1st Free Service', status: 'IN_PROGRESS', promisedAt: '2026-10-06T15:00:00.000Z' }],
    totals: { count: 42 },
    breakdown: [{ key: 'uuid', label: 'Paid Service', count: 17 }],
  },
  async run(db, scope, q) {
    const { start, end } = localDayRange(q.from, q.to, scope.timeZone);
    const result = await db.$queryRaw<Row[]>(Prisma.sql`
      SELECT ${jobColumnsSql}
      ${jobFromSql}
      WHERE ${J.createdAt} >= ${start} AND ${J.createdAt} < ${end}
      ${jobFilterSql(scope, q)}
      ORDER BY j."createdAt", j."jobNumber"
      ${LIMIT}`);
    const { rows, truncated } = capRows(result);
    return { rows, groups: [], totals: { count: rows.length }, breakdown: serviceTypeBreakdown(rows), truncated };
  },
};

// ── 4. Workshop status (as on a date) ───────────────────────────────────────

const workshopStatusQuery = dateQuery(STD_WITH_DELIVERED, { undeliveredOnly: flag });

type StatusRow = Row & {
  historyStatus: string | null;
  noHistory: boolean;
  updatedAt: Date;
  effectiveDeliveredAt: Date | null;
  cancelledAt: Date | null;
  billNumber: string | null;
  billDate: Date | null;
  billAmount: number | null;
};

export const workshopStatusReport: ReportDefinition<z.infer<typeof workshopStatusQuery>> = {
  slug: 'workshop-status',
  title: 'Workshop status report',
  width: 132,
  permission: PERMISSIONS.REPORT_WORKSHOP_STATUS,
  summary:
    'Jobs pending and delivered as on a date. Each job\'s status is worked out as it stood at the end of that day from status history, bills and delivery, not from today\'s status. Includes every job open at some point that day.',
  period: 'date',
  query: workshopStatusQuery,
  filterKeys: STD_WITH_DELIVERED,
  params: [{ name: 'undeliveredOnly', description: 'true to leave out vehicles delivered by the end of the day.', schema: { type: 'boolean', default: false } }],
  example: {
    rows: [{ jobNumber: '2026004655', statusAsOn: 'IN_PROGRESS', groupKey: 'IN_PROGRESS', daysOpen: 8, billNumber: null }],
    groups: [{ key: 'IN_PROGRESS', label: 'In progress', count: 14, totals: { count: 14, billAmount: 0 } }],
    totals: { count: 35, billAmount: 1108400 },
    summary: { OPEN: 8, IN_PROGRESS: 14, QC: 3, READY: 6, BILLED: 4, DELIVERED: 21 },
  },
  async run(db, scope, q) {
    const dayStart = startOfLocalDay(q.date, scope.timeZone);
    const asOf = startOfLocalDay(addDays(q.date, 1), scope.timeZone);
    const canonical = canonicalStatusSql(J.status);
    const result = await db.$queryRaw<StatusRow[]>(Prisma.sql`
      WITH base AS (
        SELECT ${jobColumnsSql},
          hs."toStatus" AS "historyStatus",
          NOT EXISTS (SELECT 1 FROM "JobCardStatusHistory" hx WHERE hx."jobCardId" = j."id") AS "noHistory",
          j."updatedAt" AS "updatedAt",
          COALESCE(j."deliveredAt", hd."at", CASE WHEN ${canonical} = 'DELIVERED' THEN j."updatedAt" END) AS "effectiveDeliveredAt",
          COALESCE(hc."at", CASE WHEN ${canonical} = 'CANCELLED' THEN j."updatedAt" END) AS "cancelledAt",
          bill."invoiceNumber" AS "billNumber", bill."issuedDate" AS "billDate", ${moneySql(Prisma.sql`bill."total"`)} AS "billAmount"
        ${jobFromSql}
        LEFT JOIN LATERAL (
          SELECT h."toStatus" FROM "JobCardStatusHistory" h
          WHERE h."jobCardId" = j."id" AND h."createdAt" < ${asOf}
          ORDER BY h."createdAt" DESC LIMIT 1) hs ON true
        LEFT JOIN LATERAL (
          SELECT MIN(h."createdAt") AS "at" FROM "JobCardStatusHistory" h
          WHERE h."jobCardId" = j."id" AND h."toStatus" IN ('DELIVERED', 'Closed')) hd ON true
        LEFT JOIN LATERAL (
          SELECT MIN(h."createdAt") AS "at" FROM "JobCardStatusHistory" h
          WHERE h."jobCardId" = j."id" AND h."toStatus" IN ('CANCELLED', 'Cancelled')) hc ON true
        LEFT JOIN LATERAL (
          -- The bill that was active at the end of the day (issued, not yet cancelled).
          SELECT i."invoiceNumber", i."issuedDate", i."total" FROM "Invoice" i
          WHERE i."jobCardId" = j."id" AND i."issuedDate" < ${asOf}
            AND (i."cancelledAt" >= ${asOf}
              OR (i."cancelledAt" IS NULL AND LOWER(i."status") NOT IN ('cancelled', 'canceled', 'void')))
          ORDER BY i."issuedDate" DESC LIMIT 1) bill ON true
        WHERE ${J.createdAt} < ${asOf}
        ${jobFilterSql(scope, q, { includeCancelled: true })}
      )
      SELECT * FROM base
      WHERE ("effectiveDeliveredAt" IS NULL OR "effectiveDeliveredAt" >= ${dayStart})
        AND ("cancelledAt" IS NULL OR "cancelledAt" >= ${asOf})
      ORDER BY "jobDate", "jobNumber"
      ${LIMIT}`);

    const all = result
      .map((row) => {
        const status = statusAsOn(
          {
            createdAt: row.jobDate,
            historyStatus: row.historyStatus,
            billedAsOf: row.billNumber !== null,
            deliveredAt: row.effectiveDeliveredAt,
            cancelledAt: row.cancelledAt,
            current: row.noHistory ? { status: row.status, since: row.updatedAt } : null,
          },
          asOf,
        );
        const delivered = row.effectiveDeliveredAt && row.effectiveDeliveredAt < asOf ? row.effectiveDeliveredAt : null;
        return {
          ...row,
          statusAsOn: status,
          readyAt: row.readyAt && row.readyAt < asOf ? row.readyAt : null,
          deliveredAt: delivered,
          deliveredBy: delivered ? row.deliveredBy : null,
          daysOpen: daysOpen(row.jobDate, delivered ?? asOf),
          historyStatus: undefined,
          noHistory: undefined,
          updatedAt: undefined,
          effectiveDeliveredAt: undefined,
          cancelledAt: undefined,
        };
      })
      .filter((row) => row.statusAsOn && row.statusAsOn !== 'CANCELLED');

    const summary = Object.fromEntries(JOB_STATUS_ORDER.map((status) => [status, 0])) as Record<string, number>;
    for (const row of all) summary[row.statusAsOn!] += 1;

    const shown = q.undeliveredOnly ? all.filter((row) => row.statusAsOn !== 'DELIVERED') : all;
    const { rows, truncated } = capRows(shown);
    const grouped = groupRows(rows, { key: (row) => row.statusAsOn!, label: (row) => JOB_STATUS_LABELS[row.statusAsOn!], order: JOB_STATUS_ORDER }, ['billAmount']);
    const groups = grouped.groups.map((group) => ({ ...group, totals: { count: group.count, ...group.totals } }));
    return {
      rows: grouped.rows,
      groups,
      totals: { count: rows.length, ...sumFields(rows, ['billAmount']) },
      summary,
      breakdown: serviceTypeBreakdown(rows),
      truncated: truncated || result.length > MAX_REPORT_ROWS,
    };
  },
};

// ── 5. Workshop progress (promise date and time) ────────────────────────────

const basis = (fallback: 'job' | 'bill') => z.enum(['job', 'bill']).default(fallback);

const workshopProgressQuery = rangeQuery(STD_WITH_DELIVERED, {
  basis: basis('job'),
  // Omitted = the threshold in report settings.
  dueSoonHours: z.coerce.number().int().min(0).max(MAX_DUE_SOON_HOURS).optional(),
});

/** WHERE condition for "date on job date / bill date". Bill basis needs currentBillJoin. */
function basisSql(value: 'job' | 'bill', start: Date, end: Date) {
  return value === 'bill'
    ? Prisma.sql`bill."issuedDate" >= ${start} AND bill."issuedDate" < ${end}`
    : Prisma.sql`${J.createdAt} >= ${start} AND ${J.createdAt} < ${end}`;
}

export const workshopProgressReport: ReportDefinition<z.infer<typeof workshopProgressQuery>> = {
  slug: 'workshop-progress',
  title: 'Workshop progress report',
  width: 132,
  permission: PERMISSIONS.REPORT_WORKSHOP_PROGRESS,
  summary:
    'Jobs against their promise date and time: overdue, due within dueSoonHours, on time, and delivered late or on time. Jobs are picked by job date (basis=job, default) or bill date (basis=bill, as the legacy report did).',
  period: 'range',
  query: workshopProgressQuery,
  filterKeys: STD_WITH_DELIVERED,
  params: [
    { name: 'basis', description: 'job (job date, default) or bill (bill date).', schema: { type: 'string', enum: ['job', 'bill'], default: 'job' } },
    { name: 'dueSoonHours', description: 'Jobs due within this many hours are "due soon" (0–72). Omitted = the report settings value (default 2).', schema: { type: 'integer' } },
  ],
  example: {
    rows: [{ jobNumber: '2026004655', promiseState: 'OVERDUE', minutesToPromise: -200, lateReasons: 'Parts awaited', groupKey: 'OVERDUE' }],
    summary: { OVERDUE: 7, DUE_SOON: 5, ON_TIME: 19, NO_PROMISE: 0, DELIVERED_LATE: 3, DELIVERED_ON_TIME: 22 },
    totals: { count: 56 },
  },
  async run(db, scope, q) {
    const { start, end } = localDayRange(q.from, q.to, scope.timeZone);
    const result = await db.$queryRaw<(Row & { lateReasons: string | null })[]>(Prisma.sql`
      SELECT ${jobColumnsSql}, ${lateReasonsSql}
      ${jobFromSql}
      ${currentBillJoin}
      WHERE ${basisSql(q.basis, start, end)}
      ${jobFilterSql(scope, q)}
      ORDER BY j."promisedAt" NULLS LAST, j."jobNumber"
      ${LIMIT}`);
    const { rows: capped, truncated } = capRows(result);
    const now = new Date();
    const dueSoonHours = q.dueSoonHours ?? (await getDueSoonHours(db));
    const withState = capped.map((row) => {
      const state = promiseState({ promisedAt: row.promisedAt, readyAt: row.readyAt, deliveredAt: row.deliveredAt }, now, dueSoonHours);
      return { ...row, promiseState: state.state, minutesToPromise: state.minutes };
    });
    withState.sort((a, b) => (a.minutesToPromise ?? Infinity) - (b.minutesToPromise ?? Infinity));
    const grouped = groupRows(withState, { key: (row) => row.promiseState, label: (row) => PROMISE_STATE_LABELS[row.promiseState], order: PROMISE_STATE_ORDER }, []);
    const summary = Object.fromEntries(PROMISE_STATE_ORDER.map((state) => [state, 0])) as Record<string, number>;
    for (const row of withState) summary[row.promiseState] += 1;
    return {
      rows: grouped.rows,
      groups: grouped.groups.map((group) => ({ ...group, totals: { count: group.count } })),
      totals: { count: withState.length },
      summary: { ...summary, dueSoonHours },
      truncated,
    };
  },
};

// ── 6. Service-wise workshop progress ───────────────────────────────────────

const serviceWiseQuery = rangeQuery(STD_WITH_DELIVERED, { basis: basis('bill') });

const SERVICE_WISE_SUMS = ['ready', 'billed', 'delivered', 'onTime', 'late', 'labourBilled', 'partsBilled'] as const;

export const serviceWiseProgressReport: ReportDefinition<z.infer<typeof serviceWiseQuery>> = {
  slug: 'service-wise-progress',
  title: 'Service-wise workshop progress',
  width: 132,
  permission: PERMISSIONS.REPORT_SERVICE_WISE_PROGRESS,
  summary:
    'Workshop progress grouped by service type: jobs, ready, billed, delivered, delivered on time / late, and labour and parts billed (net of discount). Picked by bill date (basis=bill, default, as legacy) or job date.',
  period: 'range',
  query: serviceWiseQuery,
  filterKeys: STD_WITH_DELIVERED,
  params: [{ name: 'basis', description: 'bill (bill date, default) or job (job date).', schema: { type: 'string', enum: ['job', 'bill'], default: 'bill' } }],
  example: {
    groups: [{ key: 'uuid', label: 'Paid Service', count: 74, totals: { count: 74, ready: 71, billed: 72, delivered: 68, onTime: 61, late: 7, labourBilled: 2560000, partsBilled: 5947500 } }],
    totals: { count: 214, ready: 198, billed: 203, delivered: 198, onTime: 172, late: 26, labourBilled: 8420000, partsBilled: 21936500 },
  },
  async run(db, scope, q) {
    const { start, end } = localDayRange(q.from, q.to, scope.timeZone);
    const result = await db.$queryRaw<(Row & { billNumber: string | null; billDate: Date | null; labourBilled: number | null; partsBilled: number | null })[]>(Prisma.sql`
      SELECT ${jobColumnsSql},
        bill."invoiceNumber" AS "billNumber", bill."issuedDate" AS "billDate",
        ${moneySql(Prisma.sql`bill."labourTotal" - bill."labourDiscountAmount"`)} AS "labourBilled",
        ${moneySql(Prisma.sql`bill."partsTotal" - bill."partsDiscountAmount"`)} AS "partsBilled"
      ${jobFromSql}
      ${currentBillJoin}
      WHERE ${basisSql(q.basis, start, end)}
      ${jobFilterSql(scope, q)}
      ORDER BY st."description" NULLS LAST, j."createdAt"
      ${LIMIT}`);
    const { rows: capped, truncated } = capRows(result);
    const rows = capped.map((row) => {
      const status = canonicalStatus(row.status);
      const delivered = Boolean(row.deliveredAt) || status === 'DELIVERED';
      const late = delivered && row.promisedAt && row.deliveredAt ? row.deliveredAt > row.promisedAt : false;
      return {
        ...row,
        ready: row.readyAt || ['READY', 'BILLED', 'DELIVERED'].includes(status ?? '') ? 1 : 0,
        billed: row.billNumber ? 1 : 0,
        delivered: delivered ? 1 : 0,
        onTime: delivered && row.promisedAt && row.deliveredAt && !late ? 1 : 0,
        late: late ? 1 : 0,
        delivery: !delivered ? null : !row.promisedAt || !row.deliveredAt ? 'Delivered' : late ? 'Late' : 'On time',
        labourBilled: row.labourBilled ?? 0,
        partsBilled: row.partsBilled ?? 0,
      };
    });
    const grouped = groupRows(rows, { key: (row) => row.serviceTypeId ?? 'none', label: (row) => row.serviceType }, SERVICE_WISE_SUMS);
    return {
      rows: grouped.rows,
      groups: grouped.groups.map((group) => ({ ...group, totals: { count: group.count, ...group.totals } })),
      totals: { count: rows.length, ...sumFields(rows, SERVICE_WISE_SUMS) },
      truncated,
    };
  },
};

// ── 7. Vehicles to be ready ─────────────────────────────────────────────────

const toBeReadyQuery = dateQuery(STD_FILTERS, {});

export const vehiclesToBeReadyReport: ReportDefinition<z.infer<typeof toBeReadyQuery>> = {
  slug: 'vehicles-to-be-ready',
  title: 'Vehicles to be ready',
  width: 80,
  permission: PERMISSIONS.REPORT_VEHICLES_TO_BE_READY,
  summary: 'Vehicles promised for a date and not yet delivered, sorted by promised time, so the workshop can plan. "At risk" = past the promise time and not ready.',
  period: 'date',
  query: toBeReadyQuery,
  filterKeys: STD_FILTERS,
  example: {
    rows: [{ promisedAt: '2026-10-06T09:00:00.000Z', jobNumber: '2026004801', registration: 'KJA 118 GH', isReady: true, atRisk: false }],
    summary: { promised: 18, ready: 7, inWork: 9, atRisk: 2 },
    totals: { count: 18 },
  },
  async run(db, scope, q) {
    const { start, end } = localDayRange(q.date, q.date, scope.timeZone);
    const result = await db.$queryRaw<Row[]>(Prisma.sql`
      SELECT ${jobColumnsSql}
      ${jobFromSql}
      WHERE ${J.promisedAt} >= ${start} AND ${J.promisedAt} < ${end}
        AND j."deliveredAt" IS NULL AND ${canonicalStatusSql(J.status)} <> 'DELIVERED'
      ${jobFilterSql(scope, q)}
      ORDER BY j."promisedAt", j."jobNumber"
      ${LIMIT}`);
    const { rows: capped, truncated } = capRows(result);
    const now = new Date();
    const rows = capped.map((row) => {
      const isReady = Boolean(row.readyAt) || ['READY', 'BILLED'].includes(canonicalStatus(row.status) ?? '');
      return { ...row, isReady, atRisk: !isReady && row.promisedAt !== null && row.promisedAt < now };
    });
    const ready = rows.filter((row) => row.isReady).length;
    const atRisk = rows.filter((row) => row.atRisk).length;
    return {
      rows,
      groups: [],
      totals: { count: rows.length },
      summary: { promised: rows.length, ready, inWork: rows.length - ready, atRisk },
      breakdown: Object.entries(countBy(rows, (row) => canonicalStatus(row.status) ?? 'OPEN')).map(([key, count]) => ({ key, label: JOB_STATUS_LABELS[key] ?? key, count })),
      truncated,
    };
  },
};

export const WORKSHOP_REPORTS = [jobCardsOpenReport, workshopStatusReport, workshopProgressReport, serviceWiseProgressReport, vehiclesToBeReadyReport];

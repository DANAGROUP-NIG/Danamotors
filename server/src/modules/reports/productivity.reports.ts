import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PERMISSIONS } from '../../shared/constants/roles';
import { efficiency, splitLabourLine, type LineTechnician } from './core/calc';
import { localDayRange } from './core/dates';
import { dateQuery, rangeQuery } from './core/filters';
import { capRows, groupRows, MAX_REPORT_ROWS, sumFields } from './core/shape';
import { activeInvoiceSql, jobFilterSql, jobJoinsSql } from './core/sql';
import type { DimensionFilters, FilterKey, ReportBody, ReportDb, ReportDefinition, ReportGroup, ReportRow, ReportScope } from './core/types';

type LineRow = {
  lineId: string;
  jobId: string;
  jobNumber: string;
  jobDate: Date;
  billDate: Date | null;
  lineDate: Date;
  registration: string | null;
  model: string | null;
  labourCode: string;
  description: string;
  standardHours: number | null;
  hours: number;
  amount: number;
  technicians: Array<LineTechnician & { name: string }>;
};

const UNASSIGNED = 'unassigned';

/**
 * Labour lines with their technicians. `period` picks lines by when they were recorded or by the
 * date of the job's current bill.
 */
async function labourLines(db: ReportDb, scope: ReportScope, filters: DimensionFilters, period: { on: 'line' | 'bill'; start: Date; end: Date }) {
  const technicianSql = filters.technician?.length
    ? Prisma.sql` AND EXISTS (SELECT 1 FROM "JobCardLabourTechnician" ft WHERE ft."jobCardLabourId" = l."id" AND ft."technicianId" IN (${Prisma.join(filters.technician)}))`
    : Prisma.empty;
  const periodSql =
    period.on === 'bill'
      ? Prisma.sql`bill."issuedDate" >= ${period.start} AND bill."issuedDate" < ${period.end}`
      : Prisma.sql`l."createdAt" >= ${period.start} AND l."createdAt" < ${period.end}`;
  // The technician filter is applied per line above, not per job.
  const { technician: _technician, ...jobFilters } = filters;
  return db.$queryRaw<LineRow[]>(Prisma.sql`
    SELECT l."id" AS "lineId", j."id" AS "jobId", j."jobNumber", j."createdAt" AS "jobDate", bill."issuedDate" AS "billDate",
      l."createdAt" AS "lineDate", v."registrationNumber" AS "registration",
      COALESCE(mdl."description", v."model", v."customModel") AS "model",
      li."code" AS "labourCode", l."description", l."standardHours", l."hours", l."amount",
      COALESCE(
        (SELECT json_agg(json_build_object('technicianId', t."technicianId", 'sharePercent', t."sharePercent",
                 'name', TRIM(CONCAT(u."firstName", ' ', u."lastName"))) ORDER BY t."createdAt")
         FROM "JobCardLabourTechnician" t JOIN "User" u ON u."id" = t."technicianId" WHERE t."jobCardLabourId" = l."id"),
        CASE WHEN l."technicianId" IS NOT NULL THEN
          (SELECT json_build_array(json_build_object('technicianId', u."id", 'sharePercent', NULL, 'name', TRIM(CONCAT(u."firstName", ' ', u."lastName"))))
           FROM "User" u WHERE u."id" = l."technicianId") END,
        '[]'::json) AS "technicians"
    FROM "JobCardLabour" l
    JOIN "LabourItem" li ON li."id" = l."labourItemId"
    JOIN "JobCard" j ON j."id" = l."jobCardId"
    ${jobJoinsSql}
    LEFT JOIN LATERAL (
      SELECT i."issuedDate" FROM "Invoice" i WHERE i."jobCardId" = j."id" AND ${activeInvoiceSql}
      ORDER BY i."issuedDate" DESC LIMIT 1) bill ON true
    WHERE ${periodSql}
    ${technicianSql}
    ${jobFilterSql(scope, jobFilters)}
    ORDER BY j."createdAt", j."jobNumber", l."createdAt"
    LIMIT ${MAX_REPORT_ROWS + 1}`);
}

type ShareRow = ReportRow & {
  technicianId: string;
  technician: string;
  jobId: string;
  standardHours: number;
  chargedHours: number;
  amount: number;
};

/** One row per technician per labour line, with the line's hours and amount split between them. */
function technicianRows(lines: LineRow[], onlyTechnicians?: string[]): ShareRow[] {
  const keep = onlyTechnicians?.length ? new Set(onlyTechnicians) : null;
  return lines.flatMap((line) => {
    const base = {
      jobId: line.jobId,
      jobNumber: line.jobNumber,
      jobDate: line.jobDate,
      billDate: line.billDate,
      lineDate: line.lineDate,
      registration: line.registration,
      model: line.model,
      labourCode: line.labourCode,
      description: line.description,
    };
    if (!line.technicians.length)
      return keep ? [] : [{ ...base, technicianId: UNASSIGNED, technician: 'No technician', standardHours: line.standardHours ?? 0, chargedHours: line.hours, amount: line.amount, sharedWith: null, sharePercent: 100 }];
    const names = new Map(line.technicians.map((t) => [t.technicianId, t.name]));
    return splitLabourLine(line, line.technicians)
      .filter((share) => !keep || keep.has(share.technicianId))
      .map((share) => ({
        ...base,
        technicianId: share.technicianId,
        technician: names.get(share.technicianId) ?? 'Technician',
        standardHours: share.standardHours ?? 0,
        chargedHours: share.chargedHours,
        amount: share.amount,
        sharePercent: share.appliedPercent,
        sharedWith: line.technicians.length > 1 ? line.technicians.filter((t) => t.technicianId !== share.technicianId).map((t) => t.name).join(', ') : null,
      }));
  });
}

const SHARE_SUMS = ['standardHours', 'chargedHours', 'amount'] as const;

/** Group by technician with jobs, lines, hours, amount and efficiency per technician. */
function byTechnician(rows: ShareRow[]): Pick<ReportBody, 'rows' | 'groups' | 'totals' | 'summary'> {
  const grouped = groupRows(rows, { key: (row) => row.technicianId, label: (row) => row.technician }, SHARE_SUMS);
  const jobsByTechnician = new Map<string, Set<string>>();
  for (const row of rows) jobsByTechnician.set(row.technicianId, (jobsByTechnician.get(row.technicianId) ?? new Set()).add(row.jobId));
  const groups: ReportGroup[] = grouped.groups
    .map((group) => ({
      ...group,
      totals: {
        count: group.count,
        jobs: jobsByTechnician.get(group.key)?.size ?? 0,
        ...group.totals,
        efficiency: efficiency(group.totals.standardHours, group.totals.chargedHours) ?? 0,
      },
    }))
    // Unassigned work last; technicians by name.
    .sort((a, b) => (a.key === UNASSIGNED ? 1 : b.key === UNASSIGNED ? -1 : a.label.localeCompare(b.label)));
  const order = groups.map((group) => group.key);
  const sortedRows = [...grouped.rows].sort((a, b) => order.indexOf(a.groupKey) - order.indexOf(b.groupKey));
  const totals = sumFields(rows, SHARE_SUMS);
  return {
    rows: sortedRows,
    groups,
    totals: { count: rows.length, jobs: new Set(rows.map((row) => row.jobId)).size, ...totals, efficiency: efficiency(totals.standardHours, totals.chargedHours) ?? 0 },
    summary: { technicians: groups.filter((group) => group.key !== UNASSIGNED).length },
  };
}

// ── 8. Daily productivity ───────────────────────────────────────────────────

const DAILY_FILTERS: FilterKey[] = ['model', 'variant', 'serviceType', 'team', 'receivedBy', 'deliveredBy'];
const dailyQuery = dateQuery(DAILY_FILTERS, {});

export const dailyProductivityReport: ReportDefinition<z.infer<typeof dailyQuery>> = {
  slug: 'daily-productivity',
  title: 'Daily productivity report',
  width: 80,
  permission: PERMISSIONS.REPORT_DAILY_PRODUCTIVITY,
  summary:
    'What each technician did on a day: labour lines recorded that day, by technician, with standard hours, charged hours, labour amount and efficiency (standard ÷ charged). A line worked by several technicians is split by their recorded shares, or evenly.',
  period: 'date',
  query: dailyQuery,
  filterKeys: DAILY_FILTERS,
  example: {
    groups: [{ key: 'technician-uuid', label: 'Musa Garba', count: 9, totals: { count: 9, jobs: 5, standardHours: 11.5, chargedHours: 10, amount: 212000, efficiency: 115 } }],
    totals: { count: 58, jobs: 31, standardHours: 62.5, chargedHours: 58, amount: 1145000, efficiency: 108 },
  },
  async run(db, scope, q) {
    const { start, end } = localDayRange(q.date, q.date, scope.timeZone);
    const { rows: lines, truncated } = capRows(await labourLines(db, scope, q, { on: 'line', start, end }));
    return { ...byTechnician(technicianRows(lines)), truncated };
  },
};

// ── 9. Technician productivity ──────────────────────────────────────────────

const TECHNICIAN_FILTERS: FilterKey[] = ['model', 'variant', 'technician'];
const technicianQuery = rangeQuery(TECHNICIAN_FILTERS, { orderBy: z.enum(['jobDate', 'billDate']).default('jobDate') });

export const technicianProductivityReport: ReportDefinition<z.infer<typeof technicianQuery>> = {
  slug: 'technician-productivity',
  title: 'Technician productivity report',
  width: 80,
  permission: PERMISSIONS.REPORT_TECHNICIAN_PRODUCTIVITY,
  summary:
    'Technician output over a billing period (bill date of the job): each labour line credited to its technicians, with standard and charged hours, amount, and efficiency per technician. Shared lines are split by the recorded shares, or evenly.',
  period: 'range',
  query: technicianQuery,
  filterKeys: TECHNICIAN_FILTERS,
  params: [{ name: 'orderBy', description: 'jobDate (default) or billDate: the order of each technician\'s lines.', schema: { type: 'string', enum: ['jobDate', 'billDate'] } }],
  example: {
    rows: [{ technician: 'Musa Garba', jobNumber: '2026004790', jobDate: '2026-09-02T08:00:00.000Z', billDate: '2026-09-03T15:00:00.000Z', labourCode: 'PM20K', standardHours: 2, chargedHours: 2, amount: 40000, groupKey: 'technician-uuid' }],
    groups: [{ key: 'technician-uuid', label: 'Musa Garba', count: 52, totals: { count: 52, jobs: 38, standardHours: 168, chargedHours: 150, amount: 3240000, efficiency: 112 } }],
  },
  async run(db, scope, q) {
    const { start, end } = localDayRange(q.from, q.to, scope.timeZone);
    const { rows: lines, truncated } = capRows(await labourLines(db, scope, q, { on: 'bill', start, end }));
    const rows = technicianRows(lines, q.technician);
    const key = q.orderBy === 'billDate' ? 'billDate' : 'jobDate';
    rows.sort((a, b) => new Date(a[key] as Date).getTime() - new Date(b[key] as Date).getTime());
    return { ...byTechnician(rows), truncated };
  },
};

export const PRODUCTIVITY_REPORTS = [dailyProductivityReport, technicianProductivityReport];

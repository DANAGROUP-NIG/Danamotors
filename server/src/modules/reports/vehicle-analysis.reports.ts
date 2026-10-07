import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PERMISSIONS } from '../../shared/constants/roles';
import { isBeforeFirstService, mileageBandFor } from './core/calc';
import { daysBetween, localDateOf, localDayRange } from './core/dates';
import { rangeQuery } from './core/filters';
import { capRows, groupRows, MAX_REPORT_ROWS } from './core/shape';
import { activeInvoiceSql, canonicalStatusSql, jobColumnsSql, jobFilterSql, jobFromSql } from './core/sql';
import type { FilterKey, ReportDefinition, ReportRow } from './core/types';
import { activeMileageBands } from './settings';

/** Customer requests (complaints) on the job, as one line. */
const requestsSql = Prisma.sql`(
  SELECT string_agg(COALESCE(NULLIF(rq."description", ''), rqc."description"), '; ' ORDER BY rqc."description")
  FROM "JobComplaint" rq LEFT JOIN "WorkshopMaster" rqc ON rqc."id" = rq."complaintCodeId"
  WHERE rq."jobCardId" = j."id") AS "requests"`;

type JobRow = ReportRow & {
  jobId: string;
  jobDate: Date;
  mileage: number | null;
  requests: string | null;
  vin: string | null;
  registration: string | null;
  model: string | null;
  variant: string | null;
  customer: string | null;
};

// ── 15. Vehicles reported before first service ──────────────────────────────

const BEFORE_FIRST_FILTERS: FilterKey[] = ['model', 'variant', 'complaint'];
const beforeFirstServiceQuery = rangeQuery(BEFORE_FIRST_FILTERS, {});

type BeforeRow = JobRow & { vehicleId: string; saleDate: string | null; firstServiceAt: Date | null };

const fmtDay = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

export const beforeFirstServiceReport: ReportDefinition<z.infer<typeof beforeFirstServiceQuery>> = {
  slug: 'before-first-service',
  title: 'Vehicles reported before first service',
  width: 80,
  permission: PERMISSIONS.REPORT_BEFORE_FIRST_SERVICE,
  summary:
    'Vehicles sold in the period (sale date) that came in with faults before their first free service: jobs dated after the sale date and before the vehicle\'s first job with free service no 1 (or any job, if it has not had one), excluding free services and PDI.',
  period: 'range',
  query: beforeFirstServiceQuery,
  filterKeys: BEFORE_FIRST_FILTERS,
  example: {
    rows: [{ vin: 'KNAPX81ABP7019876', jobNumber: '2026002144', jobDate: '2026-04-02T09:00:00.000Z', mileage: 640, daysSinceSale: 21, requests: 'AC not cooling', groupKey: 'vehicle-uuid' }],
    summary: { vehicles: 23, visits: 27, averageDaysSinceSale: 38, topRequest: 'AC not cooling', topRequestCount: 9 },
  },
  async run(db, scope, q) {
    const result = await db.$queryRaw<BeforeRow[]>(Prisma.sql`
      SELECT ${jobColumnsSql}, ${requestsSql},
        v."id" AS "vehicleId", to_char(v."saleDate", 'YYYY-MM-DD') AS "saleDate", fs."firstServiceAt"
      ${jobFromSql}
      LEFT JOIN LATERAL (
        SELECT MIN(f."createdAt") AS "firstServiceAt"
        FROM "JobCard" f JOIN "WorkshopMaster" fst ON fst."id" = f."serviceTypeId"
        WHERE f."vehicleId" = j."vehicleId" AND fst."freeServiceNo" = 1
          AND ${canonicalStatusSql(Prisma.raw('f."status"'))} <> 'CANCELLED') fs ON true
      WHERE v."saleDate" IS NOT NULL
        AND v."saleDate"::date BETWEEN ${q.from}::date AND ${q.to}::date
        AND j."createdAt" > v."saleDate"
        AND COALESCE(st."freeService", false) = false
        ${jobFilterSql(scope, q)}
      ORDER BY v."saleDate", v."vin", j."createdAt"
      LIMIT ${MAX_REPORT_ROWS + 1}`);

    const { rows: capped, truncated } = capRows(result);
    const rows = capped
      .map((row) => ({ ...row, jobLocalDate: localDateOf(row.jobDate, scope.timeZone) }))
      .filter((row) => isBeforeFirstService({ at: row.jobDate, localDate: row.jobLocalDate }, row.saleDate, row.firstServiceAt))
      .map(({ jobLocalDate, firstServiceAt: _first, ...row }) => ({ ...row, daysSinceSale: daysBetween(row.saleDate!, jobLocalDate) }));

    const grouped = groupRows(
      rows,
      {
        key: (row) => row.vehicleId,
        label: (row) =>
          [row.vin, row.registration, [row.model, row.variant].filter(Boolean).join(' '), `Sold ${fmtDay(row.saleDate!)}`, row.customer].filter(Boolean).join(' · '),
      },
      [],
    );
    const requestCounts = new Map<string, number>();
    for (const row of rows)
      for (const request of String(row.requests ?? '').split('; ').filter(Boolean)) requestCounts.set(request, (requestCounts.get(request) ?? 0) + 1);
    const [topRequest, topRequestCount] = Array.from(requestCounts.entries()).sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    return {
      rows: grouped.rows,
      groups: grouped.groups.map((group) => ({ ...group, totals: { count: group.count } })),
      totals: { count: rows.length },
      summary: {
        vehicles: grouped.groups.length,
        visits: rows.length,
        averageDaysSinceSale: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.daysSinceSale, 0) / rows.length) : null,
        topRequest,
        topRequestCount,
      },
      truncated,
    };
  },
};

// ── 16. List of vehicles visited, mileage wise ──────────────────────────────

const MILEAGE_FILTERS: FilterKey[] = ['model', 'complaint', 'labourOperation'];
const km = z.coerce.number().int().min(0).max(10_000_000).optional();
const mileageWiseQuery = rangeQuery(MILEAGE_FILTERS, { mileageFrom: km, mileageTo: km }).superRefine((value, ctx) => {
  const { mileageFrom, mileageTo } = value as { mileageFrom?: number; mileageTo?: number };
  if (mileageFrom !== undefined && mileageTo !== undefined && mileageTo < mileageFrom)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mileageTo'], message: 'The upper mileage must be at least the lower mileage' });
});

export const mileageWiseReport: ReportDefinition<z.infer<typeof mileageWiseQuery>> = {
  slug: 'mileage-wise',
  title: 'List of vehicles visited, mileage wise',
  width: 80,
  permission: PERMISSIONS.REPORT_MILEAGE_WISE,
  summary:
    'Vehicles billed in the period grouped by the mileage bands in report settings, with customer requests and labour lines. Optional mileage range (mileageFrom / mileageTo, km).',
  period: 'range',
  query: mileageWiseQuery,
  filterKeys: MILEAGE_FILTERS,
  params: [
    { name: 'mileageFrom', description: 'Lowest odometer reading (km). Omit for no lower limit.', schema: { type: 'integer' } },
    { name: 'mileageTo', description: 'Highest odometer reading (km). Omit for no upper limit.', schema: { type: 'integer' } },
  ],
  example: {
    rows: [{ jobNumber: '2026004779', billDate: '2026-09-12T10:00:00.000Z', registration: 'ABJ 552 ZT', mileage: 10450, band: '10,001–20,000 km', labour: 'PM20K Periodic maintenance 20,000 km · 2 h' }],
    groups: [{ key: 'band-uuid', label: '10,001–20,000 km', count: 41, totals: { count: 41 } }],
    breakdown: [{ key: 'band-uuid', label: '10,001–20,000 km', count: 41 }],
  },
  async run(db, scope, q) {
    const { start, end } = localDayRange(q.from, q.to, scope.timeZone);
    const bands = await activeMileageBands(db);
    const result = await db.$queryRaw<(JobRow & { billNumber: string; billDate: Date; labour: string | null })[]>(Prisma.sql`
      SELECT ${jobColumnsSql}, ${requestsSql},
        bill."invoiceNumber" AS "billNumber", bill."issuedDate" AS "billDate",
        (SELECT string_agg(TRIM(CONCAT(li."code", ' ', l."description", ' · ', l."hours", ' h')), '; ' ORDER BY l."createdAt")
         FROM "JobCardLabour" l JOIN "LabourItem" li ON li."id" = l."labourItemId" WHERE l."jobCardId" = j."id") AS "labour"
      ${jobFromSql}
      JOIN LATERAL (
        SELECT i."invoiceNumber", i."issuedDate" FROM "Invoice" i
        WHERE i."jobCardId" = j."id" AND ${activeInvoiceSql}
          AND i."issuedDate" >= ${start} AND i."issuedDate" < ${end}
        ORDER BY i."issuedDate" DESC LIMIT 1) bill ON true
      WHERE true
        ${q.mileageFrom !== undefined ? Prisma.sql`AND j."mileage" >= ${q.mileageFrom}` : Prisma.empty}
        ${q.mileageTo !== undefined ? Prisma.sql`AND j."mileage" <= ${q.mileageTo}` : Prisma.empty}
        ${jobFilterSql(scope, q)}
      ORDER BY j."mileage" NULLS LAST, bill."issuedDate"
      LIMIT ${MAX_REPORT_ROWS + 1}`);
    const { rows: capped, truncated } = capRows(result);
    const rows = capped.map((row) => {
      const band = mileageBandFor(row.mileage, bands);
      return { ...row, bandId: band?.id ?? 'none', band: band?.label ?? 'Mileage not recorded' };
    });
    const grouped = groupRows(rows, { key: (row) => row.bandId, label: (row) => row.band, order: [...bands.map((band) => band.id), 'none'] }, []);
    const counts = new Map(grouped.groups.map((group) => [group.key, group.count]));
    return {
      rows: grouped.rows,
      groups: grouped.groups.map((group) => ({ ...group, totals: { count: group.count } })),
      totals: { count: rows.length },
      // Every band (including empty ones) for the chart.
      breakdown: [
        ...bands.map((band) => ({ key: band.id, label: band.label, count: counts.get(band.id) ?? 0 })),
        ...(counts.get('none') ? [{ key: 'none', label: 'Not recorded', count: counts.get('none')! }] : []),
      ],
      truncated,
    };
  },
};

export const VEHICLE_ANALYSIS_REPORTS = [beforeFirstServiceReport, mileageWiseReport];

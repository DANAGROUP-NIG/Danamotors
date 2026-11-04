import { ChargeType, Prisma } from '@prisma/client';
import { z } from 'zod';
import { PERMISSIONS } from '../../../shared/constants/roles';
import { localDayRange } from '../core/dates';
import { dateQuery, rangeQuery } from '../core/filters';
import { capRows, groupRows, MAX_REPORT_ROWS, sumFields } from '../core/shape';
import { activeInvoiceSql, inFilter, jobColumnsSql, jobFilterSql, jobJoinsSql } from '../core/sql';
import { defineReport, type ReportGroup, type ReportRow } from '../core/types';
import { loadMisJobs } from './mis.data';
import { CATEGORY_LABELS, CATEGORY_ORDER, lateByTime, percentOf, percentShares, perUnit } from './mis.logic';
import { jobTypeDoc, jobTypeParam, MIS_STD_FILTERS } from './mis.params';

/** Requisition types in legacy words: non-warranty (customer), warranty, FOC (free) and goodwill. */
export const CHARGE_TYPE_FIELD: Record<ChargeType, 'nonWarranty' | 'warranty' | 'foc' | 'goodwill'> = {
  CUSTOMER: 'nonWarranty',
  WARRANTY: 'warranty',
  FREE: 'foc',
  GOODWILL: 'goodwill',
};

const chargeTypeList = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const list = (Array.isArray(value) ? value : [value]).flatMap((item) => String(item).split(',')).map((item) => item.trim()).filter(Boolean);
  return list.length ? Array.from(new Set(list)) : undefined;
}, z.array(z.nativeEnum(ChargeType)).optional());

/** Returns that count: completed (new return slips) or approved (legacy returns). */
const countedReturnSql = Prisma.sql`LOWER(pr."status") IN ('approved', 'completed')`;
/** Returns that reduce what a job consumed, as the job bill counts them: anything not rejected or cancelled. */
const netReturnSql = Prisma.sql`UPPER(pr."status") NOT IN ('REJECTED', 'CANCELLED')`;

// ── S4. Group-wise productivity ──────────────────────────────────────────────

interface LabourLineRow {
  lineId: string;
  jobId: string;
  groupId: string | null;
  groupCode: string | null;
  groupLabel: string | null;
  hours: number;
  amount: number;
  countedAt: Date;
}

/** Labour lines, jobs, hours sold, net amount, share and labour per job for one period. */
export function productivityFor(lines: readonly LabourLineRow[], groupKeys: readonly string[], keyOf: (line: LabourLineRow) => string) {
  const byGroup = new Map<string, { lines: number; jobs: Set<string>; hours: Prisma.Decimal; amount: Prisma.Decimal }>();
  for (const key of groupKeys) byGroup.set(key, { lines: 0, jobs: new Set(), hours: new Prisma.Decimal(0), amount: new Prisma.Decimal(0) });
  const allJobs = new Set<string>();
  for (const line of lines) {
    const bucket = byGroup.get(keyOf(line))!;
    bucket.lines += 1;
    bucket.jobs.add(line.jobId);
    bucket.hours = bucket.hours.plus(line.hours);
    bucket.amount = bucket.amount.plus(line.amount);
    allJobs.add(line.jobId);
  }
  const amounts = groupKeys.map((key) => byGroup.get(key)!.amount.toDecimalPlaces(2).toNumber());
  const shares = percentShares(amounts);
  const perGroup = new Map(
    groupKeys.map((key, index) => {
      const bucket = byGroup.get(key)!;
      return [key, { lines: bucket.lines, jobs: bucket.jobs.size, hours: bucket.hours.toDecimalPlaces(2).toNumber(), amount: amounts[index], share: shares[index], perJob: perUnit(amounts[index], bucket.jobs.size) }];
    }),
  );
  const amount = amounts.reduce((total, value) => total.plus(value), new Prisma.Decimal(0)).toDecimalPlaces(2).toNumber();
  const totals = {
    lines: lines.length,
    jobs: allJobs.size,
    hours: Array.from(byGroup.values()).reduce((total, bucket) => total.plus(bucket.hours), new Prisma.Decimal(0)).toDecimalPlaces(2).toNumber(),
    amount,
    share: amount ? 100 : 0,
    perJob: perUnit(amount, allJobs.size),
  };
  return { perGroup, totals };
}

const prefixed = (prefix: string, values: { lines: number; jobs: number; hours: number; amount: number; share: number; perJob: number }) => ({
  [`${prefix}Lines`]: values.lines,
  [`${prefix}Jobs`]: values.jobs,
  [`${prefix}Hours`]: values.hours,
  [`${prefix}Amount`]: values.amount,
  [`${prefix}Share`]: values.share,
  [`${prefix}PerJob`]: values.perJob,
});

const groupProductivity = defineReport({
  slug: 'group-productivity',
  title: 'Group-wise productivity',
  width: 80,
  permission: PERMISSIONS.GROUP_PRODUCTIVITY_READ,
  summary:
    'Labour per service group for the month to date and the year to date as on a date: labour lines, jobs, hours sold (standard hours where recorded), labour net of discount, share and labour per job. Billed lines count on the bill date, others on the job date.',
  period: 'date',
  query: dateQuery(['model', 'variant', 'serviceGroup'], {}),
  filterKeys: ['model', 'variant', 'serviceGroup'],
  example: {
    rows: [{ id: 'group-uuid', label: 'MAINTENANCE', mtdLines: 42, mtdJobs: 30, mtdHours: 51.5, mtdAmount: 772500, mtdShare: 64.2, mtdPerJob: 25750, ytdLines: 410, ytdJobs: 290, ytdHours: 498, ytdAmount: 7470000, ytdShare: 61.8, ytdPerJob: 25758.62 }],
    groups: [],
    totals: { count: 3, mtdLines: 60, mtdJobs: 41, mtdAmount: 1203000, mtdShare: 100 },
  },
  async run(db, scope, query) {
    const yearStart = `${query.date.slice(0, 4)}-01-01`;
    const monthStart = `${query.date.slice(0, 7)}-01`;
    const { start, end } = localDayRange(yearStart, query.date, scope.timeZone);
    const monthFrom = localDayRange(monthStart, query.date, scope.timeZone).start;
    const lines = await db.$queryRaw<LabourLineRow[]>`
      WITH job_labour AS (
        SELECT l."jobCardId", SUM(l."amount")::numeric AS gross FROM "JobCardLabour" l GROUP BY l."jobCardId"
      ), job_discount AS (
        SELECT i."jobCardId", SUM(i."labourDiscountAmount")::numeric AS discount FROM "Invoice" i WHERE ${activeInvoiceSql} GROUP BY i."jobCardId"
      )
      SELECT l."id" AS "lineId", j."id" AS "jobId", sg."id" AS "groupId", sg."code" AS "groupCode", sg."description" AS "groupLabel",
        ROUND(COALESCE(l."standardHours", l."hours")::numeric, 2)::float8 AS "hours",
        ROUND(l."amount"::numeric - CASE WHEN jl.gross > 0 THEN l."amount"::numeric * COALESCE(jd.discount, 0) / jl.gross ELSE 0 END, 2)::float8 AS "amount",
        COALESCE(j."billedAt", j."createdAt") AS "countedAt"
      FROM "JobCardLabour" l
      JOIN "JobCard" j ON j."id" = l."jobCardId"
      ${jobJoinsSql}
      JOIN "LabourItem" li ON li."id" = l."labourItemId"
      LEFT JOIN "WorkshopMaster" sg ON sg."id" = li."serviceGroupId"
      LEFT JOIN job_labour jl ON jl."jobCardId" = j."id"
      LEFT JOIN job_discount jd ON jd."jobCardId" = j."id"
      WHERE COALESCE(j."billedAt", j."createdAt") >= ${start} AND COALESCE(j."billedAt", j."createdAt") < ${end}
        ${jobFilterSql(scope, { model: query.model, variant: query.variant })}${inFilter(Prisma.raw('li."serviceGroupId"'), query.serviceGroup)}`;

    const keyOf = (line: LabourLineRow) => line.groupId ?? 'none';
    const labels = new Map<string, string>();
    for (const line of lines) labels.set(keyOf(line), line.groupLabel ?? 'No service group');
    const keys = Array.from(labels.keys()).sort((a, b) => (a === 'none' ? 1 : b === 'none' ? -1 : labels.get(a)!.localeCompare(labels.get(b)!)));
    const month = productivityFor(
      lines.filter((line) => line.countedAt >= monthFrom),
      keys,
      keyOf,
    );
    const year = productivityFor(lines, keys, keyOf);
    const rows = keys.map((key) => ({ id: key, label: labels.get(key)!, ...prefixed('mtd', month.perGroup.get(key)!), ...prefixed('ytd', year.perGroup.get(key)!) }));
    return {
      rows,
      groups: [],
      totals: { count: rows.length, ...prefixed('mtd', month.totals), ...prefixed('ytd', year.totals) },
      summary: { mtdAmount: month.totals.amount, ytdAmount: year.totals.amount, mtdJobs: month.totals.jobs, ytdJobs: year.totals.jobs },
    };
  },
});

// ── S5. Engineer performance ─────────────────────────────────────────────────

const ENGINEER_SUM_KEYS = [
  'jobs', 'FREE', 'PAID', 'RUNNING_REPAIR', 'OTHER', 'ACCIDENTAL', 'PDI',
  'labourHours', 'labourAmount', 'spares', 'oil', 'total', 'repeat', 'late',
] as const;

/** Ratios of an engineer's (or the overall) totals: billing per job, repeat % and late %. */
export function engineerRatios(totals: Record<string, number>): Record<string, number> {
  const jobs = totals.jobs ?? 0;
  return { ...totals, perJob: perUnit(totals.total ?? 0, jobs), repeatPct: percentOf(totals.repeat ?? 0, jobs), latePct: percentOf(totals.late ?? 0, jobs) };
}

const engineerPerformance = defineReport({
  slug: 'engineer-performance',
  title: 'Engineer performance',
  width: 132,
  permission: PERMISSIONS.ENGINEER_PERFORMANCE_READ,
  summary:
    'Jobs billed in the period by engineer: each job with labour hours and amount, spares, oil, total, repeat and promised vs delivered; per engineer the jobs by service category, billing per job, repeat % and late deliveries %.',
  period: 'range',
  query: rangeQuery(MIS_STD_FILTERS, { jobType: jobTypeParam.default('REGULAR') }),
  filterKeys: MIS_STD_FILTERS,
  params: [jobTypeDoc],
  example: {
    rows: [
      {
        groupKey: 'engineer-uuid', jobId: 'job-uuid', jobNumber: 'JC-000123', jobDate: '2026-03-02T09:00:00.000Z', registration: 'ABJ503GD', model: 'Rio', serviceType: 'RG · PAID SERVICE',
        jobs: 1, PAID: 1, labourHours: 2.5, labourAmount: 37500, spares: 42000, oil: 18000, total: 97500, repeat: 0, late: 0,
        promisedAt: '2026-03-02T16:00:00.000Z', deliveredAt: '2026-03-02T15:10:00.000Z',
      },
    ],
    groups: [{ key: 'engineer-uuid', label: 'Example engineer', count: 18, totals: { jobs: 18, total: 1520000, perJob: 84444.44, repeatPct: 5.56, latePct: 11.11 } }],
    totals: { count: 18, jobs: 18, total: 1520000, perJob: 84444.44 },
  },
  async run(db, scope, query) {
    const { jobs, truncated } = await loadMisJobs(db, scope, { from: query.from, to: query.to, basis: 'billed', filters: query, jobType: query.jobType });
    const rows: ReportRow[] = jobs.map((job) => ({
      engineerId: job.engineerId,
      engineer: job.engineer ?? 'No engineer recorded',
      jobId: job.jobId,
      jobNumber: job.jobNumber,
      jobDate: job.jobDate,
      registration: job.registration,
      model: job.model,
      variant: job.variant,
      serviceType: job.serviceTypeCode ? `${job.serviceTypeCode} · ${job.serviceType}` : job.serviceType,
      category: job.category,
      jobs: 1,
      ...Object.fromEntries(CATEGORY_ORDER.map((category) => [category, job.category === category ? 1 : 0])),
      labourHours: job.labourHours,
      labourAmount: job.labourNet,
      spares: job.spares,
      oil: job.oil,
      total: job.netValue,
      repeat: job.isRepeat ? 1 : 0,
      late: lateByTime(job.promisedAt, job.deliveredAt) ? 1 : 0,
      promisedAt: job.promisedAt,
      deliveredAt: job.deliveredAt,
    }));
    rows.sort((a, b) => String(a.engineer).localeCompare(String(b.engineer)) || (a.jobDate as Date).getTime() - (b.jobDate as Date).getTime());
    const grouped = groupRows(rows, { key: (row) => String(row.engineerId ?? 'none'), label: (row) => String(row.engineer) }, ENGINEER_SUM_KEYS);
    return {
      rows: grouped.rows,
      groups: grouped.groups.map((group) => ({ ...group, totals: engineerRatios(group.totals) })),
      totals: { count: rows.length, ...engineerRatios(sumFields(rows, ENGINEER_SUM_KEYS)) },
      breakdown: CATEGORY_ORDER.map((category) => ({ key: category, label: CATEGORY_LABELS[category], count: jobs.filter((job) => job.category === category).length })),
      truncated,
    };
  },
});

// ── S6. Engineer-wise part consumption ───────────────────────────────────────

interface ConsumptionRow extends ReportRow {
  lineId: string;
  issueDate: Date;
  requisitionNumber: string | null;
  chargeType: ChargeType;
  jobId: string;
  jobNumber: string;
  engineerId: string | null;
  engineer: string | null;
  partNumber: string;
  description: string;
  partType: string;
  qtyRequired: number;
  qtyIssued: number;
  qtyReturned: number;
  rate: number;
  amount: number;
}

const CONSUMPTION_SUM_KEYS = ['qtyIssued', 'qtyReturned', 'amount', 'nonWarranty', 'warranty', 'foc', 'goodwill', 'spares', 'oil'] as const;

/** Spread a consumption line's amount into its charge type and part kind columns. */
export function consumptionFields(row: Pick<ConsumptionRow, 'amount' | 'chargeType' | 'partType'>) {
  const fields: Record<string, number> = { nonWarranty: 0, warranty: 0, foc: 0, goodwill: 0, spares: 0, oil: 0 };
  fields[CHARGE_TYPE_FIELD[row.chargeType]] = row.amount;
  fields[row.partType === 'O' ? 'oil' : 'spares'] = row.amount;
  return fields;
}

const partKindSql = (kind: 'SPARES' | 'OIL' | 'BOTH') =>
  kind === 'OIL' ? Prisma.sql` AND sp."partType" = 'O'` : kind === 'SPARES' ? Prisma.sql` AND sp."partType" <> 'O'` : Prisma.empty;

const engineerPartConsumption = defineReport({
  slug: 'engineer-part-consumption',
  title: 'Engineer-wise part consumption',
  width: 80,
  permission: PERMISSIONS.ENGINEER_PART_CONSUMPTION_READ,
  summary:
    "Parts issued to jobs in the period net of returns, by the job's engineer (the requisition's engineer when the job has none): requisition, part, quantities required, issued and returned, rate and amount; per engineer the amount by charge type and spares / oil.",
  period: 'range',
  query: rangeQuery(['engineer'], { partKind: z.enum(['SPARES', 'OIL', 'BOTH']).default('BOTH') }),
  filterKeys: ['engineer'],
  params: [{ name: 'partKind', description: 'SPARES, OIL (part type O, as in the parts reports) or BOTH (default).', schema: { type: 'string', enum: ['SPARES', 'OIL', 'BOTH'] } }],
  example: {
    rows: [
      {
        groupKey: 'engineer-uuid', engineer: 'Example engineer', issueDate: '2026-03-02T10:00:00.000Z', requisitionNumber: 'RQ-000045', jobNumber: 'JC-000123', partNumber: '26300-35505',
        description: 'OIL FILTER', chargeType: 'CUSTOMER', qtyRequired: 1, qtyIssued: 1, qtyReturned: 0, rate: 6200, amount: 6200, nonWarranty: 6200, spares: 6200,
      },
    ],
    groups: [{ key: 'engineer-uuid', label: 'Example engineer', count: 12, totals: { amount: 254000, nonWarranty: 230000, warranty: 24000, spares: 190000, oil: 64000 } }],
    totals: { count: 12, amount: 254000 },
  },
  async run(db, scope, query) {
    const { start, end } = localDayRange(query.from, query.to, scope.timeZone);
    const jobScope = jobFilterSql(scope, {}, { jobType: 'REGULAR' });
    const result = await db.$queryRaw<ConsumptionRow[]>`
      WITH lines AS (
        SELECT rl."id" AS "lineId", r."requisitionDate" AS "issueDate", r."requisitionNumber", r."chargeType",
          j."id" AS "jobId", j."jobNumber", COALESCE(j."engineerId", r."engineerId") AS "engineerId",
          rl."sparePartId", rl."description", rl."quantityRequired" AS "qtyRequired", rl."quantityIssued" AS "qtyIssued",
          COALESCE(ret.quantity, 0) AS "qtyReturned", rl."rate"::numeric AS "rate"
        FROM "PartRequisitionLine" rl
        JOIN "PartRequisition" r ON r."id" = rl."requisitionId"
        JOIN "JobCard" j ON j."id" = r."jobCardId"
        ${jobJoinsSql}
        LEFT JOIN LATERAL (SELECT SUM(pr."quantity") AS quantity FROM "PartReturn" pr WHERE pr."requisitionLineId" = rl."id" AND ${netReturnSql}) ret ON true
        WHERE r."status" = 'ISSUED' AND rl."quantityIssued" > 0 AND r."requisitionDate" >= ${start} AND r."requisitionDate" < ${end}${jobScope}
        UNION ALL
        SELECT pi."id", pi."issuedAt", NULL, COALESCE(jcl."chargeType", 'CUSTOMER'::"ChargeType"),
          j."id", j."jobNumber", j."engineerId",
          pi."sparePartId", NULL, pi."quantity", pi."quantity", COALESCE(ret.quantity, 0), NULL
        FROM "PartIssuance" pi
        JOIN "JobCard" j ON j."id" = pi."jobCardId"
        ${jobJoinsSql}
        LEFT JOIN "JobCardLine" jcl ON jcl."partIssuanceId" = pi."id"
        LEFT JOIN LATERAL (SELECT SUM(pr."quantity") AS quantity FROM "PartReturn" pr WHERE pr."partIssuanceId" = pi."id" AND ${netReturnSql}) ret ON true
        WHERE NOT EXISTS (SELECT 1 FROM "PartRequisitionLine" prl WHERE prl."partIssuanceId" = pi."id")
          AND pi."issuedAt" >= ${start} AND pi."issuedAt" < ${end}${jobScope}
      )
      SELECT l."lineId", l."issueDate", l."requisitionNumber", l."chargeType"::text AS "chargeType", l."jobId", l."jobNumber",
        l."engineerId", NULLIF(TRIM(CONCAT(en."firstName", ' ', en."lastName")), '') AS "engineer",
        sp."partNumber", COALESCE(l."description", sp."name") AS "description", sp."partType",
        l."qtyRequired"::float8 AS "qtyRequired", l."qtyIssued"::float8 AS "qtyIssued", l."qtyReturned"::float8 AS "qtyReturned",
        ROUND(COALESCE(l."rate", sp."retailRate"::numeric, 0), 2)::float8 AS "rate",
        ROUND((l."qtyIssued" - l."qtyReturned")::numeric * COALESCE(l."rate", sp."retailRate"::numeric, 0), 2)::float8 AS "amount"
      FROM lines l
      JOIN "SparePart" sp ON sp."id" = l."sparePartId"
      LEFT JOIN "User" en ON en."id" = l."engineerId"
      WHERE TRUE${inFilter(Prisma.raw('l."engineerId"'), query.engineer)}${partKindSql(query.partKind)}
      ORDER BY "engineer" NULLS LAST, l."issueDate", l."jobNumber"
      LIMIT ${MAX_REPORT_ROWS + 1}`;
    const { rows: capped, truncated } = capRows(result);
    const rows = capped.map((row) => ({ ...row, ...consumptionFields(row) }));
    const grouped = groupRows(rows, { key: (row) => row.engineerId ?? 'none', label: (row) => row.engineer ?? 'No engineer recorded' }, CONSUMPTION_SUM_KEYS);
    return { rows: grouped.rows, groups: grouped.groups, totals: { count: rows.length, ...sumFields(rows, CONSUMPTION_SUM_KEYS) }, truncated };
  },
});

// ── S7. Requisition return register ──────────────────────────────────────────

interface ReturnRow extends ReportRow {
  returnLineId: string;
  returnSlipId: string | null;
  returnNumber: string;
  returnDate: Date;
  requisitionId: string | null;
  requisitionNumber: string | null;
  requisitionDate: Date | null;
  jobId: string;
  jobNumber: string;
  jobDate: Date;
  registration: string | null;
  model: string | null;
  engineer: string | null;
  partNumber: string;
  description: string;
  qtyIssued: number;
  qtyReturned: number;
  rate: number;
  amount: number;
  reason: string | null;
  chargeType: ChargeType;
  billed: boolean;
}

const RETURN_GROUPS = {
  JOB: { key: (row: ReturnRow) => row.jobId, label: (row: ReturnRow) => [row.jobNumber, row.registration].filter(Boolean).join(' · ') },
  REQUISITION: {
    key: (row: ReturnRow) => row.requisitionId ?? `direct:${row.jobId}`,
    label: (row: ReturnRow) => (row.requisitionNumber ? `${row.requisitionNumber} · job ${row.jobNumber}` : `Direct issue · job ${row.jobNumber}`),
  },
  RETURN: { key: (row: ReturnRow) => row.returnSlipId ?? row.returnLineId, label: (row: ReturnRow) => `${row.returnNumber} · job ${row.jobNumber}` },
} as const;

const requisitionReturnRegister = defineReport({
  slug: 'requisition-return-register',
  title: 'Requisition return register',
  width: 132,
  permission: PERMISSIONS.REQUISITION_RETURN_REGISTER_READ,
  summary:
    'Parts returned from jobs in the period (completed or approved returns), grouped by job, requisition or return, with requisition type, billed / unbilled and part filters.',
  period: 'range',
  query: rangeQuery([], {
    basedOn: z.enum(['JOB', 'REQUISITION', 'RETURN']).default('RETURN'),
    jobType: jobTypeParam.default('BOTH'),
    chargeTypes: chargeTypeList,
    billing: z.enum(['BILLED', 'UNBILLED', 'BOTH']).default('BOTH'),
    partFlag: z.enum(['O', 'A', 'F', 'L']).optional(),
    partCategory: z.string().trim().min(1).max(20).optional(),
    partNumber: z.string().trim().min(1).max(60).optional(),
  }),
  filterKeys: [],
  params: [
    { name: 'basedOn', description: 'Grouping: JOB, REQUISITION or RETURN (default).', schema: { type: 'string', enum: ['JOB', 'REQUISITION', 'RETURN'] } },
    { ...jobTypeDoc, description: 'REGULAR, PDI or BOTH (default).' },
    { name: 'chargeTypes', description: 'Requisition types, comma separated: CUSTOMER (non-warranty), WARRANTY, GOODWILL, FREE (FOC). Omitted = all.', schema: { type: 'string' } },
    { name: 'billing', description: 'BILLED, UNBILLED or BOTH (default): whether the job has an active bill now.', schema: { type: 'string', enum: ['BILLED', 'UNBILLED', 'BOTH'] } },
    { name: 'partFlag', description: 'Purchase source: O original, A authorised source, F FOC, L local.', schema: { type: 'string', enum: ['O', 'A', 'F', 'L'] } },
    { name: 'partCategory', description: 'Price category code (e.g. O for oil).', schema: { type: 'string' } },
    { name: 'partNumber', description: 'Part number (exact).', schema: { type: 'string' } },
  ],
  example: {
    rows: [
      {
        groupKey: 'slip-uuid', returnNumber: 'RT-000012', returnDate: '2026-03-04T10:00:00.000Z', requisitionNumber: 'RQ-000045', jobNumber: 'JC-000123', registration: 'ABJ503GD', model: 'Rio',
        engineer: 'Example engineer', partNumber: '26300-35505', description: 'OIL FILTER', qtyIssued: 2, qtyReturned: 1, rate: 6200, amount: 6200, reason: 'Not required', chargeType: 'CUSTOMER', billed: false,
      },
    ],
    groups: [{ key: 'slip-uuid', label: 'RT-000012 · job JC-000123', count: 1, totals: { qtyReturned: 1, amount: 6200 } }],
    totals: { count: 1, qtyReturned: 1, amount: 6200 },
  },
  async run(db, scope, query) {
    const { start, end } = localDayRange(query.from, query.to, scope.timeZone);
    const billed = Prisma.sql`EXISTS (SELECT 1 FROM "Invoice" i WHERE i."jobCardId" = j."id" AND ${activeInvoiceSql})`;
    const billing = query.billing === 'BILLED' ? Prisma.sql` AND ${billed}` : query.billing === 'UNBILLED' ? Prisma.sql` AND NOT ${billed}` : Prisma.empty;
    const chargeType = Prisma.sql`COALESCE(r."chargeType", jcl."chargeType", 'CUSTOMER'::"ChargeType")`;
    const chargeTypes = query.chargeTypes?.length ? Prisma.sql` AND ${chargeType}::text IN (${Prisma.join(query.chargeTypes)})` : Prisma.empty;
    const parts = Prisma.sql`${query.partFlag ? Prisma.sql` AND sp."partFlag" = ${query.partFlag}` : Prisma.empty}${
      query.partCategory ? Prisma.sql` AND sp."priceCategoryCode" = ${query.partCategory}` : Prisma.empty
    }${query.partNumber ? Prisma.sql` AND UPPER(sp."partNumber") = UPPER(${query.partNumber})` : Prisma.empty}`;
    const rate = Prisma.sql`COALESCE(pr."rate", rl."rate", sp."retailRate"::numeric, 0)`;

    const result = await db.$queryRaw<ReturnRow[]>`
      SELECT pr."id" AS "returnLineId", rs."id" AS "returnSlipId", COALESCE(rs."returnNumber", CONCAT('Return ', LEFT(pr."id", 8))) AS "returnNumber",
        COALESCE(rs."returnDate", pr."returnedAt") AS "returnDate",
        r."id" AS "requisitionId", r."requisitionNumber", r."requisitionDate",
        j."id" AS "jobId", j."jobNumber", j."createdAt" AS "jobDate", v."registrationNumber" AS "registration",
        COALESCE(mdl."description", v."model", v."customModel") AS "model",
        NULLIF(TRIM(CONCAT(en."firstName", ' ', en."lastName")), '') AS "engineer",
        sp."partNumber", COALESCE(rl."description", sp."name") AS "description",
        COALESCE(rl."quantityIssued", pi."quantity")::float8 AS "qtyIssued", pr."quantity"::float8 AS "qtyReturned",
        ROUND(${rate}, 2)::float8 AS "rate", ROUND(COALESCE(pr."amount", pr."quantity" * ${rate}), 2)::float8 AS "amount",
        pr."reason", ${chargeType}::text AS "chargeType", ${billed} AS "billed"
      FROM "PartReturn" pr
      JOIN "PartIssuance" pi ON pi."id" = pr."partIssuanceId"
      JOIN "JobCard" j ON j."id" = pi."jobCardId"
      ${jobJoinsSql}
      JOIN "SparePart" sp ON sp."id" = pi."sparePartId"
      LEFT JOIN "PartReturnSlip" rs ON rs."id" = pr."returnSlipId"
      LEFT JOIN "PartRequisitionLine" rl ON rl."id" = pr."requisitionLineId"
      LEFT JOIN "PartRequisition" r ON r."id" = rl."requisitionId"
      LEFT JOIN "JobCardLine" jcl ON jcl."partIssuanceId" = pi."id"
      WHERE ${countedReturnSql}
        AND COALESCE(rs."returnDate", pr."returnedAt") >= ${start} AND COALESCE(rs."returnDate", pr."returnedAt") < ${end}
        ${jobFilterSql(scope, {}, { jobType: query.jobType })}${chargeTypes}${billing}${parts}
      ORDER BY "returnDate", "returnNumber", sp."partNumber"
      LIMIT ${MAX_REPORT_ROWS + 1}`;
    const { rows, truncated } = capRows(result);
    const spec = RETURN_GROUPS[query.basedOn];
    const ordered = [...rows].sort((a, b) => spec.label(a).localeCompare(spec.label(b), 'en', { numeric: true }) || a.returnDate.getTime() - b.returnDate.getTime());
    const grouped = groupRows(ordered, spec, ['qtyReturned', 'amount']);
    return {
      rows: grouped.rows,
      groups: grouped.groups,
      totals: { count: rows.length, ...sumFields(rows, ['qtyReturned', 'amount']) },
      summary: { billed: rows.filter((row) => row.billed).length, unbilled: rows.filter((row) => !row.billed).length },
      truncated,
    };
  },
});

// ── S8. List of major problems ───────────────────────────────────────────────

interface ProblemRow extends ReportRow {
  complaintId: string;
  codeId: string | null;
  code: string | null;
  codeDescription: string | null;
  serviceGroup: string | null;
  major: boolean;
  description: string;
  jobId: string;
  jobNumber: string;
  registration: string | null;
}

export const UNCODED_KEY = 'uncoded';

/** Defect-wise: one group per complaint code (free text under "Uncoded"); job-wise: one group per job. */
export function problemGroups(rows: readonly ProblemRow[], view: 'DEFECT' | 'JOB'): { rows: (ProblemRow & { groupKey: string })[]; groups: ReportGroup[] } {
  const keyOf = (row: ProblemRow) => (view === 'JOB' ? row.jobId : row.codeId ?? UNCODED_KEY);
  const labelOf = (row: ProblemRow) =>
    view === 'JOB'
      ? [row.jobNumber, row.registration].filter(Boolean).join(' · ')
      : row.codeId
        ? [`${row.code} · ${row.codeDescription}`, row.serviceGroup].filter(Boolean).join(' — ')
        : 'Uncoded (free text)';
  const grouped = groupRows([...rows], { key: keyOf, label: labelOf }, []);
  // A code's count is the number of jobs with it, not the number of complaint lines.
  const groups = grouped.groups.map((group) => {
    const jobs = new Set(grouped.rows.filter((row) => row.groupKey === group.key).map((row) => row.jobId)).size;
    return { ...group, totals: { jobs } };
  });
  return { rows: grouped.rows, groups };
}

const majorProblems = defineReport({
  slug: 'major-problems',
  title: 'List of major problems',
  width: 132,
  permission: PERMISSIONS.MAJOR_PROBLEMS_READ,
  summary:
    'Customer complaints on jobs opened in the period, defect-wise (per complaint code with its service group, free-text complaints as "Uncoded") or job-wise. "Major only" keeps codes flagged major.',
  period: 'range',
  query: rangeQuery(MIS_STD_FILTERS, {
    jobType: jobTypeParam.default('REGULAR'),
    defects: z.enum(['MAJOR', 'ALL']).default('ALL'),
    fromCode: z.string().trim().min(1).max(50).optional(),
    toCode: z.string().trim().min(1).max(50).optional(),
    view: z.enum(['DEFECT', 'JOB']).default('DEFECT'),
  }),
  filterKeys: MIS_STD_FILTERS,
  params: [
    jobTypeDoc,
    { name: 'defects', description: 'MAJOR (codes flagged major only) or ALL (default, includes uncoded free text).', schema: { type: 'string', enum: ['MAJOR', 'ALL'] } },
    { name: 'fromCode', description: 'First complaint code (inclusive). A code range leaves out uncoded complaints.', schema: { type: 'string' } },
    { name: 'toCode', description: 'Last complaint code (inclusive).', schema: { type: 'string' } },
    { name: 'view', description: 'DEFECT (default, per complaint code) or JOB (per job).', schema: { type: 'string', enum: ['DEFECT', 'JOB'] } },
  ],
  example: {
    rows: [{ groupKey: 'code-uuid', complaintId: 'uuid', code: 'EN01', codeDescription: 'ENGINE NOISE', serviceGroup: 'MAINTENANCE', major: true, description: 'Knocking at idle', jobNumber: 'JC-000123', registration: 'ABJ503GD', model: 'Rio', mileage: 42000, engineer: 'Example engineer' }],
    groups: [{ key: 'code-uuid', label: 'EN01 · ENGINE NOISE — MAINTENANCE', count: 1, totals: { jobs: 1 } }],
    totals: { count: 1, jobs: 1 },
  },
  async run(db, scope, query) {
    const { start, end } = localDayRange(query.from, query.to, scope.timeZone);
    const major = Prisma.sql`COALESCE((cc."attributes"->>'majorDefect')::boolean, false)`;
    const conditions = Prisma.sql`${query.defects === 'MAJOR' ? Prisma.sql` AND cc."id" IS NOT NULL AND ${major}` : Prisma.empty}${
      query.fromCode ? Prisma.sql` AND cc."code" >= ${query.fromCode}` : Prisma.empty
    }${query.toCode ? Prisma.sql` AND cc."code" <= ${query.toCode}` : Prisma.empty}`;
    const result = await db.$queryRaw<ProblemRow[]>`
      SELECT jc."id" AS "complaintId", cc."id" AS "codeId", cc."code", cc."description" AS "codeDescription", sg."description" AS "serviceGroup",
        ${major} AS "major", COALESCE(NULLIF(jc."description", ''), jc."defectCode", '') AS "description",
        ${jobColumnsSql}
      FROM "JobComplaint" jc
      JOIN "JobCard" j ON j."id" = jc."jobCardId"
      ${jobJoinsSql}
      LEFT JOIN "WorkshopMaster" cc ON cc."id" = jc."complaintCodeId"
      LEFT JOIN "WorkshopMaster" sg ON sg."id" = cc."parentId"
      WHERE j."createdAt" >= ${start} AND j."createdAt" < ${end}${jobFilterSql(scope, query, { jobType: query.jobType })}${conditions}
      ORDER BY cc."code" NULLS LAST, j."createdAt", j."jobNumber"
      LIMIT ${MAX_REPORT_ROWS + 1}`;
    const { rows, truncated } = capRows(result);
    const grouped = problemGroups(rows, query.view);
    const jobs = new Set(rows.map((row) => row.jobId)).size;
    return {
      rows: grouped.rows,
      groups: grouped.groups,
      totals: { count: rows.length, jobs },
      summary: { complaints: rows.length, jobs, codes: grouped.groups.filter((group) => group.key !== UNCODED_KEY).length, uncoded: rows.filter((row) => !row.codeId).length },
      truncated,
    };
  },
});

export const MIS_WORKSHOP_REPORTS = [groupProductivity, engineerPerformance, engineerPartConsumption, requisitionReturnRegister, majorProblems];

import { z } from 'zod';
import { PERMISSIONS } from '../../../shared/constants/roles';
import { localToday } from '../core/dates';
import { branchParam, flag, modeParam, rangeQuery } from '../core/filters';
import { defineReport } from '../core/types';
import { buildJobAnalysis, buildMonthly, buildProductMix } from './mis.builders';
import { loadMisJobs } from './mis.data';
import { bucketRange, monthBuckets, MONTH_PATTERN, monthSpan, previousYearMonths } from './mis.logic';
import { jobTypeParam, MIS_STD_FILTERS } from './mis.params';

const monthParam = z.string().regex(MONTH_PATTERN, 'Use the format YYYY-MM');
const dayParam = (fallback: number) => z.coerce.number().int().min(1).max(31).default(fallback);

// ── S1. Monthly information report ───────────────────────────────────────────

const monthlyQuery = z
  .object({
    branchId: branchParam,
    mode: modeParam,
    fromMonth: monthParam.optional(),
    toMonth: monthParam.optional(),
    previousYear: flag,
    fromDay: dayParam(1),
    toDay: dayParam(31),
    annexure: flag,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.fromDay > value.toDay) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['toDay'], message: 'The last day must be on or after the first day' });
    if (value.previousYear) return;
    if (!value.fromMonth || !value.toMonth) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fromMonth'], message: 'Choose the from and to months, or all months of the previous year' });
      return;
    }
    const months = monthSpan(value.fromMonth, value.toMonth).length;
    if (months === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['toMonth'], message: 'The to month must be on or after the from month' });
    else if (months > 12) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['toMonth'], message: 'Choose at most 12 months' });
  });

const misMonthly = defineReport({
  slug: 'mis-monthly',
  title: 'Monthly information report',
  width: 132,
  permission: PERMISSIONS.MIS_MONTHLY_READ,
  summary:
    'One column per month: vehicles, labour, spares, oil and service charge by service category for jobs delivered in each month (optionally only days fromDay–toDay of each month). The annexure breaks each category down by service type.',
  period: 'none',
  query: monthlyQuery,
  filterKeys: [],
  params: [
    { name: 'fromMonth', description: 'First month (YYYY-MM). Required unless previousYear=true.', schema: { type: 'string', example: '2026-01' } },
    { name: 'toMonth', description: 'Last month (YYYY-MM), at most 12 months after fromMonth.', schema: { type: 'string', example: '2026-06' } },
    { name: 'previousYear', description: 'true: the 12 months of the previous calendar year (ignores fromMonth/toMonth).', schema: { type: 'boolean' } },
    { name: 'fromDay', description: 'Count only from this day of each month (1–31, default 1).', schema: { type: 'integer', minimum: 1, maximum: 31 } },
    { name: 'toDay', description: 'Count only up to this day of each month (1–31, default 31; clamped to the month length).', schema: { type: 'integer', minimum: 1, maximum: 31 } },
    { name: 'annexure', description: 'true: break each category down by service type.', schema: { type: 'boolean' } },
  ],
  example: {
    rows: [
      { id: 'LABOUR:FREE', groupKey: 'LABOUR', label: '1) Free services', level: 0, kind: 'line', '2026-01': 120000, '2026-02': 98000, total: 218000 },
      { id: 'LABOUR:net', groupKey: 'LABOUR', label: 'Net labour', level: 0, kind: 'subtotal', '2026-01': 1450000, '2026-02': 1210000, total: 2660000 },
    ],
    groups: [{ key: 'LABOUR', label: 'A) Labour', count: 14, totals: {} }],
    columns: [
      { key: '2026-01', label: 'Jan 2026', format: 'money' },
      { key: '2026-02', label: 'Feb 2026', format: 'money' },
      { key: 'total', label: 'Total', format: 'money' },
    ],
    totals: { count: 312 },
  },
  async run(db, scope, query) {
    const months = query.previousYear ? previousYearMonths(localToday(scope.timeZone)) : monthSpan(query.fromMonth!, query.toMonth!);
    const buckets = monthBuckets(months, query.fromDay, query.toDay);
    const range = bucketRange(buckets);
    const { jobs, truncated } = range ? await loadMisJobs(db, scope, { ...range, basis: 'delivered', jobType: 'BOTH' }) : { jobs: [], truncated: false };
    const result = buildMonthly(jobs, buckets, { annexure: query.annexure, timeZone: scope.timeZone });
    const total = (id: string) => Number(result.rows.find((row) => row.id === id)?.total ?? 0);
    return {
      rows: result.rows,
      groups: result.groups,
      columns: result.columns,
      totals: { count: result.counted },
      summary: {
        months: buckets.length,
        vehicles: total('VEHICLES:total'),
        labour: total('LABOUR:total'),
        spares: total('SPARES:total'),
        oil: total('OIL:total'),
        serviceCharge: total('SERVICE_CHARGE:total'),
      },
      truncated,
    };
  },
});

// ── S2. Business product mix ─────────────────────────────────────────────────

const productMix = defineReport({
  slug: 'business-product-mix',
  title: 'Business product mix',
  width: 132,
  permission: PERMISSIONS.BUSINESS_PRODUCT_MIX_READ,
  summary:
    'Jobs delivered in the period per service type (or per model, with vehicles per mileage band), grouped by service category: vehicles serviced, spares, oil, labour (net of discount) and service charge with % shares and per-vehicle values.',
  period: 'range',
  query: rangeQuery(MIS_STD_FILTERS, { jobType: jobTypeParam.default('BOTH'), by: z.enum(['serviceType', 'model']).default('serviceType') }),
  filterKeys: MIS_STD_FILTERS,
  params: [
    { name: 'jobType', description: 'REGULAR, PDI or BOTH (default).', schema: { type: 'string', enum: ['REGULAR', 'PDI', 'BOTH'] } },
    { name: 'by', description: 'serviceType (default) or model. Both give the same totals.', schema: { type: 'string', enum: ['serviceType', 'model'] } },
  ],
  example: {
    rows: [
      {
        id: 'FREE:st-uuid', groupKey: 'FREE', label: '1F · FIRST SERVICE', vehicles: 40, spares: 120000, sparesPct: 60, oil: 80000, oilPct: 55.5, labour: 0, labourPct: 0,
        serviceCharge: 0, serviceChargePct: 0, sparesPerVehicle: 3000, oilPerVehicle: 2000, labourPerVehicle: 0, serviceChargePerVehicle: 0,
      },
    ],
    groups: [{ key: 'FREE', label: 'Free services', count: 3, totals: { vehicles: 70, spares: 200000, sparesPct: 12.5 } }],
    totals: { count: 560, vehicles: 560, spares: 1600000, sparesPct: 100 },
    columns: [],
  },
  async run(db, scope, query) {
    const [{ jobs, truncated }, bands] = await Promise.all([
      loadMisJobs(db, scope, { from: query.from, to: query.to, basis: 'delivered', filters: query, jobType: query.jobType }),
      query.by === 'model'
        ? db.mileageBand.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { fromKm: 'asc' }], select: { id: true, label: true, fromKm: true, toKm: true } })
        : Promise.resolve([]),
    ]);
    const mix = buildProductMix(jobs, { by: query.by, bands });
    return {
      ...mix,
      summary: { vehicles: mix.totals.vehicles, labour: mix.totals.labour, spares: mix.totals.spares, oil: mix.totals.oil, serviceCharge: mix.totals.serviceCharge },
      truncated,
    };
  },
});

// ── S3. Analysis of jobs ─────────────────────────────────────────────────────

const jobAnalysis = defineReport({
  slug: 'job-analysis',
  title: 'Analysis of jobs',
  width: 132,
  permission: PERMISSIONS.JOB_ANALYSIS_READ,
  summary:
    'Jobs delivered in the period as a grid of model (or variant) × service type, with total, repeat and accidental columns, then the same grid as % of each row total. Only service types with a job get a column.',
  period: 'range',
  query: rangeQuery([], { by: z.enum(['model', 'variant']).default('model') }),
  filterKeys: [],
  params: [{ name: 'by', description: 'model (default) or variant.', schema: { type: 'string', enum: ['model', 'variant'] } }],
  example: {
    rows: [
      { id: 'count:model-uuid', groupKey: 'count', grid: 'count', label: 'Rio', kind: 'line', 'st:st-uuid': 12, total: 30, repeat: 1, accidental: 2 },
      { id: 'percent:model-uuid', groupKey: 'percent', grid: 'percent', label: 'Rio', kind: 'line', 'st:st-uuid': 40, total: 100, repeat: 3.33, accidental: 6.67 },
    ],
    groups: [
      { key: 'count', label: 'Number of jobs', count: 1, totals: {} },
      { key: 'percent', label: 'Share of the row total (%)', count: 1, totals: {} },
    ],
    columns: [{ key: 'st:st-uuid', label: '1F', format: 'number' }],
    totals: { count: 30, repeat: 1, accidental: 2 },
  },
  async run(db, scope, query) {
    const { jobs, truncated } = await loadMisJobs(db, scope, { from: query.from, to: query.to, basis: 'delivered', jobType: 'BOTH' });
    const analysis = buildJobAnalysis(jobs, query.by);
    return { ...analysis, summary: { jobs: analysis.totals.count, repeat: analysis.totals.repeat, accidental: analysis.totals.accidental }, truncated };
  },
});

export const MIS_SUMMARY_REPORTS = [misMonthly, productMix, jobAnalysis];

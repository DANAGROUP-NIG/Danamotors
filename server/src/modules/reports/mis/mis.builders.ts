import { Prisma } from '@prisma/client';
import type { ServiceCategory } from '../../workshop/master-kinds';
import { localDateOf } from '../core/dates';
import type { ReportColumnDef, ReportGroup, ReportRow } from '../core/types';
import type { MisJob } from './mis.data';
import { bucketOf, CATEGORY_LABELS, CATEGORY_ORDER, percentOf, percentShares, perUnit, type MonthBucket } from './mis.logic';

/**
 * Builders for the MIS summaries (S1–S3) from the shared job list, so the monthly information
 * report, business product mix and analysis of jobs add up to the same totals.
 */

/** A row of a matrix report: a label, an indent level and how it is emphasised. */
export interface MatrixRow extends ReportRow {
  id: string;
  groupKey: string;
  label: string;
  level: 0 | 1 | 2;
  kind: 'line' | 'heading' | 'subtotal' | 'total' | 'memo';
}

class Accumulator {
  private readonly values = new Map<string, Prisma.Decimal>();

  add(key: string, value: number) {
    if (!value) return;
    this.values.set(key, (this.values.get(key) ?? new Prisma.Decimal(0)).plus(value));
  }

  get(key: string): number {
    return (this.values.get(key) ?? new Prisma.Decimal(0)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
  }
}

const serviceTypeKey = (job: Pick<MisJob, 'serviceTypeId'>) => job.serviceTypeId ?? 'none';
const serviceTypeLabel = (job: Pick<MisJob, 'serviceTypeCode' | 'serviceType'>) => (job.serviceTypeCode ? `${job.serviceTypeCode} · ${job.serviceType}` : job.serviceType);

// ── S1. Monthly information report ─────────────────────────────────────────────

type Metric = 'vehicles' | 'labour' | 'labourDiscount' | 'spares' | 'sparesDiscount' | 'oil' | 'oilDiscount' | 'serviceCharge' | 'bodyLabour';

const METRIC_VALUE: Record<Metric, (job: MisJob) => number> = {
  vehicles: () => 1,
  labour: (job) => job.labourGross,
  labourDiscount: (job) => job.labourDiscount,
  spares: (job) => job.spares,
  sparesDiscount: (job) => job.sparesDiscount,
  oil: (job) => job.oil,
  oilDiscount: (job) => job.oilDiscount,
  serviceCharge: (job) => job.serviceCharge,
  bodyLabour: (job) => job.bodyLabour,
};

export const MONTHLY_SECTIONS = [
  { key: 'VEHICLES', label: 'Vehicles' },
  { key: 'LABOUR', label: 'A) Labour' },
  { key: 'SPARES', label: 'B) Spares' },
  { key: 'OIL', label: 'C) Oil and lubricants' },
  { key: 'SERVICE_CHARGE', label: 'D) Service charge' },
] as const;

export interface MonthlyResult {
  rows: MatrixRow[];
  groups: ReportGroup[];
  columns: ReportColumnDef[];
  counted: number;
}

/**
 * Months as columns (plus a total), rows by service category for jobs delivered in each month's
 * day range. With the annexure, each category is followed by its service types.
 */
export function buildMonthly(jobs: readonly MisJob[], buckets: readonly MonthBucket[], options: { annexure: boolean; timeZone: string }): MonthlyResult {
  const acc = new Accumulator();
  const serviceTypes = new Map<string, { label: string; category: ServiceCategory; code: string }>();
  let counted = 0;

  for (const job of jobs) {
    if (!job.deliveredAt) continue;
    const month = bucketOf(localDateOf(job.deliveredAt, options.timeZone), buckets);
    if (!month) continue;
    counted += 1;
    const type = serviceTypeKey(job);
    serviceTypes.set(type, { label: serviceTypeLabel(job), category: job.category, code: job.serviceTypeCode ?? '' });
    for (const metric of Object.keys(METRIC_VALUE) as Metric[]) {
      const value = METRIC_VALUE[metric](job);
      for (const period of [month, 'total']) {
        acc.add(`${metric}|cat:${job.category}|${period}`, value);
        acc.add(`${metric}|st:${type}|${period}`, value);
      }
    }
  }

  const periods = [...buckets.map((bucket) => bucket.key), 'total'];
  const sum = (metric: Metric, categories: readonly ServiceCategory[], period: string) =>
    categories.reduce((total, category) => total.plus(acc.get(`${metric}|cat:${category}|${period}`)), new Prisma.Decimal(0)).toDecimalPlaces(2).toNumber();
  const minus = (a: number, b: number) => new Prisma.Decimal(a).minus(b).toDecimalPlaces(2).toNumber();
  const plus = (a: number, b: number) => new Prisma.Decimal(a).plus(b).toDecimalPlaces(2).toNumber();
  const valuesOf = (compute: (period: string) => number) => Object.fromEntries(periods.map((period) => [period, compute(period)]));

  const rows: MatrixRow[] = [];
  const push = (groupKey: string, id: string, label: string, level: MatrixRow['level'], kind: MatrixRow['kind'], compute: (period: string) => number) =>
    rows.push({ id: `${groupKey}:${id}`, groupKey, label, level, kind, ...valuesOf(compute) });
  const annexureFor = (groupKey: string, metric: Metric, category: ServiceCategory, level: MatrixRow['level']) => {
    if (!options.annexure) return;
    const types = Array.from(serviceTypes.entries())
      .filter(([, type]) => type.category === category)
      .sort(([, a], [, b]) => a.code.localeCompare(b.code));
    for (const [type, meta] of types) push(groupKey, `${metric}:st:${type}`, meta.label, level, 'line', (period) => acc.get(`${metric}|st:${type}|${period}`));
  };

  // Vehicles: every category, then the total.
  for (const category of CATEGORY_ORDER) {
    push('VEHICLES', category, CATEGORY_LABELS[category], 0, 'line', (period) => acc.get(`vehicles|cat:${category}|${period}`));
    annexureFor('VEHICLES', 'vehicles', category, 1);
  }
  push('VEHICLES', 'total', 'Total vehicles', 0, 'total', (period) => sum('vehicles', CATEGORY_ORDER, period));

  // Labour, spares and oil: the legacy layout, with PDI after the net figure.
  const workshop: ServiceCategory[] = ['FREE', 'PAID', 'RUNNING_REPAIR', 'OTHER', 'ACCIDENTAL'];
  const amountSection = (groupKey: string, metric: 'labour' | 'spares' | 'oil', discountMetric: 'labourDiscount' | 'sparesDiscount' | 'oilDiscount', noun: string) => {
    const line = (category: ServiceCategory, label: string, level: MatrixRow['level']) => {
      push(groupKey, category, label, level, 'line', (period) => acc.get(`${metric}|cat:${category}|${period}`));
      annexureFor(groupKey, metric, category, (level + 1) as MatrixRow['level']);
    };
    line('FREE', '1) Free services', 0);
    line('PAID', '2) Paid service', 0);
    push(groupKey, 'running', '3) Running jobs', 0, 'heading', (period) => sum(metric, ['RUNNING_REPAIR', 'OTHER'], period));
    line('RUNNING_REPAIR', 'a. Running repair', 1);
    line('OTHER', 'b. Other services', 1);
    line('ACCIDENTAL', '4) Accidental', 0);
    const gross = (period: string) => sum(metric, workshop, period);
    const discount = (period: string) => sum(discountMetric, workshop, period);
    const net = (period: string) => minus(gross(period), discount(period));
    const pdi = (period: string) => minus(acc.get(`${metric}|cat:PDI|${period}`), acc.get(`${discountMetric}|cat:PDI|${period}`));
    push(groupKey, 'gross', `Gross ${noun}`, 0, 'subtotal', gross);
    push(groupKey, 'discount', 'Less discount', 0, 'line', discount);
    push(groupKey, 'net', `Net ${noun}`, 0, 'subtotal', net);
    push(groupKey, 'pdi', 'PDI', 0, 'line', pdi);
    annexureFor(groupKey, metric, 'PDI', 1);
    push(groupKey, 'total', `Total ${noun}`, 0, 'total', (period) => plus(net(period), pdi(period)));
  };
  amountSection('LABOUR', 'labour', 'labourDiscount', 'labour');
  push('LABOUR', 'body', 'Body repair labour (included above)', 0, 'memo', (period) => sum('bodyLabour', CATEGORY_ORDER, period));
  amountSection('SPARES', 'spares', 'sparesDiscount', 'spares');
  amountSection('OIL', 'oil', 'oilDiscount', 'oil and lubricants');

  for (const category of CATEGORY_ORDER) {
    push('SERVICE_CHARGE', category, CATEGORY_LABELS[category], 0, 'line', (period) => acc.get(`serviceCharge|cat:${category}|${period}`));
    annexureFor('SERVICE_CHARGE', 'serviceCharge', category, 1);
  }
  push('SERVICE_CHARGE', 'total', 'Total service charge', 0, 'total', (period) => sum('serviceCharge', CATEGORY_ORDER, period));

  return {
    rows,
    groups: MONTHLY_SECTIONS.map((section) => ({ key: section.key, label: section.label, count: rows.filter((row) => row.groupKey === section.key).length, totals: {} })),
    columns: [
      ...buckets.map((bucket) => ({ key: bucket.key, label: bucket.label, format: 'money' as const })),
      { key: 'total', label: 'Total', format: 'money' as const },
    ],
    counted,
  };
}

// ── S2. Business product mix ───────────────────────────────────────────────────

export interface MileageBandDef {
  id: string;
  label: string;
  fromKm: number;
  toKm: number | null;
}

const MIX_AMOUNTS = ['spares', 'oil', 'labour', 'serviceCharge'] as const;
type MixAmount = (typeof MIX_AMOUNTS)[number];

interface MixLine {
  key: string;
  label: string;
  category: ServiceCategory;
  vehicles: number;
  amounts: Record<MixAmount, number>;
  bands: Record<string, number>;
}

/** Amounts with their % of `shares` and per-vehicle values. */
function mixFields(vehicles: number, amounts: Record<MixAmount, number>, shares: Record<MixAmount, number>, bands: Record<string, number>) {
  const fields: Record<string, number> = { vehicles };
  for (const amount of MIX_AMOUNTS) {
    fields[amount] = amounts[amount];
    fields[`${amount}Pct`] = shares[amount];
    fields[`${amount}PerVehicle`] = perUnit(amounts[amount], vehicles);
  }
  for (const [band, count] of Object.entries(bands)) fields[`band:${band}`] = count;
  return fields;
}

function sumLines(lines: readonly MixLine[], bandIds: readonly string[]) {
  const amounts = Object.fromEntries(
    MIX_AMOUNTS.map((amount) => [amount, lines.reduce((total, line) => total.plus(line.amounts[amount]), new Prisma.Decimal(0)).toDecimalPlaces(2).toNumber()]),
  ) as Record<MixAmount, number>;
  const bands = Object.fromEntries(bandIds.map((band) => [band, lines.reduce((total, line) => total + (line.bands[band] ?? 0), 0)]));
  return { vehicles: lines.reduce((total, line) => total + line.vehicles, 0), amounts, bands };
}

function sharesOf(lines: readonly { amounts: Record<MixAmount, number> }[]): Record<MixAmount, number>[] {
  const byAmount = Object.fromEntries(MIX_AMOUNTS.map((amount) => [amount, percentShares(lines.map((line) => line.amounts[amount]))])) as Record<MixAmount, number[]>;
  return lines.map((_, index) => Object.fromEntries(MIX_AMOUNTS.map((amount) => [amount, byAmount[amount][index]])) as Record<MixAmount, number>);
}

export function bandOf(mileage: number | null, bands: readonly MileageBandDef[]): string | null {
  if (mileage === null) return null;
  return bands.find((band) => mileage >= band.fromKm && (band.toKm === null || mileage <= band.toKm))?.id ?? null;
}

/**
 * Per service type (or model), grouped by service category. Row % are shares of the row's
 * category, so they add up to 100 in each category; category subtotals are shares of the whole.
 * Labour is net of discount; spares and oil are before discount.
 */
export function buildProductMix(jobs: readonly MisJob[], options: { by: 'serviceType' | 'model'; bands: readonly MileageBandDef[] }) {
  const bandIds = options.by === 'model' ? options.bands.map((band) => band.id) : [];
  const lines = new Map<string, MixLine>();
  for (const job of jobs) {
    const id = options.by === 'model' ? job.modelId ?? 'none' : serviceTypeKey(job);
    const key = `${job.category}:${id}`;
    const line = lines.get(key) ?? {
      key,
      label: options.by === 'model' ? job.model ?? 'Model not recorded' : serviceTypeLabel(job),
      category: job.category,
      vehicles: 0,
      amounts: { spares: 0, oil: 0, labour: 0, serviceCharge: 0 },
      bands: Object.fromEntries(bandIds.map((band) => [band, 0])),
    };
    line.vehicles += 1;
    line.amounts = {
      spares: new Prisma.Decimal(line.amounts.spares).plus(job.spares).toNumber(),
      oil: new Prisma.Decimal(line.amounts.oil).plus(job.oil).toNumber(),
      labour: new Prisma.Decimal(line.amounts.labour).plus(job.labourNet).toNumber(),
      serviceCharge: new Prisma.Decimal(line.amounts.serviceCharge).plus(job.serviceCharge).toNumber(),
    };
    const band = options.by === 'model' ? bandOf(job.mileage, options.bands) : null;
    if (band) line.bands[band] += 1;
    lines.set(key, line);
  }

  const categories = CATEGORY_ORDER.filter((category) => Array.from(lines.values()).some((line) => line.category === category));
  const categoryTotals = categories.map((category) => sumLines(Array.from(lines.values()).filter((line) => line.category === category), bandIds));
  const categoryShares = sharesOf(categoryTotals);
  const overall = sumLines(Array.from(lines.values()), bandIds);
  const full = Object.fromEntries(MIX_AMOUNTS.map((amount) => [amount, overall.amounts[amount] ? 100 : 0])) as Record<MixAmount, number>;

  const rows: ReportRow[] = [];
  const groups: ReportGroup[] = [];
  categories.forEach((category, index) => {
    const members = Array.from(lines.values())
      .filter((line) => line.category === category)
      .sort((a, b) => a.label.localeCompare(b.label));
    const shares = sharesOf(members);
    members.forEach((line, row) => rows.push({ id: line.key, groupKey: category, label: line.label, ...mixFields(line.vehicles, line.amounts, shares[row], line.bands) }));
    const total = categoryTotals[index];
    groups.push({ key: category, label: CATEGORY_LABELS[category], count: members.length, totals: mixFields(total.vehicles, total.amounts, categoryShares[index], total.bands) });
  });

  const totals: Record<string, number> = { ...mixFields(overall.vehicles, overall.amounts, full, overall.bands), count: overall.vehicles };
  return {
    rows,
    groups,
    totals,
    columns: options.bands.filter((band) => bandIds.includes(band.id)).map((band) => ({ key: `band:${band.id}`, label: band.label, format: 'integer' as const })),
  };
}

// ── S3. Analysis of jobs ───────────────────────────────────────────────────────

/**
 * Model (or variant) × service type: job counts with total, repeat and accidental columns, then
 * the same grid as % of each row's total. Only service types with a job get a column.
 */
export function buildJobAnalysis(jobs: readonly MisJob[], by: 'model' | 'variant') {
  const types = new Map<string, { label: string; category: ServiceCategory; code: string }>();
  const grid = new Map<string, { label: string; counts: Record<string, number>; total: number; repeat: number; accidental: number }>();
  for (const job of jobs) {
    const type = serviceTypeKey(job);
    types.set(type, { label: job.serviceTypeCode ?? job.serviceType, category: job.category, code: job.serviceTypeCode ?? '' });
    const key = by === 'model' ? job.modelId ?? 'none' : job.variantId ?? 'none';
    const label = by === 'model' ? job.model ?? 'Model not recorded' : [job.model, job.variant].filter(Boolean).join(' · ') || 'Variant not recorded';
    const row = grid.get(key) ?? { label, counts: {}, total: 0, repeat: 0, accidental: 0 };
    row.counts[type] = (row.counts[type] ?? 0) + 1;
    row.total += 1;
    if (job.isRepeat) row.repeat += 1;
    if (job.category === 'ACCIDENTAL') row.accidental += 1;
    grid.set(key, row);
  }

  const typeKeys = Array.from(types.keys()).sort((a, b) => {
    const ta = types.get(a)!;
    const tb = types.get(b)!;
    return CATEGORY_ORDER.indexOf(ta.category) - CATEGORY_ORDER.indexOf(tb.category) || ta.code.localeCompare(tb.code);
  });
  const entries = Array.from(grid.entries()).sort(([, a], [, b]) => a.label.localeCompare(b.label));
  const totalRow = { label: 'Total', counts: {} as Record<string, number>, total: 0, repeat: 0, accidental: 0 };
  for (const [, row] of entries) {
    for (const type of typeKeys) totalRow.counts[type] = (totalRow.counts[type] ?? 0) + (row.counts[type] ?? 0);
    totalRow.total += row.total;
    totalRow.repeat += row.repeat;
    totalRow.accidental += row.accidental;
  }

  const countFields = (row: typeof totalRow) => ({
    ...Object.fromEntries(typeKeys.map((type) => [`st:${type}`, row.counts[type] ?? 0])),
    total: row.total,
    repeat: row.repeat,
    accidental: row.accidental,
  });
  const percentFields = (row: typeof totalRow) => ({
    ...Object.fromEntries(typeKeys.map((type) => [`st:${type}`, percentOf(row.counts[type] ?? 0, row.total)])),
    total: row.total ? 100 : 0,
    repeat: percentOf(row.repeat, row.total),
    accidental: percentOf(row.accidental, row.total),
  });

  const rows: ReportRow[] = [
    ...entries.map(([key, row]) => ({ id: `count:${key}`, groupKey: 'count', grid: 'count', label: row.label, kind: 'line', ...countFields(row) })),
    { id: 'count:total', groupKey: 'count', grid: 'count', label: 'Total', kind: 'total', ...countFields(totalRow) },
    ...entries.map(([key, row]) => ({ id: `percent:${key}`, groupKey: 'percent', grid: 'percent', label: row.label, kind: 'line', ...percentFields(row) })),
    { id: 'percent:total', groupKey: 'percent', grid: 'percent', label: 'Total', kind: 'total', ...percentFields(totalRow) },
  ];
  return {
    rows,
    groups: [
      { key: 'count', label: 'Number of jobs', count: entries.length, totals: {} },
      { key: 'percent', label: 'Share of the row total (%)', count: entries.length, totals: {} },
    ],
    columns: [
      ...typeKeys.map((type) => ({ key: `st:${type}`, label: types.get(type)!.label, format: 'number' as const })),
      { key: 'total', label: 'Total', format: 'number' as const },
      { key: 'repeat', label: 'Repeat', format: 'number' as const },
      { key: 'accidental', label: 'Accidental', format: 'number' as const },
    ],
    totals: { count: totalRow.total, repeat: totalRow.repeat, accidental: totalRow.accidental },
  };
}

import { defaultServiceCategory } from '../../workshop/service-type.defaults';
import { buildJobAnalysis, buildMonthly, buildProductMix } from './mis.builders';
import type { MisJob } from './mis.data';
import { mergeFacts, mirLines, outstandingBands, type MirFacts } from './mis-management.report';
import { consumptionFields, engineerRatios, problemGroups, productivityFor, UNCODED_KEY } from './mis-workshop.reports';
import {
  averageKmBetween,
  bucketOf,
  categoryOf,
  countedVisits,
  dayMonthKey,
  dayMonthPosition,
  inDayMonthRange,
  isValidDayMonth,
  monthBuckets,
  monthSpan,
  percentShares,
  perUnit,
  previousYearMonths,
  skippedFreeServices,
  splitDiscount,
  type FreeServiceRule,
} from './mis.logic';

const TZ = 'Africa/Lagos';
let sequence = 0;

/** A delivered job with sensible defaults; override what a test is about. */
function job(overrides: Partial<MisJob> = {}): MisJob {
  sequence += 1;
  const base: MisJob = {
    jobId: `job-${sequence}`,
    jobNumber: `JC-${String(sequence).padStart(4, '0')}`,
    jobDate: new Date('2026-01-05T09:00:00Z'),
    branchId: 'branch-a',
    branchName: 'Abuja',
    promisedAt: new Date('2026-01-05T16:00:00Z'),
    billedAt: new Date('2026-01-05T14:00:00Z'),
    deliveredAt: new Date('2026-01-05T15:00:00Z'),
    registration: 'ABJ503GD',
    vin: 'VIN',
    customer: 'Customer',
    modelId: 'rio',
    model: 'Rio',
    variantId: 'rio-ex',
    variant: 'Rio EX',
    serviceTypeId: 'st-rg',
    serviceTypeCode: 'RG',
    serviceType: 'PAID SERVICE',
    category: 'PAID',
    engineerId: 'eng-1',
    engineer: 'Engineer One',
    bayId: 'bay-1',
    bay: 'Bay 1',
    mileage: 12000,
    isRepeat: false,
    warranty: false,
    labourGross: 1000,
    labourDiscount: 0,
    labourNet: 1000,
    labourHours: 1,
    bodyLabour: 0,
    spares: 500,
    accessories: 0,
    oil: 200,
    sparesDiscount: 0,
    oilDiscount: 0,
    serviceCharge: 100,
    netValue: 1800,
  };
  const merged = { ...base, ...overrides };
  // Keep gross, discount and net consistent unless a test sets them all.
  if (overrides.labourNet !== undefined && overrides.labourGross === undefined) merged.labourGross = overrides.labourNet + merged.labourDiscount;
  if (overrides.labourNet === undefined) merged.labourNet = merged.labourGross - merged.labourDiscount;
  return merged;
}

const free = (overrides: Partial<MisJob> = {}) =>
  job({ serviceTypeId: 'st-1f', serviceTypeCode: '1F', serviceType: 'FIRST SERVICE', category: 'FREE', ...overrides });
const running = (overrides: Partial<MisJob> = {}) =>
  job({ serviceTypeId: 'st-rr', serviceTypeCode: 'RR', serviceType: 'RUNNING REPAIR', category: 'RUNNING_REPAIR', ...overrides });
const accidental = (overrides: Partial<MisJob> = {}) =>
  job({ serviceTypeId: 'st-ac', serviceTypeCode: 'AC', serviceType: 'ACCIDENTAL REPAIR', category: 'ACCIDENTAL', ...overrides });
const pdi = (overrides: Partial<MisJob> = {}) => job({ serviceTypeId: 'st-pd', serviceTypeCode: 'PD', serviceType: 'PDI SERVICE', category: 'PDI', ...overrides });

describe('service categories', () => {
  it('backfills legacy service types following the vehicle history card', () => {
    expect(['1F', '2F', '3F', 'DI', 'P2'].map((code) => defaultServiceCategory(code))).toEqual(['FREE', 'FREE', 'FREE', 'FREE', 'FREE']);
    expect(['RG', 'SC', 'KS', '1P', '4P', '10K', '20'].map((code) => defaultServiceCategory(code))).toEqual(Array(7).fill('PAID'));
    expect(defaultServiceCategory('RR')).toBe('RUNNING_REPAIR');
    expect(defaultServiceCategory('AC')).toBe('ACCIDENTAL');
    expect(defaultServiceCategory('PD')).toBe('PDI');
    expect(defaultServiceCategory('XX', false, true)).toBe('PDI');
    expect(['RW', 'RJ', 'CN', 'IJ'].map((code) => defaultServiceCategory(code))).toEqual(Array(4).fill('OTHER'));
  });

  it('falls back to the master flags when the category is blank or unknown', () => {
    expect(categoryOf('paid')).toBe('PAID');
    expect(categoryOf(null, true)).toBe('PDI');
    expect(categoryOf('legacy text', false, true)).toBe('FREE');
    expect(categoryOf(undefined)).toBe('OTHER');
  });
});

describe('money helpers', () => {
  it('gives shares that add up to exactly 100', () => {
    const shares = percentShares([1, 1, 1]);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
    expect(shares).toEqual([33.34, 33.33, 33.33]);
    expect(percentShares([0, 0])).toEqual([0, 0]);
  });

  it('divides per vehicle and splits a discount in proportion', () => {
    expect(perUnit(1000, 3)).toBe(333.33);
    expect(perUnit(1000, 0)).toBe(0);
    expect(splitDiscount(100, 300, 100)).toEqual([75, 25]);
    expect(splitDiscount(10, 1, 2)).toEqual([3.33, 6.67]);
    expect(splitDiscount(10, 0, 0)).toEqual([0, 0]);
  });
});

describe('months and day ranges', () => {
  it('spans months across a year end and gives the previous year', () => {
    expect(monthSpan('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(monthSpan('2026-03', '2026-01')).toEqual([]);
    const previous = previousYearMonths('2026-11-03');
    expect(previous).toHaveLength(12);
    expect(previous[0]).toBe('2025-01');
    expect(previous[11]).toBe('2025-12');
  });

  it('limits every month to the day range, clamped to the month length', () => {
    const buckets = monthBuckets(['2026-01', '2026-02'], 10, 31);
    expect(buckets[0]).toMatchObject({ from: '2026-01-10', to: '2026-01-31', label: 'Jan 2026' });
    expect(buckets[1]).toMatchObject({ from: '2026-02-10', to: '2026-02-28' });
    expect(monthBuckets(['2026-02'], 30, 31)[0]).toMatchObject({ from: null, to: null });
    expect(bucketOf('2026-01-09', buckets)).toBeNull();
    expect(bucketOf('2026-02-15', buckets)).toBe('2026-02');
  });
});

describe('S1 monthly information report', () => {
  const buckets = monthBuckets(['2026-01', '2026-02'], 1, 15);
  const jobs = [
    free({ deliveredAt: new Date('2026-01-03T10:00:00Z'), labourGross: 0, labourNet: 0, spares: 300, oil: 100 }),
    job({ deliveredAt: new Date('2026-01-04T10:00:00Z'), labourGross: 2000, labourDiscount: 200, labourNet: 1800 }),
    running({ deliveredAt: new Date('2026-02-02T10:00:00Z'), labourGross: 1500, labourNet: 1500, bodyLabour: 500 }),
    accidental({ deliveredAt: new Date('2026-02-10T10:00:00Z'), labourGross: 4000, labourNet: 4000 }),
    pdi({ deliveredAt: new Date('2026-02-11T10:00:00Z'), labourGross: 300, labourNet: 300 }),
    // Day 20 is outside the 1–15 day range: not counted.
    job({ deliveredAt: new Date('2026-01-20T10:00:00Z'), labourGross: 9999, labourNet: 9999 }),
  ];
  const result = buildMonthly(jobs, buckets, { annexure: true, timeZone: TZ });
  const row = (id: string) => result.rows.find((candidate) => candidate.id === id)!;

  it('counts only the days in the range of each month', () => {
    expect(result.counted).toBe(5);
    expect(row('VEHICLES:total')).toMatchObject({ '2026-01': 2, '2026-02': 3, total: 5 });
    expect(result.columns.map((column) => column.key)).toEqual(['2026-01', '2026-02', 'total']);
  });

  it('shows gross, discount, net, PDI and total labour', () => {
    expect(row('LABOUR:gross')).toMatchObject({ '2026-01': 2000, '2026-02': 5500, total: 7500 });
    expect(row('LABOUR:discount').total).toBe(200);
    expect(row('LABOUR:net').total).toBe(7300);
    expect(row('LABOUR:pdi').total).toBe(300);
    expect(row('LABOUR:total').total).toBe(7600);
    expect(row('LABOUR:running').total).toBe(1500);
    expect(row('LABOUR:body').total).toBe(500);
  });

  it('breaks each category down by service type in the annexure, adding up to the category', () => {
    const paidTypes = result.rows.filter((candidate) => candidate.groupKey === 'LABOUR' && String(candidate.id).startsWith('LABOUR:labour:st:'));
    expect(paidTypes.map((candidate) => candidate.label)).toEqual(expect.arrayContaining(['RG · PAID SERVICE', '1F · FIRST SERVICE']));
    expect(row('LABOUR:labour:st:st-rg').total).toBe(row('LABOUR:PAID').total);
    expect(buildMonthly(jobs, buckets, { annexure: false, timeZone: TZ }).rows.some((candidate) => String(candidate.id).includes(':st:'))).toBe(false);
  });
});

describe('S2 business product mix and S3 analysis of jobs', () => {
  const jobs = [
    free({ spares: 100, oil: 50 }),
    free({ spares: 300, oil: 50, modelId: 'sorento', model: 'Sorento', mileage: 900 }),
    job({ spares: 600, labourNet: 900 }),
    job({ spares: 0, labourNet: 100, isRepeat: true }),
    accidental({ spares: 1000, labourNet: 3000 }),
  ];
  const bands = [
    { id: 'low', label: '0–1,000 km', fromKm: 0, toKm: 1000 },
    { id: 'high', label: '1,001+ km', fromKm: 1001, toKm: null },
  ];

  it('gives % that add up to 100 within each category and overall', () => {
    const mix = buildProductMix(jobs, { by: 'serviceType', bands });
    for (const group of mix.groups) {
      const shares = mix.rows.filter((row) => row.groupKey === group.key).map((row) => Number(row.sparesPct));
      if (group.totals.spares) expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
    }
    expect(mix.groups.reduce((total, group) => total + group.totals.sparesPct, 0)).toBeCloseTo(100, 10);
    expect(mix.totals.sparesPct).toBe(100);
  });

  it('gives per-vehicle values as amount ÷ vehicles', () => {
    const mix = buildProductMix(jobs, { by: 'serviceType', bands });
    const paid = mix.groups.find((group) => group.key === 'PAID')!;
    expect(paid.totals.vehicles).toBe(2);
    expect(paid.totals.labourPerVehicle).toBe(500);
    expect(mix.totals.sparesPerVehicle).toBe(perUnit(2000, 5));
  });

  it('gives the same totals by model, with vehicles per mileage band', () => {
    const byType = buildProductMix(jobs, { by: 'serviceType', bands });
    const byModel = buildProductMix(jobs, { by: 'model', bands });
    for (const key of ['vehicles', 'spares', 'oil', 'labour', 'serviceCharge']) expect(byModel.totals[key]).toBe(byType.totals[key]);
    expect(byModel.columns.map((column) => column.key)).toEqual(['band:low', 'band:high']);
    expect(byModel.totals['band:low']).toBe(1);
    expect(byModel.totals['band:high']).toBe(4);
  });

  it('builds the job grid with only service types that have a job, and the % grid', () => {
    const analysis = buildJobAnalysis(jobs, 'model');
    expect(analysis.columns.map((column) => column.label)).toEqual(['1F', 'RG', 'AC', 'Total', 'Repeat', 'Accidental']);
    const rio = analysis.rows.find((row) => row.id === 'count:rio')!;
    expect(rio).toMatchObject({ 'st:st-1f': 1, 'st:st-rg': 2, 'st:st-ac': 1, total: 4, repeat: 1, accidental: 1 });
    const rioPct = analysis.rows.find((row) => row.id === 'percent:rio')!;
    expect(rioPct).toMatchObject({ 'st:st-rg': 50, total: 100, repeat: 25 });
  });

  it('agrees with the monthly information report on vehicles and labour', () => {
    const delivered = jobs.map((candidate) => ({ ...candidate, deliveredAt: new Date('2026-01-05T10:00:00Z') }));
    const monthly = buildMonthly(delivered, monthBuckets(['2026-01']), { annexure: false, timeZone: TZ });
    const mix = buildProductMix(delivered, { by: 'serviceType', bands });
    const analysis = buildJobAnalysis(delivered, 'model');
    const vehicles = monthly.rows.find((row) => row.id === 'VEHICLES:total')!.total;
    expect(vehicles).toBe(mix.totals.vehicles);
    expect(vehicles).toBe(analysis.totals.count);
    expect(monthly.rows.find((row) => row.id === 'LABOUR:total')!.total).toBe(mix.totals.labour);
  });
});

describe('S4 group-wise productivity', () => {
  const line = (id: string, jobId: string, groupId: string | null, amount: number, countedAt: string) => ({
    lineId: id, jobId, groupId, groupCode: null, groupLabel: groupId, hours: 1, amount, countedAt: new Date(countedAt),
  });
  const lines = [
    line('l1', 'j1', 'maint', 300, '2026-03-02T10:00:00Z'),
    line('l2', 'j1', 'body', 700, '2026-03-02T10:00:00Z'),
    line('l3', 'j2', 'maint', 1000, '2026-01-15T10:00:00Z'),
  ];

  it('counts lines, distinct jobs and shares per group', () => {
    const year = productivityFor(lines, ['maint', 'body'], (l) => l.groupId ?? 'none');
    expect(year.perGroup.get('maint')).toMatchObject({ lines: 2, jobs: 2, amount: 1300, perJob: 650 });
    expect(year.totals).toMatchObject({ lines: 3, jobs: 2, amount: 2000, share: 100, perJob: 1000 });
    expect(year.perGroup.get('maint')!.share + year.perGroup.get('body')!.share).toBe(100);
  });

  it('gives month to date as a subset of year to date', () => {
    const month = productivityFor(lines.filter((l) => l.countedAt >= new Date('2026-03-01T00:00:00Z')), ['maint', 'body'], (l) => l.groupId ?? 'none');
    expect(month.totals).toMatchObject({ lines: 2, jobs: 1, amount: 1000 });
  });
});

describe('S5 engineer summary and S6 consumption', () => {
  it('derives billing per job, repeat % and late %', () => {
    expect(engineerRatios({ jobs: 4, total: 1000, repeat: 1, late: 2 })).toMatchObject({ perJob: 250, repeatPct: 25, latePct: 50 });
    expect(engineerRatios({ jobs: 0, total: 0 })).toMatchObject({ perJob: 0, repeatPct: 0 });
  });

  it('spreads part amounts by charge type and part kind', () => {
    expect(consumptionFields({ amount: 120, chargeType: 'WARRANTY', partType: 'S' })).toMatchObject({ warranty: 120, nonWarranty: 0, spares: 120, oil: 0 });
    expect(consumptionFields({ amount: 80, chargeType: 'FREE', partType: 'O' })).toMatchObject({ foc: 80, oil: 80, spares: 0 });
    expect(consumptionFields({ amount: 10, chargeType: 'GOODWILL', partType: 'A' })).toMatchObject({ goodwill: 10, spares: 10 });
  });
});

describe('S8 list of major problems', () => {
  const complaint = (codeId: string | null, jobId: string) => ({
    complaintId: `${codeId}-${jobId}`, codeId, code: codeId ? 'EN01' : null, codeDescription: codeId ? 'ENGINE NOISE' : null, serviceGroup: 'MAINTENANCE',
    major: Boolean(codeId), description: 'Noise', jobId, jobNumber: jobId, registration: 'ABC',
  });

  it('lists free text under "Uncoded" and counts jobs per code', () => {
    const { groups } = problemGroups([complaint('en01', 'j1'), complaint('en01', 'j1'), complaint('en01', 'j2'), complaint(null, 'j3')], 'DEFECT');
    expect(groups.find((group) => group.key === 'en01')).toMatchObject({ count: 3, totals: { jobs: 2 }, label: 'EN01 · ENGINE NOISE — MAINTENANCE' });
    expect(groups.find((group) => group.key === UNCODED_KEY)).toMatchObject({ label: 'Uncoded (free text)', count: 1 });
  });

  it('groups by job in the job-wise view', () => {
    const { groups } = problemGroups([complaint('en01', 'j1'), complaint(null, 'j1')], 'JOB');
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: 'j1', count: 2 });
  });
});

describe('S10 regular customers', () => {
  it('counts a visit only when the mileage moved on by the difference', () => {
    const visits = [
      { date: '2026-01-01', mileage: 10000 },
      { date: '2026-01-04', mileage: 10050 },
      { date: '2026-03-01', mileage: 15000 },
      { date: '2026-03-02', mileage: null },
      { date: '2026-06-01', mileage: 20500 },
    ];
    expect(countedVisits(visits, 1000).map((visit) => visit.mileage)).toEqual([10000, 15000, 20500]);
    expect(countedVisits(visits, 0)).toHaveLength(5);
    expect(averageKmBetween(countedVisits(visits, 1000))).toBe(5250);
  });
});

describe('S11 birthday / anniversary', () => {
  it('finds day-months in a range, wrapping over 31 December', () => {
    const from = dayMonthKey(12, 1);
    const to = dayMonthKey(1, 31);
    expect(inDayMonthRange(dayMonthKey(12, 25), from, to)).toBe(true);
    expect(inDayMonthRange(dayMonthKey(1, 5), from, to)).toBe(true);
    expect(inDayMonthRange(dayMonthKey(6, 5), from, to)).toBe(false);
    expect(inDayMonthRange(dayMonthKey(10, 8), dayMonthKey(1, 1), dayMonthKey(10, 8))).toBe(true);
    expect(dayMonthPosition(dayMonthKey(12, 25), from)).toBeLessThan(dayMonthPosition(dayMonthKey(1, 5), from));
    expect(isValidDayMonth(2, 29)).toBe(true);
    expect(isValidDayMonth(4, 31)).toBe(false);
  });
});

describe('S13 skipped free service', () => {
  const rules: FreeServiceRule[] = [
    { serviceTypeId: '1f', code: '1F', label: '1F', order: 0, daysLimit: 30, mileageLimit: 1000 },
    { serviceTypeId: '2f', code: '2F', label: '2F', order: 1, daysLimit: 90, mileageLimit: 5000 },
    { serviceTypeId: '3f', code: '3F', label: '3F', order: 2, daysLimit: null, mileageLimit: null },
    { serviceTypeId: 'di', code: 'DI', label: 'DI', order: 3, daysLimit: null, mileageLimit: null },
  ];

  it('flags a free service only after its days have passed', () => {
    const vehicle = { saleDate: '2026-01-01', mileage: 400, done: new Set<string>() };
    expect(skippedFreeServices(vehicle, rules, '2026-01-31')).toEqual([]);
    expect(skippedFreeServices(vehicle, rules, '2026-02-01').map((skip) => [skip.code, skip.reason, skip.dueBy])).toEqual([['1F', 'DAYS', '2026-01-31']]);
  });

  it('flags a free service once the km limit is passed, and not when it was done', () => {
    expect(skippedFreeServices({ saleDate: '2026-01-01', mileage: 1200, done: new Set() }, rules, '2026-01-10').map((skip) => skip.reason)).toEqual(['KM']);
    expect(skippedFreeServices({ saleDate: '2026-01-01', mileage: 1200, done: new Set(['1f']) }, rules, '2026-01-10')).toEqual([]);
  });

  it('flags a service with no limit once a later free service is done', () => {
    const skipped = skippedFreeServices({ saleDate: '2026-01-01', mileage: 4000, done: new Set(['1f', '2f', 'di']) }, rules, '2026-03-01');
    expect(skipped.map((skip) => [skip.code, skip.reason])).toEqual([['3F', 'NEXT_DONE']]);
  });
});

describe('S15 management information report', () => {
  const facts = (overrides: Partial<MirFacts> = {}): MirFacts => ({
    jobs: [job({ warranty: true }), running({ isRepeat: true, bodyLabour: 400, promisedAt: new Date('2026-01-05T10:00:00Z'), deliveredAt: new Date('2026-01-06T10:00:00Z') })],
    timeZone: TZ,
    counter: { spares: 100, accessories: 20, oil: 30, net: 160 },
    stock: 5000,
    profit: { sales: 1000, cost: 800, margin: 200 },
    workshopBilling: 2000,
    transfersOut: 10,
    transfersIn: 20,
    purchases: 30,
    outstanding: [10, 20, 30, 40, 50, 60, 70, 80],
    ...overrides,
  });
  const value = (lines: ReturnType<typeof mirLines>, id: string) => lines.find((line) => line.id === id)?.value;

  it('reads each section from its source figures', () => {
    const lines = mirLines(facts());
    expect(value(lines, 'a2-total')).toBe(2);
    expect(value(lines, 'a3-warranty')).toBe(1);
    expect(value(lines, 'a4-repeat-pct')).toBe(50);
    expect(value(lines, 'a5-late-date')).toBe(1);
    expect(value(lines, 'a2-body')).toBe(1);
    expect(value(lines, 'a1-labour')).toBe(2000);
    expect(value(lines, 'b-net')).toBe(160);
    expect(value(lines, 'd-profit-pct')).toBe(20);
    expect(value(lines, 'e-total')).toBe(2160);
    expect(value(lines, 'o-total')).toBe(360);
    expect(value(lines, 'o-pct')).toBe(16.67);
    expect(lines.find((line) => line.id === 'a6-psf')).toMatchObject({ kind: 'note', value: null });
  });

  it('hides the sections the user may not see', () => {
    const lines = mirLines(facts({ stock: undefined, profit: undefined, outstanding: undefined }));
    expect(lines.some((line) => ['C', 'D', 'O'].includes(line.section))).toBe(false);
  });

  it('adds branch columns into the total', () => {
    const merged = mergeFacts([facts(), facts()], [], TZ);
    expect(merged).toMatchObject({ stock: 10000, workshopBilling: 4000, counter: { net: 320 } });
    expect(merged.outstanding![7]).toBe(160);
  });

  it('builds the eight legacy age bands from two runs of the party age report', () => {
    expect(outstandingBands([1, 2, 3, 4, 5, 100], [30, 40, 50, 60, 70, 80])).toEqual([1, 2, 3, 4, 5, 15, 90, 210]);
  });
});

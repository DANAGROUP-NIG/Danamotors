import { Prisma } from '@prisma/client';
import { PERMISSIONS } from '../../../shared/constants/roles';
import { ForbiddenError } from '../../../shared/errors/appError';
import { partyReportQuery } from '../../finance/party-report.validation';
import { reportQuery as partyAgeQuery } from '../../finance/party-report.service';
import { PartsReportService } from '../../parts-report/partsReport.service';
import { localDateOf, localDayRange, localToday } from '../core/dates';
import { flag, rangeQuery } from '../core/filters';
import { activeInvoiceSql } from '../core/sql';
import { defineReport, type ReportDb, type ReportRow, type ReportScope } from '../core/types';
import { loadMisJobs, type MisJob } from './mis.data';
import { CATEGORY_LABELS, lateByDate, lateByTime, percentOf, perUnit, sumMoney } from './mis.logic';

/** The legacy MIR's eight outstanding age bands (days). */
export const OUTSTANDING_BANDS = ['Up to 30 days', '31–60 days', '61–90 days', '91–120 days', '121–150 days', '151–180 days', '181–240 days', 'Over 240 days'] as const;

/** Figures for one column of the MIR (one branch, or the total). Undefined = the user may not see that section. */
export interface MirFacts {
  jobs: MisJob[];
  timeZone: string;
  counter: { spares: number; accessories: number; oil: number; net: number };
  stock?: number;
  profit?: { sales: number; cost: number; margin: number };
  workshopBilling: number;
  transfersOut: number;
  transfersIn: number;
  purchases: number;
  outstanding?: number[];
}

export interface MirLine {
  section: string;
  id: string;
  label: string;
  format: 'money' | 'integer' | 'percent';
  kind?: 'total' | 'note';
  value: number | null;
}

export const MIR_SECTIONS = [
  { key: 'A', label: 'A. Workshop' },
  { key: 'B', label: 'B. Counter sale' },
  { key: 'C', label: 'C. Closing stock' },
  { key: 'D', label: 'D. Parts profit' },
  { key: 'E', label: 'E. Total billing' },
  { key: 'FG', label: 'F, G. Stock transfers' },
  { key: 'P', label: 'Purchases' },
  { key: 'O', label: 'Outstanding' },
] as const;

/** The MIR lines for one column, in report order. Pure, so each section can be checked against its source. */
export function mirLines(facts: MirFacts): MirLine[] {
  const { jobs } = facts;
  const sum = (values: number[]) => sumMoney(values);
  const vehicles = jobs.length;
  const line = (section: string, id: string, label: string, format: MirLine['format'], value: number | null, kind?: MirLine['kind']): MirLine => ({ section, id, label, format, value, kind });
  const count = (predicate: (job: MisJob) => boolean) => jobs.filter(predicate).length;
  const labour = sum(jobs.map((job) => job.labourNet));
  const spares = sum(jobs.map((job) => job.spares));
  const accessories = sum(jobs.map((job) => job.accessories));
  const oil = sum(jobs.map((job) => job.oil));
  const serviceCharge = sum(jobs.map((job) => job.serviceCharge));
  const service = jobs.filter((job) => job.category === 'FREE' || job.category === 'PAID');
  const running = jobs.filter((job) => job.category === 'RUNNING_REPAIR');
  const delivered = jobs.filter((job) => job.deliveredAt && job.promisedAt);
  const lateDate = delivered.filter((job) => lateByDate(localDateOf(job.promisedAt!, facts.timeZone), localDateOf(job.deliveredAt!, facts.timeZone))).length;
  const lateTime = delivered.filter((job) => lateByTime(job.promisedAt, job.deliveredAt)).length;
  const bays = new Set(jobs.filter((job) => job.bayId).map((job) => job.bayId)).size;
  const engineers = new Set(jobs.filter((job) => job.engineerId).map((job) => job.engineerId)).size;
  const engineerLabour = (predicate: (job: MisJob) => boolean, value: (job: MisJob) => number = (job) => job.labourNet) =>
    perUnit(sum(jobs.filter((job) => job.engineerId && predicate(job)).map(value)), engineers);
  const totalBilling = sum([facts.workshopBilling, facts.counter.net]);

  const lines: MirLine[] = [
    line('A', 'a1-spares', 'A1. Spares billed', 'money', sum([spares, -accessories])),
    line('A', 'a1-accessories', 'A1. Accessories billed', 'money', accessories),
    line('A', 'a1-oil', 'A1. Oil and lubricants billed', 'money', oil),
    line('A', 'a1-labour', 'A1. Labour billed (net)', 'money', labour),
    line('A', 'a1-service', 'A1. Service charge', 'money', serviceCharge),
    line('A', 'a1-total', 'A1. Total workshop value', 'money', sum([spares, oil, labour, serviceCharge]), 'total'),
    line('A', 'a2-free', `A2. Vehicles — ${CATEGORY_LABELS.FREE.toLowerCase()}`, 'integer', count((job) => job.category === 'FREE')),
    line('A', 'a2-paid', `A2. Vehicles — ${CATEGORY_LABELS.PAID.toLowerCase()}`, 'integer', count((job) => job.category === 'PAID')),
    line('A', 'a2-running', 'A2. Vehicles — running repair', 'integer', count((job) => job.category === 'RUNNING_REPAIR')),
    line('A', 'a2-body', 'A2. Vehicles — body repair', 'integer', count((job) => job.bodyLabour > 0)),
    line('A', 'a2-others', 'A2. Vehicles — others (incl. accidental)', 'integer', count((job) => job.category === 'OTHER' || job.category === 'ACCIDENTAL')),
    line('A', 'a2-pdi', 'A2. Vehicles — PDI', 'integer', count((job) => job.category === 'PDI')),
    line('A', 'a2-total', 'A2. Vehicles — total', 'integer', vehicles, 'total'),
    line('A', 'a3-warranty', 'A3. Vehicles under warranty', 'integer', count((job) => job.warranty)),
    line('A', 'a3-warranty-pct', 'A3. Under warranty %', 'percent', percentOf(count((job) => job.warranty), vehicles)),
    line('A', 'a4-repeat', 'A4. Repeat jobs', 'integer', count((job) => job.isRepeat)),
    line('A', 'a4-repeat-pct', 'A4. Repeat jobs %', 'percent', percentOf(count((job) => job.isRepeat), vehicles)),
    line('A', 'a5-late-date', 'A5. Delivered late — by date', 'integer', lateDate),
    line('A', 'a5-late-date-pct', 'A5. Delivered late by date %', 'percent', percentOf(lateDate, delivered.length)),
    line('A', 'a5-late-time', 'A5. Delivered late — by time', 'integer', lateTime),
    line('A', 'a5-late-time-pct', 'A5. Delivered late by time %', 'percent', percentOf(lateTime, delivered.length)),
    line('A', 'a6-psf', 'A6. PSF satisfaction — not recorded yet (no follow-up module)', 'integer', null, 'note'),
    line('A', 'a7-service-spares', 'A7. Spares per vehicle — service', 'money', perUnit(sum(service.map((job) => job.spares)), service.length)),
    line('A', 'a7-service-labour', 'A7. Labour per vehicle — service', 'money', perUnit(sum(service.map((job) => job.labourNet)), service.length)),
    line('A', 'a7-running-spares', 'A7. Spares per vehicle — running repair', 'money', perUnit(sum(running.map((job) => job.spares)), running.length)),
    line('A', 'a7-running-labour', 'A7. Labour per vehicle — running repair', 'money', perUnit(sum(running.map((job) => job.labourNet)), running.length)),
    line('A', 'a8-jobs-bay', 'A8. Jobs per bay', 'money', perUnit(count((job) => Boolean(job.bayId)), bays)),
    line('A', 'a8-labour-bay', 'A8. Labour per bay', 'money', perUnit(sum(jobs.filter((job) => job.bayId).map((job) => job.labourNet)), bays)),
    line('A', 'a9-free', 'A9. Earning per engineer — free', 'money', engineerLabour((job) => job.category === 'FREE')),
    line('A', 'a9-paid', 'A9. Earning per engineer — paid', 'money', engineerLabour((job) => job.category === 'PAID')),
    line('A', 'a9-running', 'A9. Earning per engineer — running', 'money', engineerLabour((job) => job.category === 'RUNNING_REPAIR')),
    line('A', 'a9-others', 'A9. Earning per engineer — others', 'money', engineerLabour((job) => job.category === 'OTHER' || job.category === 'ACCIDENTAL' || job.category === 'PDI')),
    line('A', 'a9-body', 'A9. Earning per engineer — body', 'money', engineerLabour(() => true, (job) => job.bodyLabour)),
    line('B', 'b-spares', 'Spares', 'money', facts.counter.spares),
    line('B', 'b-accessories', 'Accessories', 'money', facts.counter.accessories),
    line('B', 'b-oil', 'Oil', 'money', facts.counter.oil),
    line('B', 'b-net', 'Net counter sale (after discount and VAT)', 'money', facts.counter.net, 'total'),
  ];
  if (facts.stock !== undefined) lines.push(line('C', 'c-stock', 'Closing stock value', 'money', facts.stock, 'total'));
  if (facts.profit)
    lines.push(
      line('D', 'd-sales', 'Parts sale value', 'money', facts.profit.sales),
      line('D', 'd-cost', 'Cost', 'money', facts.profit.cost),
      line('D', 'd-profit', 'Profit', 'money', facts.profit.margin, 'total'),
      line('D', 'd-profit-pct', 'Profit %', 'percent', percentOf(facts.profit.margin, facts.profit.sales)),
    );
  lines.push(
    line('E', 'e-workshop', 'Workshop bills', 'money', facts.workshopBilling),
    line('E', 'e-counter', 'Counter sale bills', 'money', facts.counter.net),
    line('E', 'e-total', 'Total billing', 'money', totalBilling, 'total'),
    line('FG', 'f-out', 'F. Stock transfers to branches (STN)', 'money', facts.transfersOut),
    line('FG', 'g-in', 'G. Stock receipts from branches (SRN)', 'money', facts.transfersIn),
    line('P', 'p-mrn', 'Purchases (vendor MRNs)', 'money', facts.purchases, 'total'),
  );
  if (facts.outstanding) {
    const total = sum(facts.outstanding);
    OUTSTANDING_BANDS.forEach((band, index) => lines.push(line('O', `o-${index}`, band, 'money', facts.outstanding![index])));
    lines.push(line('O', 'o-total', 'Total outstanding', 'money', total, 'total'), line('O', 'o-pct', 'Outstanding as % of billing', 'percent', percentOf(total, totalBilling)));
  }
  return lines;
}

/** Add up the additive figures of several branch columns (the job list is kept whole for the total). */
export function mergeFacts(columns: readonly MirFacts[], jobs: MisJob[], timeZone: string): MirFacts {
  const total = (pick: (facts: MirFacts) => number | undefined) => sumMoney(columns.map((facts) => pick(facts) ?? 0));
  const first = columns[0];
  return {
    jobs,
    timeZone,
    counter: { spares: total((f) => f.counter.spares), accessories: total((f) => f.counter.accessories), oil: total((f) => f.counter.oil), net: total((f) => f.counter.net) },
    stock: first?.stock === undefined ? undefined : total((f) => f.stock),
    profit: first?.profit ? { sales: total((f) => f.profit?.sales), cost: total((f) => f.profit?.cost), margin: total((f) => f.profit?.margin) } : undefined,
    workshopBilling: total((f) => f.workshopBilling),
    transfersOut: total((f) => f.transfersOut),
    transfersIn: total((f) => f.transfersIn),
    purchases: total((f) => f.purchases),
    outstanding: first?.outstanding ? OUTSTANDING_BANDS.map((_, index) => total((f) => f.outstanding?.[index])) : undefined,
  };
}

/** Eight bands from the party age report, run twice because it takes five limits (six buckets) at a time. */
export function outstandingBands(low: readonly number[], high: readonly number[]): number[] {
  const upTo150 = low.slice(0, 5);
  return [...upTo150, sumMoney([high[0], ...upTo150.map((value) => -value)]), sumMoney([high[1], high[2]]), sumMoney([high[3], high[4], high[5]])];
}

const LOW_LIMITS = [30, 60, 90, 120, 150];
const HIGH_LIMITS = [180, 210, 240, 300, 360];

async function partyOutstanding(db: ReportDb, branchId: string, asOn: string): Promise<number[]> {
  const run = async (limits: number[]) => {
    const input = partyReportQuery.parse({ kind: 'age', branchId, asOn, ageLimits: limits });
    const rows = await db.$queryRaw<Record<string, Prisma.Decimal | number | null>[]>(await partyAgeQuery(db, input, limits));
    return [0, 1, 2, 3, 4, 5].map((bucket) => sumMoney(rows.map((row) => Number(row[`bucket${bucket}`] ?? 0))));
  };
  return outstandingBands(await run(LOW_LIMITS), await run(HIGH_LIMITS));
}

const parts = new PartsReportService();

async function branchFacts(
  db: ReportDb,
  branchId: string,
  jobs: MisJob[],
  query: { from: string; to: string; stockAtDealerRate: boolean; profitAtDealerRate: boolean },
  scope: ReportScope,
): Promise<MirFacts> {
  const can = (permission: string) => scope.permissions.includes(permission);
  const filters = { from: query.from, to: query.to, branchId };
  const totalsOf = async (kind: string, option?: string, summary?: boolean) => (await parts.run(kind, { ...filters, option, summary })).totals;
  const asOn = [query.to, localToday(scope.timeZone)].sort()[0];
  const { start, end } = localDayRange(query.from, query.to, scope.timeZone);
  const [counter, stock, profit, out, inward, purchases, outstanding, billing] = await Promise.all([
    totalsOf('counter-sales-summary', 'EXECUTIVE'),
    can(PERMISSIONS.STOCK_READ) ? totalsOf('current-stock', query.stockAtDealerRate ? 'DEALER' : 'FIFO') : undefined,
    can(PERMISSIONS.STOCK_READ) ? totalsOf('profitability', query.profitAtDealerRate ? 'DEALER' : 'FIFO', true) : undefined,
    totalsOf('stn-register', 'STN'),
    totalsOf('stn-register', 'SRN'),
    totalsOf('mrn-register', 'SUMMARY'),
    can(PERMISSIONS.PARTY_OUTSTANDING_AGE_READ) ? partyOutstanding(db, branchId, asOn) : undefined,
    db.$queryRaw<{ total: number | null }[]>`
      SELECT ROUND(SUM(i."total")::numeric, 2)::float8 AS "total"
      FROM "Invoice" i JOIN "JobCard" j ON j."id" = i."jobCardId"
      WHERE ${activeInvoiceSql} AND j."branchId" = ${branchId} AND i."issuedDate" >= ${start} AND i."issuedDate" < ${end}`,
  ]);
  return {
    jobs,
    timeZone: scope.timeZone,
    counter: { spares: counter.spares ?? 0, accessories: counter.accessories ?? 0, oil: counter.oil ?? 0, net: counter.net ?? 0 },
    stock: stock ? stock.value ?? 0 : undefined,
    profit: profit ? { sales: profit.sales ?? 0, cost: profit.cost ?? 0, margin: profit.margin ?? 0 } : undefined,
    workshopBilling: billing[0]?.total ?? 0,
    transfersOut: out.amount ?? 0,
    transfersIn: inward.amount ?? 0,
    purchases: purchases.value ?? 0,
    outstanding,
  };
}

const managementInformation = defineReport({
  slug: 'management-information',
  title: 'Management information report',
  width: 80,
  permission: PERMISSIONS.MANAGEMENT_INFORMATION_READ,
  summary:
    'One scorecard per branch for the period, following the legacy MIR: workshop figures from the MIS job aggregation, counter sale, closing stock, parts profit, total billing, stock transfers, purchases and outstanding in eight age bands, each read from the report that owns it. All branches (cross-branch users) gives one column per branch plus a total. Stock, profit and outstanding need their own report permissions.',
  period: 'range',
  timeoutMs: 120_000,
  query: rangeQuery([], { stockAtDealerRate: flag, profitAtDealerRate: flag }),
  filterKeys: [],
  params: [
    { name: 'stockAtDealerRate', description: 'true: closing stock at dealer rate (default FIFO).', schema: { type: 'boolean' } },
    { name: 'profitAtDealerRate', description: 'true: parts profit at dealer rate (default FIFO).', schema: { type: 'boolean' } },
  ],
  example: {
    rows: [{ id: 'a1-labour', groupKey: 'A', label: 'A1. Labour billed (net)', format: 'money', kind: null, 'b:branch-uuid': 2660000, total: 2660000 }],
    groups: [{ key: 'A', label: 'A. Workshop', count: 33, totals: {} }],
    columns: [{ key: 'b:branch-uuid', label: 'Abuja', format: 'money' }, { key: 'total', label: 'Total', format: 'money' }],
    totals: { count: 52 },
  },
  async run(db, scope, query) {
    const allBranches = scope.branchIds === null;
    const crossBranch = scope.permissions.includes(PERMISSIONS.INVENTORY_CROSS_BRANCH) || scope.permissions.includes(PERMISSIONS.BRANCH_ALL);
    if (allBranches && !crossBranch) throw new ForbiddenError('All branches needs the inventory:cross-branch permission');
    const branches = allBranches
      ? await db.branch.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
      : [{ id: scope.branch!.id, name: scope.branch!.name }];
    const { jobs, truncated } = await loadMisJobs(db, scope, { from: query.from, to: query.to, basis: 'delivered', jobType: 'BOTH' });
    const columns = await Promise.all(branches.map((branch) => branchFacts(db, branch.id, jobs.filter((job) => job.branchId === branch.id), query, scope)));
    const keyOf = (id: string) => `b:${id}`;
    const sets = allBranches
      ? [...branches.map((branch, index) => ({ key: keyOf(branch.id), label: branch.name, facts: columns[index] })), { key: 'total', label: 'Total', facts: mergeFacts(columns, jobs, scope.timeZone) }]
      : [{ key: 'total', label: branches[0].name, facts: columns[0] }];
    const perColumn = sets.map((set) => mirLines(set.facts));
    const rows: ReportRow[] = perColumn[0].map((line, index) => ({
      id: line.id,
      groupKey: line.section,
      label: line.label,
      format: line.format,
      kind: line.kind ?? null,
      ...Object.fromEntries(sets.map((set, column) => [set.key, perColumn[column][index].value])),
    }));
    const sections = MIR_SECTIONS.filter((section) => rows.some((row) => row.groupKey === section.key));
    return {
      rows,
      groups: sections.map((section) => ({ key: section.key, label: section.label, count: rows.filter((row) => row.groupKey === section.key).length, totals: {} })),
      columns: sets.map((set) => ({ key: set.key, label: set.label, format: 'money' as const })),
      // The line count, so a branch without delivered jobs still shows its parts and outstanding figures.
      totals: { count: rows.length },
      summary: { vehicles: jobs.length, branches: branches.length, hidden: MIR_SECTIONS.length - sections.length, asOn: [query.to, localToday(scope.timeZone)].sort()[0] },
      truncated,
    };
  },
});

export const MIS_MANAGEMENT_REPORTS = [managementInformation];

import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PERMISSIONS } from '../../shared/constants/roles';
import { billGroupOf, BILL_GROUPS, freeServiceClaimable } from './core/calc';
import { localDayRange } from './core/dates';
import { rangeQuery } from './core/filters';
import { capRows, groupRows, MAX_REPORT_ROWS, sumFields } from './core/shape';
import { activeInvoiceSql, jobColumnsSql, jobFilterSql, jobJoinsSql, moneySql } from './core/sql';
import type { DimensionFilters, FilterKey, ReportDb, ReportDefinition, ReportRow, ReportScope } from './core/types';

const STD_FILTERS: FilterKey[] = ['model', 'variant', 'serviceType', 'team', 'receivedBy'];

/** Charge-type amounts on a job's parts and labour lines (warranty, free / goodwill). */
const chargeTotalsJoin = Prisma.sql`
  LEFT JOIN LATERAL (
    SELECT
      ${moneySql(Prisma.sql`COALESCE(SUM(cl."amount") FILTER (WHERE cl."kind" = 'LABOUR' AND cl."chargeType" = 'WARRANTY'), 0)`)} AS "warrantyLabour",
      ${moneySql(Prisma.sql`COALESCE(SUM(cl."amount") FILTER (WHERE cl."kind" = 'PART' AND cl."chargeType" = 'WARRANTY'), 0)`)} AS "warrantyParts",
      ${moneySql(Prisma.sql`COALESCE(SUM(cl."amount") FILTER (WHERE cl."kind" = 'LABOUR' AND cl."chargeType" IN ('FREE', 'GOODWILL')), 0)`)} AS "focLabour"
    FROM "JobCardLine" cl WHERE cl."jobCardId" = j."id") charges ON true`;

/** Active job bills issued in the period, with the job's dimensions (aliases as jobFromSql, i = bill). */
async function jobBills<R>(db: ReportDb, scope: ReportScope, filters: DimensionFilters, from: string, to: string, select: Prisma.Sql, extra: Prisma.Sql = Prisma.empty, orderBy: Prisma.Sql = Prisma.sql`i."issuedDate", i."invoiceNumber"`) {
  const { start, end } = localDayRange(from, to, scope.timeZone);
  return db.$queryRaw<R[]>(Prisma.sql`
    SELECT ${jobColumnsSql},
      i."id" AS "billId", i."invoiceNumber" AS "billNumber", i."issuedDate" AS "billDate",
      ${moneySql(Prisma.sql`i."total"`)} AS "billAmount",
      ${select}
    FROM "Invoice" i
    JOIN "JobCard" j ON j."id" = i."jobCardId"
    ${jobJoinsSql}
    ${chargeTotalsJoin}
    WHERE ${activeInvoiceSql}
      AND i."issuedDate" >= ${start} AND i."issuedDate" < ${end}
      ${extra}
      ${jobFilterSql(scope, filters)}
    ORDER BY ${orderBy}
    LIMIT ${MAX_REPORT_ROWS + 1}`);
}

function groupByBill<R extends ReportRow & { billAmount: number }>(rows: R[], sums: readonly string[]) {
  const grouped = groupRows(
    rows,
    { key: (row) => billGroupOf(row.billAmount), label: (row) => BILL_GROUPS.find((g) => g.key === billGroupOf(row.billAmount))!.label, order: BILL_GROUPS.map((g) => g.key), always: BILL_GROUPS },
    sums,
  );
  return { rows: grouped.rows, groups: grouped.groups.map((group) => ({ ...group, totals: { count: group.count, ...group.totals } })) };
}

// ── 10. Daily labour register ───────────────────────────────────────────────

const LABOUR_FILTERS: FilterKey[] = [...STD_FILTERS, 'technician'];
const labourRegisterQuery = rangeQuery(LABOUR_FILTERS, {});
const LABOUR_SUMS = ['labourCharges', 'discount', 'serviceCharges', 'vatOnLabour', 'totalLabour', 'billAmount', 'warrantyLabour', 'focLabour'] as const;

export const dailyLabourRegisterReport: ReportDefinition<z.infer<typeof labourRegisterQuery>> = {
  slug: 'daily-labour-register',
  title: 'Daily labour register',
  width: 132,
  permission: PERMISSIONS.REPORT_DAILY_LABOUR_REGISTER,
  summary:
    'Labour billed per job bill in the period (bill date): labour charges, labour discount, service charges, VAT on labour, total labour and bill amount, plus warranty labour and free-of-cost (free and goodwill) labour on the job. Zero-value bills are grouped separately; cash and credit bills share a group until bills record their type.',
  period: 'range',
  query: labourRegisterQuery,
  filterKeys: LABOUR_FILTERS,
  example: {
    rows: [{ jobNumber: '2025001669', billNumber: '2026000518', labourCharges: 418231, discount: 63109.65, serviceCharges: 2500, vatOnLabour: 26821.6, totalLabour: 384442.95, billAmount: 5412560, warrantyLabour: 0, focLabour: 0, groupKey: 'BILLED' }],
    groups: [{ key: 'BILLED', label: 'Cash and credit bills', count: 59, totals: { count: 59, totalLabour: 2184000, billAmount: 25502300 } }, { key: 'ZERO', label: 'Zero value bills', count: 30, totals: { count: 30, warrantyLabour: 1814.2 } }],
  },
  async run(db, scope, q) {
    const result = await jobBills<ReportRow & { billAmount: number }>(
      db,
      scope,
      q,
      q.from,
      q.to,
      Prisma.sql`
        ${moneySql(Prisma.sql`i."labourTotal"`)} AS "labourCharges",
        ${moneySql(Prisma.sql`i."labourDiscountAmount"`)} AS "discount",
        ${moneySql(Prisma.sql`i."serviceTotal"`)} AS "serviceCharges",
        ${moneySql(Prisma.sql`i."vatAmount"`)} AS "vatOnLabour",
        ${moneySql(Prisma.sql`i."labourTotal" - i."labourDiscountAmount" + i."serviceTotal" + i."vatAmount"`)} AS "totalLabour",
        charges."warrantyLabour", charges."focLabour"`,
    );
    const { rows, truncated } = capRows(result);
    return { ...groupByBill(rows, LABOUR_SUMS), totals: { count: rows.length, ...sumFields(rows, LABOUR_SUMS) }, truncated };
  },
};

// ── 11. Workshop bill report ────────────────────────────────────────────────

const BILL_FILTERS: FilterKey[] = [...STD_FILTERS, 'deliveredBy'];
const workshopBillQuery = rangeQuery(BILL_FILTERS, { orderBy: z.enum(['jobNumber', 'billNumber']).default('jobNumber') });
const BILL_SUMS = ['partsAmount', 'labourAmount', 'discount', 'vatAmount', 'roundOff', 'billAmount'] as const;

export const workshopBillReport: ReportDefinition<z.infer<typeof workshopBillQuery>> = {
  slug: 'workshop-bill',
  title: 'Workshop bill report',
  width: 80,
  permission: PERMISSIONS.REPORT_WORKSHOP_BILL,
  summary:
    'Job bills issued in the period with the delivery advisor, gate pass and bill amount (the legacy layout), plus the parts / labour / discount / VAT / round-off breakdown. Zero-value bills are grouped separately; cash and credit share a group until bills record their type.',
  period: 'range',
  query: workshopBillQuery,
  filterKeys: BILL_FILTERS,
  params: [{ name: 'orderBy', description: 'jobNumber (default, as legacy) or billNumber.', schema: { type: 'string', enum: ['jobNumber', 'billNumber'] } }],
  example: {
    rows: [{ jobNumber: '2026000705', jobDate: '2026-07-01T08:00:00.000Z', registration: 'FST 649 FR', deliveredBy: 'Blessing Adeyemi', gatePassNumber: '2026000798', billNumber: '2026000497', billAmount: 140600, groupKey: 'BILLED' }],
    totals: { count: 89, billAmount: 25502300 },
  },
  async run(db, scope, q) {
    const result = await jobBills<ReportRow & { billAmount: number }>(
      db,
      scope,
      q,
      q.from,
      q.to,
      Prisma.sql`
        j."gatePassNumber" AS "gatePassNumber",
        ${moneySql(Prisma.sql`i."partsTotal"`)} AS "partsAmount",
        ${moneySql(Prisma.sql`i."labourTotal" + i."serviceTotal"`)} AS "labourAmount",
        ${moneySql(Prisma.sql`i."partsDiscountAmount" + i."labourDiscountAmount"`)} AS "discount",
        ${moneySql(Prisma.sql`i."vatAmount"`)} AS "vatAmount",
        ${moneySql(Prisma.sql`i."roundOff"`)} AS "roundOff"`,
      Prisma.empty,
      q.orderBy === 'billNumber' ? Prisma.sql`i."invoiceNumber"` : Prisma.sql`j."jobNumber", i."invoiceNumber"`,
    );
    const { rows, truncated } = capRows(result);
    return { ...groupByBill(rows, BILL_SUMS), totals: { count: rows.length, ...sumFields(rows, BILL_SUMS) }, truncated };
  },
};

// ── 13. Free service report ─────────────────────────────────────────────────

const freeServiceQuery = rangeQuery(BILL_FILTERS, {});
const FREE_SUMS = ['serviceCharge', 'otherCharges', 'netClaimable'] as const;

type FreeRow = ReportRow & { freeServiceNo: number | null; model: string | null; serviceCharge: number | null; warrantyLabour: number; warrantyParts: number; billAmount: number };

const ordinal = (n: number | null) => (n === null ? 'Free service (number not set)' : `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'} free service`);

export const freeServiceReport: ReportDefinition<z.infer<typeof freeServiceQuery>> = {
  slug: 'free-service',
  title: 'Free service report',
  width: 80,
  permission: PERMISSIONS.REPORT_FREE_SERVICE,
  summary:
    'Free (complimentary) services billed in the period: jobs whose service type is a free service, with the vehicle\'s engine no, sale date and selling dealer, the free service no and coupon no. Net claimable = service charge + warranty labour and parts on the job. Summary by free service no and model.',
  period: 'range',
  query: freeServiceQuery,
  filterKeys: BILL_FILTERS,
  example: {
    rows: [{ jobNumber: '2026004701', engineNumber: 'G4FG123456', saleDate: '2026-03-12', freeServiceNo: 1, couponNo: 'C-118', serviceCharge: 30000, otherCharges: 12000, netClaimable: 42000, groupKey: '1' }],
    groups: [{ key: '1', label: '1st free service', count: 28, totals: { count: 28, serviceCharge: 840000, otherCharges: 0, netClaimable: 840000 } }],
    breakdown: [{ key: 'Seltos::1', label: 'Seltos', count: 9, amount: 270000 }],
  },
  async run(db, scope, q) {
    const result = await jobBills<FreeRow>(
      db,
      scope,
      q,
      q.from,
      q.to,
      Prisma.sql`
        v."engineNumber" AS "engineNumber", to_char(v."saleDate", 'YYYY-MM-DD') AS "saleDate", v."sellingDealer" AS "sellingDealer",
        st."freeServiceNo" AS "freeServiceNo", j."freeServiceCouponNo" AS "couponNo",
        ${moneySql(Prisma.sql`COALESCE(j."serviceCharge", 0)`)} AS "serviceCharge",
        charges."warrantyLabour", charges."warrantyParts"`,
      Prisma.sql` AND st."freeService" = true`,
      Prisma.sql`st."freeServiceNo" NULLS LAST, i."issuedDate", i."invoiceNumber"`,
    );
    const { rows: capped, truncated } = capRows(result);
    const rows = capped.map((row) => {
      const otherCharges = Math.round((row.warrantyLabour + row.warrantyParts) * 100) / 100;
      return { ...row, otherCharges, netClaimable: freeServiceClaimable(row) };
    });
    const grouped = groupRows(rows, { key: (row) => String(row.freeServiceNo ?? 'none'), label: (row) => ordinal(row.freeServiceNo) }, FREE_SUMS);
    // Model × free service no, for the summary table.
    const matrix = new Map<string, { key: string; label: string; count: number; amount: number }>();
    for (const row of rows) {
      const key = `${row.model ?? 'Unknown'}::${row.freeServiceNo ?? 'none'}`;
      const item = matrix.get(key) ?? { key, label: row.model ?? 'Unknown', count: 0, amount: 0 };
      item.count += 1;
      item.amount = Math.round((item.amount + row.netClaimable) * 100) / 100;
      matrix.set(key, item);
    }
    return {
      rows: grouped.rows,
      groups: grouped.groups.map((group) => ({ ...group, totals: { count: group.count, ...group.totals } })),
      totals: { count: rows.length, ...sumFields(rows, FREE_SUMS) },
      summary: Object.fromEntries(grouped.groups.map((group) => [`no_${group.key}`, group.count])),
      breakdown: Array.from(matrix.values()).sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key)),
      truncated,
    };
  },
};

export const BILLING_REPORTS = [dailyLabourRegisterReport, workshopBillReport, freeServiceReport];

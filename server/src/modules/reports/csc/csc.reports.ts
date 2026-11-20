import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PERMISSIONS } from '../../../shared/constants/roles';
import { localToday } from '../core/dates';
import { branchParam, flag, idList, modeParam, rangeQuery } from '../core/filters';
import { countBy } from '../core/shape';
import { defineReport, type FilterKey } from '../core/types';
import { MONTH_PATTERN } from '../mis/mis.logic';
import { loadCloseReasons, loadCscRows } from './csc.data';
import { buildNoShow, followUpTotals, groupByMonth, monthRange, reasonKey, usedReasons, type CscReportRow } from './csc.logic';

const DUE_NOTE = 'Cases are selected on their due date.';
const FILTERS: FilterKey[] = ['model', 'serviceType'];

const breakdownByService = (rows: CscReportRow[]) => {
  const counts = countBy(rows, (row) => row.serviceCode);
  return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => ({ key, label: key, count }));
};

// ── Call sheet (CSC cases generation → Print) ──────────────────────────────────

const callSheet = defineReport({
  slug: 'csc-call-sheet',
  title: 'CSC call sheet',
  width: 132,
  permission: PERMISSIONS.CSC_CASE_READ,
  summary: `The cases to call: vehicle, customer and phone, service due, due date and mileage, last visit and follow-up dates. status: open (default) or all. ${DUE_NOTE}`,
  period: 'range',
  query: rangeQuery(FILTERS, { status: z.enum(['open', 'all']).default('open') }),
  filterKeys: FILTERS,
  params: [{ name: 'status', description: 'open (default): cases not yet visited or closed; all: every case.', schema: { type: 'string', enum: ['open', 'all'] } }],
  example: {
    rows: [{ caseId: 'case-uuid', dueDate: '2026-12-04', registration: 'LSD123XY', model: 'Sportage', serviceCode: '2F', customerName: 'Ada Obi', phone: '0803 000 0000', dueMileage: 5000, followUp1Date: '2026-11-19', followUp2Date: '2026-11-29', status: 'OPEN' }],
    groups: [],
    totals: { count: 1 },
  },
  async run(db, scope, query) {
    const { rows, truncated } = await loadCscRows(db, scope, { from: query.from, to: query.to, filters: query, where: query.status === 'open' ? Prisma.sql` AND c."status" = 'OPEN'` : undefined });
    return { rows, groups: [], totals: { count: rows.length }, breakdown: breakdownByService(rows), summary: { count: rows.length }, truncated };
  },
});

// ── 7. CSC follow-up report ────────────────────────────────────────────────────

const followUp = defineReport({
  slug: 'csc-followup',
  title: 'CSC follow-up report',
  width: 132,
  permission: PERMISSIONS.CSC_FOLLOWUP_REPORT_READ,
  summary: 'The cases due in a month with every contact made, the booking, the outcome (visited with the job, closed with the reason, or open), and a summary of cases generated, contacted, booked, visited and closed. previousMonth adds the month before (grouped by month).',
  period: 'none',
  query: z
    .object({
      branchId: branchParam,
      mode: modeParam,
      month: z.string().regex(MONTH_PATTERN, 'Use the format YYYY-MM'),
      previousMonth: flag.default(false),
      model: idList,
    })
    .strict(),
  filterKeys: ['model'],
  params: [
    { name: 'month', description: 'Due month, YYYY-MM.', required: true, schema: { type: 'string', example: '2026-11' } },
    { name: 'previousMonth', description: 'true: also the month before ("print previous month data").', schema: { type: 'boolean' } },
  ],
  example: {
    rows: [{ caseId: 'case-uuid', dueDate: '2026-11-12', registration: 'LSD123XY', serviceCode: 'RG', contacts: [{ stage: 'FIRST', slot: 1, date: '2026-10-28', person: 'Owner', remarks: 'Will come', doneBy: 'Ngozi Eze' }], bookingNumber: 'B/2026/0012', status: 'VISITED', visitJobNumber: '2026001410' }],
    groups: [{ key: '2026-11', label: '2026-11', count: 1, totals: { count: 1, contacted: 1, booked: 1, visited: 1, closed: 0, open: 0 } }],
    totals: { count: 1, contacted: 1, booked: 1, visited: 1, closed: 0, open: 0 },
  },
  async run(db, scope, query) {
    const range = monthRange(query.month, query.previousMonth);
    const { rows, truncated } = await loadCscRows(db, scope, { ...range, filters: query });
    const grouped = groupByMonth(rows);
    const totals = followUpTotals(rows);
    return { rows: grouped.rows, groups: grouped.groups, totals, summary: { ...totals, from: range.from, to: range.to }, breakdown: breakdownByService(rows), truncated };
  },
});

// ── 8. Vehicles not visited after due date ─────────────────────────────────────

const notVisited = defineReport({
  slug: 'csc-not-visited',
  title: 'Vehicles not visited after due date',
  width: 132,
  permission: PERMISSIONS.CSC_NOT_VISITED_REPORT_READ,
  summary: `Open cases whose due date and the match window after it have passed with no visit. daysNotVisited keeps cases at least that many days past due; onlyFollowedUp keeps cases with a 1st or 2nd follow-up contact. ${DUE_NOTE}`,
  period: 'range',
  query: rangeQuery(['model'], { daysNotVisited: z.coerce.number().int().min(0).max(3650).default(0), onlyFollowedUp: flag.default(false) }),
  filterKeys: ['model'],
  params: [
    { name: 'daysNotVisited', description: 'Minimum days past the due date (default 0).', schema: { type: 'integer' } },
    { name: 'onlyFollowedUp', description: 'true: only cases with a 1st or 2nd follow-up contact.', schema: { type: 'boolean' } },
  ],
  example: { rows: [{ caseId: 'case-uuid', dueDate: '2026-09-02', registration: 'ABJ456KL', serviceCode: '3F', daysOverdue: 79, followedUp: true }], groups: [], totals: { count: 1, followedUp: 1, booked: 0 } },
  async run(db, scope, query) {
    const today = localToday(scope.timeZone);
    const where = Prisma.sql` AND c."status" = 'OPEN' AND c."dueDate" + c."matchDaysAfter" < ${today}::date AND ${today}::date - c."dueDate" >= ${query.daysNotVisited}${
      query.onlyFollowedUp ? Prisma.sql` AND EXISTS (SELECT 1 FROM "CscContact" f WHERE f."caseId" = c."id" AND f."stage" IN ('FIRST', 'SECOND'))` : Prisma.empty
    }`;
    const { rows, truncated } = await loadCscRows(db, scope, { from: query.from, to: query.to, filters: query, where });
    const withDays = rows.map((row) => ({
      ...row,
      daysOverdue: Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${row.dueDate}T00:00:00Z`)) / 86_400_000),
      followedUp: row.contacts.some((contact) => contact.stage === 'FIRST' || contact.stage === 'SECOND'),
    }));
    const totals = { count: withDays.length, followedUp: withDays.filter((row) => row.followedUp).length, booked: withDays.filter((row) => !!row.bookingNumber).length };
    return { rows: withDays, groups: [], totals, summary: totals, breakdown: breakdownByService(withDays), truncated };
  },
});

// ── 9. No-show analysis ────────────────────────────────────────────────────────

const noShow = defineReport({
  slug: 'csc-no-show',
  title: 'No-show analysis',
  width: 132,
  permission: PERMISSIONS.CSC_NO_SHOW_REPORT_READ,
  summary: `Cases closed without a visit (a final closure reason), counted by reason and grouped service-wise or model-wise. mode: both (detail with summary), detail or summary. reason narrows to one closure reason. ${DUE_NOTE}`,
  period: 'range',
  query: rangeQuery(FILTERS, { reason: z.string().uuid().optional(), by: z.enum(['service', 'model']).default('model') }),
  filterKeys: FILTERS,
  params: [
    { name: 'reason', description: 'One closure reason id (omit = all).', schema: { type: 'string', format: 'uuid' } },
    { name: 'by', description: 'model (default) or service.', schema: { type: 'string', enum: ['service', 'model'] } },
  ],
  example: {
    rows: [{ caseId: 'case-uuid', dueDate: '2026-10-10', registration: 'LSD123XY', serviceCode: 'RG', closeReasonCode: 'R0004', closeReason: 'Vehicle sold', groupKey: 'model-uuid', reason_R0004: 1 }],
    groups: [{ key: 'model-uuid', label: 'Sportage', count: 1, totals: { count: 1, reason_R0004: 1 } }],
    columns: [{ key: 'reason_R0004', label: 'R0004 Vehicle sold', format: 'integer' }],
    totals: { count: 1, reason_R0004: 1 },
  },
  async run(db, scope, query) {
    const where = Prisma.sql` AND c."status" = 'CLOSED' AND c."closeReasonId" IS NOT NULL${query.reason ? Prisma.sql` AND c."closeReasonId" = ${query.reason}` : Prisma.empty}`;
    const [{ rows, truncated }, reasons] = await Promise.all([loadCscRows(db, scope, { from: query.from, to: query.to, filters: query, where }), loadCloseReasons(db)]);
    const columnsFor = usedReasons(rows, reasons);
    const result = buildNoShow(rows, columnsFor, query.by);
    return {
      rows: query.mode === 'summary' ? [] : result.rows,
      groups: result.groups,
      totals: result.totals,
      columns: columnsFor.map((reason) => ({ key: reasonKey(reason.code), label: `${reason.code} ${reason.description}`, format: 'integer' as const })),
      breakdown: columnsFor.map((reason) => ({ key: reason.code, label: `${reason.code} ${reason.description}`, count: result.totals[reasonKey(reason.code)] ?? 0 })),
      summary: { count: result.totals.count },
      truncated,
    };
  },
});

export const CSC_REPORTS = [callSheet, followUp, notVisited, noShow];

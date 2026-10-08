import fs from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';
import { canonicalJobStatus } from '../../service/job-card-workflow.service';
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES } from '../../../shared/constants/roles';
import { addDays, daysBetween, isValidDateString, localDateOf, localDayRange, startOfLocalDay } from './dates';
import { dateQuery, idList, rangeQuery } from './filters';
import { resolveReportScope } from './scope';
import { applyMode, capRows, groupRows, MAX_REPORT_ROWS, sumFields } from './shape';
import { canonicalStatusSql, inFilter, jobFilterSql, JOB_STATUS_ALIASES } from './sql';
import type { ReportDb, ReportScope } from './types';

const BRANCH = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const MODEL = '33333333-3333-4333-8333-333333333333';
const scope: ReportScope = { branchIds: [BRANCH], branch: null, timeZone: 'Africa/Lagos' };

describe('report dates (Africa/Lagos, UTC+1)', () => {
  it('starts a local day at 23:00 UTC the previous evening', () => {
    expect(startOfLocalDay('2026-10-06').toISOString()).toBe('2026-10-05T23:00:00.000Z');
  });

  it('covers from..to inclusive with an exclusive end', () => {
    const range = localDayRange('2026-10-01', '2026-10-06');
    expect(range.start.toISOString()).toBe('2026-09-30T23:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-10-06T23:00:00.000Z');
  });

  it('puts 23:30 UTC on the next local day', () => {
    expect(localDateOf(new Date('2026-10-05T23:30:00Z'))).toBe('2026-10-06');
    expect(localDateOf(new Date('2026-10-05T22:59:59Z'))).toBe('2026-10-05');
  });

  it('respects daylight saving where a zone has it', () => {
    expect(startOfLocalDay('2026-07-01', 'Europe/London').toISOString()).toBe('2026-06-30T23:00:00.000Z');
    expect(startOfLocalDay('2026-01-01', 'Europe/London').toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('validates and does day arithmetic across month and leap-year ends', () => {
    expect(isValidDateString('2028-02-29')).toBe(true);
    expect(isValidDateString('2026-02-29')).toBe(false);
    expect(isValidDateString('06/10/2026')).toBe(false);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-01-01', '2026-12-31')).toBe(364);
  });
});

describe('report query validation', () => {
  const schema = rangeQuery(['model', 'serviceType'], {});

  it('treats an omitted or empty filter as All', () => {
    expect(idList.parse(undefined)).toBeUndefined();
    expect(idList.parse('')).toBeUndefined();
    expect(schema.parse({ from: '2026-10-01', to: '2026-10-06' }).model).toBeUndefined();
  });

  it('accepts comma-separated and repeated ids, de-duplicated', () => {
    expect(idList.parse(`${MODEL},${BRANCH}`)).toEqual([MODEL, BRANCH]);
    expect(idList.parse([MODEL, `${MODEL},${BRANCH}`])).toEqual([MODEL, BRANCH]);
  });

  it('rejects non-uuid ids, reversed ranges, ranges over 366 days and unknown parameters', () => {
    expect(schema.safeParse({ from: '2026-10-01', to: '2026-10-06', model: 'drop table' }).success).toBe(false);
    expect(schema.safeParse({ from: '2026-10-06', to: '2026-10-01' }).success).toBe(false);
    expect(schema.safeParse({ from: '2025-01-01', to: '2026-01-02' }).success).toBe(false);
    expect(schema.safeParse({ from: '2025-01-01', to: '2026-01-01' }).success).toBe(true);
    expect(schema.safeParse({ from: '2026-10-01', to: '2026-10-06', technician: MODEL }).success).toBe(false);
  });

  it('defaults the mode to detail with summary', () => {
    expect(dateQuery([], {}).parse({ date: '2026-10-06' }).mode).toBe('both');
  });
});

describe('report SQL fragments', () => {
  it('leaves an All filter out of the query and turns a selection into IN (...)', () => {
    const column = Prisma.raw('j."serviceTypeId"');
    expect(inFilter(column, undefined).sql).toBe('');
    expect(inFilter(column, []).sql).toBe('');
    const selected = inFilter(column, [MODEL, BRANCH]);
    expect(selected.text).toBe(' AND j."serviceTypeId" IN ($1,$2)');
    expect(selected.values).toEqual([MODEL, BRANCH]);
  });

  it('binds selected values instead of interpolating them', () => {
    const fragment = jobFilterSql(scope, { model: [MODEL] });
    expect(fragment.sql).not.toContain(MODEL);
    expect(fragment.values).toEqual(expect.arrayContaining([BRANCH, MODEL]));
  });

  it('only filters the dimensions that were selected', () => {
    const all = jobFilterSql({ ...scope, branchIds: null }, {});
    expect(all.sql).not.toContain('mdl."id" IN');
    expect(all.sql).not.toContain('j."branchId" IN');
    expect(all.sql).toContain("<> 'CANCELLED'");
    expect(all.sql).toContain("<> 'PDI'");
    expect(jobFilterSql(scope, {}, { includePdi: true }).sql).not.toContain("<> 'PDI'");
  });

  it('maps legacy status text exactly like canonicalJobStatus()', () => {
    for (const [legacy, canonical] of Object.entries(JOB_STATUS_ALIASES)) expect(canonicalJobStatus(legacy)).toBe(canonical);
    for (const status of ['OPEN', 'IN_PROGRESS', 'QC', 'READY', 'BILLED', 'DELIVERED', 'CANCELLED']) expect(canonicalJobStatus(status)).toBe(status);
    expect(canonicalStatusSql(Prisma.raw('j."status"')).values).toEqual(Object.entries(JOB_STATUS_ALIASES).flat());
  });
});

describe('report shaping', () => {
  const rows = [
    { type: 'CREDIT', amount: 0.1 },
    { type: 'ZERO', amount: 0 },
    { type: 'CREDIT', amount: 0.2 },
  ];

  it('sums with decimal arithmetic', () => {
    expect(sumFields(rows, ['amount'])).toEqual({ amount: 0.3 });
  });

  it('groups rows in the given order with subtotals and keeps empty fixed groups', () => {
    const result = groupRows(
      rows,
      { key: (row) => row.type, label: (row) => row.type, order: ['CASH', 'CREDIT', 'ZERO'], always: [{ key: 'CASH', label: 'Cash' }] },
      ['amount'],
    );
    expect(result.groups.map((group) => [group.key, group.count, group.totals.amount])).toEqual([
      ['CASH', 0, 0],
      ['CREDIT', 2, 0.3],
      ['ZERO', 1, 0],
    ]);
    expect(result.rows.map((row) => row.groupKey)).toEqual(['CREDIT', 'CREDIT', 'ZERO']);
  });

  it('drops rows in summary mode only', () => {
    const body = { rows: [{ a: 1 }], groups: [], totals: { count: 1 } };
    expect(applyMode(body, 'summary').rows).toEqual([]);
    expect(applyMode(body, 'detail').rows).toHaveLength(1);
    expect(applyMode(body, 'both').rows).toHaveLength(1);
  });

  it('flags results that hit the row cap', () => {
    expect(capRows(new Array(MAX_REPORT_ROWS + 1).fill(0))).toEqual({ rows: new Array(MAX_REPORT_ROWS).fill(0), truncated: true });
    expect(capRows([1, 2]).truncated).toBe(false);
  });
});

describe('report branch scope', () => {
  const branchRow = { id: BRANCH, name: 'Abuja – Utako', address: null, city: null, state: null, phoneNumber: null };
  const db = { branch: { findUnique: jest.fn(async ({ where }: { where: { id: string } }) => (where.id === BRANCH ? branchRow : null)) } } as unknown as ReportDb;
  const user = (role: string, branchId: string | null = BRANCH) => ({ userId: 'u', email: 'e', role, permissions: [], branchId });

  it('keeps everyone else on their own branch', async () => {
    await expect(resolveReportScope(db, user(ROLES.SERVICE_ADVISOR))).resolves.toMatchObject({ branchIds: [BRANCH] });
    await expect(resolveReportScope(db, user(ROLES.SERVICE_ADVISOR), BRANCH)).resolves.toMatchObject({ branchIds: [BRANCH] });
  });

  it('refuses another branch or all branches for non-admins', async () => {
    await expect(resolveReportScope(db, user(ROLES.WORKSHOP_MANAGER), OTHER)).rejects.toThrow('own branch');
    await expect(resolveReportScope(db, user(ROLES.ACCOUNTANT), 'ALL')).rejects.toThrow('own branch');
    await expect(resolveReportScope(db, user(ROLES.BILLING_OFFICER, null))).rejects.toThrow('assigned to a branch');
  });

  it('lets Admin and SuperAdmin choose a branch or all branches', async () => {
    await expect(resolveReportScope(db, user(ROLES.ADMIN), 'ALL')).resolves.toMatchObject({ branchIds: null, branch: null });
    await expect(resolveReportScope(db, user(ROLES.SUPER_ADMIN, null))).resolves.toMatchObject({ branchIds: null });
    await expect(resolveReportScope(db, user(ROLES.ADMIN, OTHER), BRANCH)).resolves.toMatchObject({ branchIds: [BRANCH], branch: branchRow });
    await expect(resolveReportScope(db, user(ROLES.ADMIN), OTHER)).rejects.toThrow('does not exist');
  });
});

describe('report permission migration', () => {
  it('grants exactly what ROLE_PERMISSIONS grants for every report permission', () => {
    const migrations = path.resolve(__dirname, '../../../../prisma/migrations');
    const sql = fs
      .readdirSync(migrations)
      .filter((name) => name.includes('report'))
      .map((name) => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8'))
      .join('\n');
    const granted = new Set(Array.from(sql.matchAll(/\('(\w+)', '(report:[\w-]+)'\)/g), (m) => `${m[1]} ${m[2]}`));
    const reportPermissions = Object.values(PERMISSIONS).filter((p) => p.startsWith('report:') && p !== PERMISSIONS.RECEIPT_REGISTER_READ);
    const expected = new Set(
      Object.entries(ROLE_PERMISSIONS).flatMap(([role, permissions]) =>
        permissions.filter((p) => reportPermissions.includes(p as never)).map((p) => `${role} ${p}`),
      ),
    );
    expect(Array.from(granted).sort()).toEqual(Array.from(expected).sort());
    for (const permission of reportPermissions) expect(sql).toContain(`('${permission}', '`);
  });
});

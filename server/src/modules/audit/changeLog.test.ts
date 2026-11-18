jest.mock('../../prisma/client', () => ({ __esModule: true, default: {} }));

import { buildChangeLogWhere, CHANGE_LOG_ENTITIES } from './changeLog.service';

describe('Change log filters', () => {
  it('no filters: everything', () => {
    expect(buildChangeLogWhere({})).toEqual({});
  });

  it('record type group expands to its tables', () => {
    const where = buildChangeLogWhere({ group: 'TRANSACTION' }) as { AND: Array<{ entity: { in: string[] } }> };
    const tables = where.AND[0].entity.in;
    expect(tables).toContain('JobCard');
    expect(tables).toContain('Invoice');
    expect(tables).not.toContain('Customer');
    expect(tables.every((t) => CHANGE_LOG_ENTITIES[t].group === 'TRANSACTION')).toBe(true);
  });

  it('outside the app only: source DB', () => {
    expect(buildChangeLogWhere({ outsideAppOnly: true })).toEqual({ AND: [{ source: 'DB' }] });
  });

  it('record matches the id exactly or the label loosely', () => {
    expect(buildChangeLogWhere({ record: ' JC-0001 ' })).toEqual({
      AND: [{ OR: [{ recordId: 'JC-0001' }, { recordLabel: { contains: 'JC-0001', mode: 'insensitive' } }] }],
    });
  });

  it('branch scope keeps only changes by that branch\'s users (never outside-the-app rows, which have no user)', () => {
    const where = buildChangeLogWhere({ action: 'DELETE', userId: 'u1' }, ['u1', 'u2']);
    expect(where).toEqual({ AND: [{ userId: 'u1' }, { action: 'DELETE' }, { userId: { in: ['u1', 'u2'] } }] });
  });
});

import { billGroupOf, daysOpen, efficiency, freeServiceClaimable, isBeforeFirstService, mileageBandFor, promiseState, splitLabourLine, statusAsOn } from './calc';

const t = (iso: string) => new Date(iso);
const asOf = t('2026-09-30T23:00:00Z');

describe('statusAsOn', () => {
  const base = { createdAt: t('2026-09-28T08:00:00Z'), historyStatus: null, billedAsOf: false, deliveredAt: null, cancelledAt: null };

  it('is null before the job existed and OPEN without history', () => {
    expect(statusAsOn({ ...base, createdAt: t('2026-10-01T08:00:00Z') }, asOf)).toBeNull();
    expect(statusAsOn(base, asOf)).toBe('OPEN');
  });

  it('uses the latest history status, mapping legacy text', () => {
    expect(statusAsOn({ ...base, historyStatus: 'IN_PROGRESS' }, asOf)).toBe('IN_PROGRESS');
    expect(statusAsOn({ ...base, historyStatus: 'Quality Check' }, asOf)).toBe('QC');
    expect(statusAsOn({ ...base, historyStatus: 'Completed' }, asOf)).toBe('READY');
  });

  it('shows billed while a bill was active, and delivered once delivered', () => {
    expect(statusAsOn({ ...base, historyStatus: 'READY', billedAsOf: true }, asOf)).toBe('BILLED');
    expect(statusAsOn({ ...base, billedAsOf: true, deliveredAt: t('2026-09-30T10:00:00Z') }, asOf)).toBe('DELIVERED');
  });

  it('ignores a later delivery or cancellation', () => {
    expect(statusAsOn({ ...base, historyStatus: 'READY', deliveredAt: t('2026-10-02T10:00:00Z') }, asOf)).toBe('READY');
    expect(statusAsOn({ ...base, historyStatus: 'IN_PROGRESS', cancelledAt: t('2026-10-01T10:00:00Z') }, asOf)).toBe('IN_PROGRESS');
    expect(statusAsOn({ ...base, cancelledAt: t('2026-09-29T10:00:00Z') }, asOf)).toBe('CANCELLED');
  });

  it('uses the current status for jobs without any history once it was set', () => {
    const current = { status: 'In Progress', since: t('2026-09-29T08:00:00Z') };
    expect(statusAsOn({ ...base, current }, asOf)).toBe('IN_PROGRESS');
    expect(statusAsOn({ ...base, current }, t('2026-09-29T07:00:00Z'))).toBe('OPEN');
    expect(statusAsOn({ ...base, historyStatus: 'QC', current }, asOf)).toBe('QC');
  });

  it('does not trust a billed/delivered history entry once the bill or delivery is gone', () => {
    expect(statusAsOn({ ...base, historyStatus: 'BILLED' }, asOf)).toBe('OPEN');
    expect(statusAsOn({ ...base, historyStatus: 'Closed' }, asOf)).toBe('OPEN');
  });
});

describe('promiseState', () => {
  const now = t('2026-10-06T12:00:00Z');
  const promised = t('2026-10-06T13:00:00Z');

  it('marks in-work jobs overdue after the promise and due soon within the window', () => {
    expect(promiseState({ promisedAt: t('2026-10-06T11:40:00Z'), readyAt: null, deliveredAt: null }, now, 2)).toEqual({ state: 'OVERDUE', minutes: -20 });
    expect(promiseState({ promisedAt: promised, readyAt: null, deliveredAt: null }, now, 2)).toEqual({ state: 'DUE_SOON', minutes: 60 });
    expect(promiseState({ promisedAt: promised, readyAt: null, deliveredAt: null }, now, 0)).toEqual({ state: 'ON_TIME', minutes: 60 });
  });

  it('counts exactly at the window edge as due soon and exactly at the promise as not overdue', () => {
    expect(promiseState({ promisedAt: t('2026-10-06T14:00:00Z'), readyAt: null, deliveredAt: null }, now, 2).state).toBe('DUE_SOON');
    expect(promiseState({ promisedAt: now, readyAt: null, deliveredAt: null }, now, 2)).toEqual({ state: 'DUE_SOON', minutes: 0 });
  });

  it('judges ready and delivered jobs by when they were ready or delivered, not by now', () => {
    expect(promiseState({ promisedAt: promised, readyAt: t('2026-10-06T12:30:00Z'), deliveredAt: null }, t('2026-10-07T00:00:00Z'), 2).state).toBe('ON_TIME');
    expect(promiseState({ promisedAt: promised, readyAt: t('2026-10-06T14:00:00Z'), deliveredAt: null }, now, 2)).toEqual({ state: 'OVERDUE', minutes: -60 });
    expect(promiseState({ promisedAt: promised, readyAt: null, deliveredAt: t('2026-10-07T15:00:00Z') }, now, 2)).toEqual({ state: 'DELIVERED_LATE', minutes: -1560 });
    expect(promiseState({ promisedAt: promised, readyAt: null, deliveredAt: promised }, now, 2).state).toBe('DELIVERED_ON_TIME');
  });

  it('handles jobs without a promise time', () => {
    expect(promiseState({ promisedAt: null, readyAt: null, deliveredAt: null }, now, 2)).toEqual({ state: 'NO_PROMISE', minutes: null });
    expect(promiseState({ promisedAt: null, readyAt: null, deliveredAt: now }, now, 2).state).toBe('DELIVERED_ON_TIME');
  });
});

describe('daysOpen', () => {
  it('counts whole days and never goes negative', () => {
    expect(daysOpen(t('2026-09-22T08:00:00Z'), t('2026-09-30T23:00:00Z'))).toBe(8);
    expect(daysOpen(t('2026-09-30T08:00:00Z'), t('2026-09-30T07:00:00Z'))).toBe(0);
  });
});

describe('mileageBandFor', () => {
  const bands = [
    { id: 'a', label: '0–1,000 km', fromKm: 0, toKm: 1000 },
    { id: 'b', label: '1,001–5,000 km', fromKm: 1001, toKm: 5000 },
    { id: 'c', label: '5,000+ km', fromKm: 5001, toKm: null },
  ];

  it('puts a mileage in the band that contains it, edges included', () => {
    expect(mileageBandFor(0, bands)?.id).toBe('a');
    expect(mileageBandFor(1000, bands)?.id).toBe('a');
    expect(mileageBandFor(1001, bands)?.id).toBe('b');
    expect(mileageBandFor(5000, bands)?.id).toBe('b');
    expect(mileageBandFor(250_000, bands)?.id).toBe('c');
  });

  it('returns null for unrecorded mileage or a gap between bands', () => {
    expect(mileageBandFor(null, bands)).toBeNull();
    expect(mileageBandFor(undefined, bands)).toBeNull();
    expect(mileageBandFor(1500, [bands[0], { ...bands[1], fromKm: 2000 }])).toBeNull();
  });
});

describe('isBeforeFirstService', () => {
  const job = (iso: string, localDate: string) => ({ at: t(iso), localDate });

  it('counts jobs after the sale date and before the first free service', () => {
    expect(isBeforeFirstService(job('2026-04-02T09:00:00Z', '2026-04-02'), '2026-03-12', t('2026-05-01T09:00:00Z'))).toBe(true);
    expect(isBeforeFirstService(job('2026-04-02T09:00:00Z', '2026-04-02'), '2026-03-12', null)).toBe(true);
  });

  it('excludes jobs on or before the sale date, and from the first free service on', () => {
    expect(isBeforeFirstService(job('2026-03-12T09:00:00Z', '2026-03-12'), '2026-03-12', null)).toBe(false);
    expect(isBeforeFirstService(job('2026-05-01T09:00:00Z', '2026-05-01'), '2026-03-12', t('2026-05-01T09:00:00Z'))).toBe(false);
    expect(isBeforeFirstService(job('2026-06-01T09:00:00Z', '2026-06-01'), '2026-03-12', t('2026-05-01T09:00:00Z'))).toBe(false);
    expect(isBeforeFirstService(job('2026-04-02T09:00:00Z', '2026-04-02'), null, null)).toBe(false);
  });
});

describe('splitLabourLine and efficiency', () => {
  const line = { standardHours: 2, hours: 1.5, amount: 100_000 };

  it('splits evenly when no shares are recorded, adding back up to the line', () => {
    const shares = splitLabourLine({ standardHours: 1, hours: 1, amount: 100 }, [
      { technicianId: 'a', sharePercent: null },
      { technicianId: 'b', sharePercent: null },
      { technicianId: 'c', sharePercent: null },
    ]);
    expect(shares.map((s) => s.amount)).toEqual([33.33, 33.33, 33.34]);
    expect(shares.map((s) => s.chargedHours)).toEqual([0.33, 0.33, 0.34]);
    expect(shares.reduce((sum, s) => sum + s.amount, 0)).toBeCloseTo(100, 10);
    expect(shares.map((s) => s.appliedPercent)).toEqual([33.33, 33.33, 33.33]);
  });

  it('uses recorded shares when every technician has one', () => {
    const shares = splitLabourLine(line, [
      { technicianId: 'a', sharePercent: 75 },
      { technicianId: 'b', sharePercent: 25 },
    ]);
    expect(shares.map((s) => [s.standardHours, s.chargedHours, s.amount])).toEqual([[1.5, 1.13, 75_000], [0.5, 0.37, 25_000]]);
  });

  it('falls back to an even split when only some shares are recorded', () => {
    const shares = splitLabourLine(line, [
      { technicianId: 'a', sharePercent: 75 },
      { technicianId: 'b', sharePercent: null },
    ]);
    expect(shares.map((s) => s.amount)).toEqual([50_000, 50_000]);
  });

  it('keeps unknown standard hours unknown and returns nothing without technicians', () => {
    expect(splitLabourLine({ standardHours: null, hours: 2, amount: 10 }, [{ technicianId: 'a', sharePercent: null }])[0].standardHours).toBeNull();
    expect(splitLabourLine(line, [])).toEqual([]);
  });

  it('measures efficiency as standard ÷ charged hours', () => {
    expect(efficiency(168, 150)).toBe(112);
    expect(efficiency(10, 12)).toBe(83);
    expect(efficiency(5, 0)).toBeNull();
  });
});

describe('billing rules', () => {
  it('puts zero-value bills in their own group', () => {
    expect(billGroupOf(0)).toBe('ZERO');
    expect(billGroupOf(0.004)).toBe('ZERO');
    expect(billGroupOf(0.01)).toBe('BILLED');
    expect(billGroupOf(5_412_560)).toBe('BILLED');
  });

  it('claims the free service charge plus warranty labour and parts', () => {
    expect(freeServiceClaimable({ serviceCharge: 30_000, warrantyLabour: 7_500.255, warrantyParts: 4_499.745 })).toBe(42_000);
    expect(freeServiceClaimable({ serviceCharge: null, warrantyLabour: 0, warrantyParts: 777 })).toBe(777);
  });
});

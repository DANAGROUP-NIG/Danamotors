import { daysOpen, promiseState, statusAsOn } from './calc';

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

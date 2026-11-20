import { cleanRemarks, entryProblem, LATE_REASONS, lateness, reasonProblem } from './late-delivery.logic';

const TZ = 'Africa/Lagos'; // UTC+1, no DST
const at = (iso: string) => new Date(iso);

describe('lateness', () => {
  it('is on time when delivered before or exactly at the promise', () => {
    expect(lateness(at('2026-01-02T16:00:00Z'), at('2026-01-02T15:59:00Z'), TZ)).toEqual({ kind: null, daysLate: 0, minutesLate: 0 });
    expect(lateness(at('2026-01-02T16:00:00Z'), at('2026-01-02T16:00:00Z'), TZ).kind).toBeNull();
    expect(lateness(at('2026-01-03T16:00:00Z'), at('2026-01-02T10:00:00Z'), TZ).kind).toBeNull();
  });

  it('is late by time when delivered later on the promised day', () => {
    expect(lateness(at('2026-01-26T16:00:00Z'), at('2026-01-26T17:10:00Z'), TZ)).toEqual({ kind: 'TIME', daysLate: 0, minutesLate: 70 });
  });

  it('rounds part minutes up', () => {
    expect(lateness(at('2026-01-26T16:00:00Z'), at('2026-01-26T16:00:20Z'), TZ)).toEqual({ kind: 'TIME', daysLate: 0, minutesLate: 1 });
  });

  it('is late by date when delivered on a later calendar day, counting calendar days', () => {
    // Promised 17:00 on 2 Jan, delivered 09:00 on 4 Jan (local) = 2 days late.
    expect(lateness(at('2026-01-02T16:00:00Z'), at('2026-01-04T08:00:00Z'), TZ)).toMatchObject({ kind: 'DATE', daysLate: 2 });
  });

  it('uses Lagos days: 00:30 local the next day is late by date, though still the same UTC day', () => {
    // Promised 23:00 local on 2 Jan (22:00Z); delivered 00:30 local on 3 Jan (23:30Z on 2 Jan).
    expect(lateness(at('2026-01-02T22:00:00Z'), at('2026-01-02T23:30:00Z'), TZ)).toMatchObject({ kind: 'DATE', daysLate: 1, minutesLate: 90 });
  });

  it('uses Lagos days: 23:30 UTC on the promised UTC day before local midnight is late by time', () => {
    // Promised 18:00 local (17:00Z); delivered 23:50 local (22:50Z) the same local day.
    expect(lateness(at('2026-01-02T17:00:00Z'), at('2026-01-02T22:50:00Z'), TZ)).toMatchObject({ kind: 'TIME', daysLate: 0 });
  });
});

describe('entryProblem', () => {
  const job = { jobNumber: 'J1', status: 'DELIVERED', promisedAt: at('2026-01-02T16:00:00Z'), deliveredAt: at('2026-01-03T09:00:00Z') };

  it('opens a job late of the screen kind', () => {
    expect(entryProblem(job, 'DATE', 'DELIVERED', TZ)).toBeNull();
  });

  it('refuses the other screen with a pointer to the right one', () => {
    expect(entryProblem(job, 'TIME', 'DELIVERED', TZ)).toMatch(/promise date details entry/);
    const sameDay = { ...job, deliveredAt: at('2026-01-02T17:00:00Z') };
    expect(entryProblem(sameDay, 'DATE', 'DELIVERED', TZ)).toMatch(/promise time details entry/);
  });

  it('refuses jobs on time, not delivered, without a promise or cancelled', () => {
    expect(entryProblem({ ...job, deliveredAt: at('2026-01-02T15:00:00Z') }, 'DATE', 'DELIVERED', TZ)).toBe('Job J1 was not delivered late.');
    expect(entryProblem({ ...job, deliveredAt: null }, 'DATE', 'READY', TZ)).toMatch(/not been delivered/);
    expect(entryProblem({ ...job, promisedAt: null }, 'DATE', 'DELIVERED', TZ)).toMatch(/no promised/);
    expect(entryProblem(job, 'DATE', 'CANCELLED', TZ)).toMatch(/cancelled/);
  });
});

describe('reasonProblem', () => {
  const options = LATE_REASONS.map((_, index) => ({ id: `r${index + 1}`, active: true }));

  it('accepts one to six distinct reasons', () => {
    expect(reasonProblem(['r1'], options, [])).toBeNull();
    expect(reasonProblem(['r1', 'r2', 'r3', 'r4', 'r5', 'r6'], options, [])).toBeNull();
  });

  it('refuses none, seven, duplicates and unknown ids', () => {
    expect(reasonProblem([], options, [])).toMatch(/at least one/);
    expect(reasonProblem(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'], [...options, { id: 'r7', active: true }], [])).toMatch(/At most 6/);
    expect(reasonProblem(['r1', 'r1'], options, [])).toMatch(/only once/);
    expect(reasonProblem(['x'], options, [])).toMatch(/reason list/);
  });

  it('keeps a retired reason only where the job already has it', () => {
    const retired = [...options, { id: 'old', active: false }];
    expect(reasonProblem(['old'], retired, [])).toMatch(/no longer in use/);
    expect(reasonProblem(['old', 'r2'], retired, ['old'])).toBeNull();
  });
});

describe('cleanRemarks', () => {
  it('trims and turns blanks into null', () => {
    expect(cleanRemarks('  Parts late  ')).toBe('Parts late');
    expect(cleanRemarks('   ')).toBeNull();
    expect(cleanRemarks(undefined)).toBeNull();
  });
});

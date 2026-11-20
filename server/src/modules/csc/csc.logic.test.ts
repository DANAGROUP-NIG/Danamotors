import {
  contactProblem,
  daysOverdue,
  followUpBlocked,
  followUpDates,
  isNotVisited,
  matchingVisit,
  nextDue,
  notVisitedCutoff,
  pickVersion,
  ruleProblem,
  startDateOf,
  visitTiming,
  type ScheduleRule,
  type Visit,
} from './csc.logic';

// Legacy CSCMaster values (identical for every model).
const rule = (code: string, dueDays: number, dueKm: number, rotationDays: number, rotationKm: number, variationDays: number, effectiveDate = '2010-09-13'): ScheduleRule => ({
  id: `${code}-${effectiveDate}`, serviceTypeId: `st-${code}`, code, effectiveDate, dueDays, dueKm, rotationDays, rotationKm,
  followUp1Days: 15, followUp2Days: 5, variationDays, variationKm: 0, matchDaysBefore: 10, matchDaysAfter: 10, notVisitedMonths: 48,
});
const LEGACY = [rule('1F', 30, 1000, 30, 1000, 15), rule('2F', 90, 5000, 90, 5000, 45), rule('3F', 180, 10000, 180, 10000, 90), rule('RG', 270, 15000, 90, 5000, 45)];
const schedule = pickVersion(LEGACY, '2026-01-01');
const visit = (date: string, code: string | null, mileage: number | null = null, id = `job-${date}`): Visit => ({ jobCardId: id, date, mileage, serviceTypeId: code ? `st-${code}` : null });

describe('pickVersion', () => {
  const v2 = LEGACY.map((r) => ({ ...r, effectiveDate: '2024-01-01', dueDays: r.dueDays + 1 }));
  it('takes the latest version effective on or before the sale date', () => {
    expect(pickVersion([...LEGACY, ...v2], '2025-05-01')[0].effectiveDate).toBe('2024-01-01');
    expect(pickVersion([...LEGACY, ...v2], '2023-12-31')[0].effectiveDate).toBe('2010-09-13');
  });
  it('falls back to the earliest version for vehicles sold before any version', () => {
    expect(pickVersion([...LEGACY, ...v2], '2001-01-01')[0].effectiveDate).toBe('2010-09-13');
  });
  it('orders the services by due days', () => {
    expect(pickVersion([...LEGACY].reverse(), '2026-01-01').map((r) => r.code)).toEqual(['1F', '2F', '3F', 'RG']);
  });
  it('is empty without rules', () => expect(pickVersion([], '2026-01-01')).toEqual([]));
});

describe('startDateOf', () => {
  it('prefers the sale date, then invoice, PDI and the first visit', () => {
    expect(startDateOf({ saleDate: '2026-01-05', saleInvoiceDate: '2026-01-01', pdiDate: null, visits: [] })).toBe('2026-01-05');
    expect(startDateOf({ saleDate: null, saleInvoiceDate: null, pdiDate: '2025-12-20', visits: [] })).toBe('2025-12-20');
    expect(startDateOf({ saleDate: null, saleInvoiceDate: null, pdiDate: null, visits: [visit('2026-03-01', 'RR'), visit('2025-06-01', 'RR')] })).toBe('2025-06-01');
    expect(startDateOf({ saleDate: null, saleInvoiceDate: null, pdiDate: null, visits: [] })).toBeNull();
  });
});

describe('nextDue', () => {
  const start = '2026-01-01';
  it('a new vehicle is due for 1F 30 days after sale', () => {
    expect(nextDue({ schedule, start, visits: [], asOf: '2026-01-15' })).toMatchObject({ rule: { code: '1F' }, dueDate: '2026-01-31', dueMileage: 1000 });
  });
  it('after 1F comes 2F, counted from the sale date', () => {
    const due = nextDue({ schedule, start, visits: [visit('2026-02-01', '1F', 980)], asOf: '2026-03-01' });
    expect(due).toMatchObject({ rule: { code: '2F' }, dueDate: '2026-04-01', dueMileage: 5000 });
  });
  it('a free service lapses after its variation and the next one is due', () => {
    // 1F due 2026-01-31, lapses after 2026-02-15; never came → 2F (due 2026-04-01).
    expect(nextDue({ schedule, start, visits: [], asOf: '2026-03-01' })).toMatchObject({ rule: { code: '2F' }, dueDate: '2026-04-01' });
  });
  it('a free service still inside its variation stays due (the case was for the earlier period)', () => {
    expect(nextDue({ schedule, start, visits: [], asOf: '2026-02-10' })).toMatchObject({ rule: { code: '1F' }, dueDate: '2026-01-31' });
  });
  it('a late visit for another reason skips free services that lapsed before it', () => {
    // Running repair on 2026-05-30: 1F and 2F (lapsed 2026-05-16) are skipped → 3F due 2026-06-30.
    expect(nextDue({ schedule, start, visits: [visit('2026-05-30', 'RR', 4000)], asOf: '2026-05-01' })).toMatchObject({ rule: { code: '3F' }, dueDate: '2026-06-30' });
  });
  it('after the free services, RG is due 270 days after sale', () => {
    expect(nextDue({ schedule, start, visits: [visit('2026-07-01', '3F', 9800)], asOf: '2026-08-01' })).toMatchObject({ rule: { code: 'RG' }, dueDate: '2026-09-28', dueMileage: 15000 });
  });
  it('after an RG, the next RG is its rotation from that visit and reading', () => {
    expect(nextDue({ schedule, start, visits: [visit('2026-10-01', 'RG', 15200)], asOf: '2026-11-01' })).toMatchObject({ rule: { code: 'RG' }, dueDate: '2026-12-30', dueMileage: 20200 });
  });
  it('a missed RG rolls forward by rotation until it has not lapsed', () => {
    // RG done 2025-01-01; due 2025-04-01, then every 90 days → first not lapsed for asOf 2026-01-01 is 2025-12-27.
    const due = nextDue({ schedule, start: '2023-01-01', visits: [visit('2025-01-01', 'RG', 40000)], asOf: '2026-01-01' });
    expect(due).toMatchObject({ rule: { code: 'RG' }, dueDate: '2025-12-27', dueMileage: 60000 });
  });
  it('an unknown reading at the last RG leaves the due mileage blank', () => {
    expect(nextDue({ schedule, start, visits: [visit('2026-10-01', 'RG', null)], asOf: '2026-11-01' })?.dueMileage).toBeNull();
  });
  it('a paid RG done before the free services moves straight to RG rotation', () => {
    expect(nextDue({ schedule, start, visits: [visit('2026-01-20', 'RG', 600)], asOf: '2026-02-01' })).toMatchObject({ rule: { code: 'RG' }, dueDate: '2026-04-20' });
  });
  it('returns null without a schedule', () => expect(nextDue({ schedule: [], start, visits: [], asOf: start })).toBeNull());
});

describe('dates and windows', () => {
  it('follow-up dates are 15 and 5 days before the due date', () => {
    expect(followUpDates('2026-04-01', LEGACY[0])).toEqual({ followUp1Date: '2026-03-17', followUp2Date: '2026-03-27' });
  });
  it('the not-visited cutoff is N months before, clamped to the month end', () => {
    expect(notVisitedCutoff('2026-11-20', 48)).toBe('2022-11-20');
    expect(notVisitedCutoff('2026-03-31', 1)).toBe('2026-02-28');
  });
  it('the earliest job from 10 days before the due date is the visit', () => {
    const visits = [visit('2026-03-20', 'RR'), visit('2026-03-25', '2F'), visit('2026-04-20', 'RR')];
    expect(matchingVisit(visits, '2026-04-01', 10)?.date).toBe('2026-03-25');
    expect(matchingVisit([visit('2026-03-20', 'RR')], '2026-04-01', 10)).toBeNull();
  });
  it('classifies the visit as early, on time or late', () => {
    expect(visitTiming('2026-03-25', '2026-04-01', 10)).toBe('EARLY');
    expect(visitTiming('2026-04-11', '2026-04-01', 10)).toBe('ON_TIME');
    expect(visitTiming('2026-04-12', '2026-04-01', 10)).toBe('LATE');
  });
  it('an open case is not visited once the window after the due date has passed', () => {
    expect(isNotVisited({ status: 'OPEN', dueDate: '2026-04-01', matchDaysAfter: 10 }, '2026-04-11')).toBe(false);
    expect(isNotVisited({ status: 'OPEN', dueDate: '2026-04-01', matchDaysAfter: 10 }, '2026-04-12')).toBe(true);
    expect(isNotVisited({ status: 'CLOSED', dueDate: '2026-04-01', matchDaysAfter: 10 }, '2026-06-01')).toBe(false);
    expect(daysOverdue('2026-04-01', '2026-04-12')).toBe(11);
    expect(daysOverdue('2026-04-01', '2026-03-01')).toBe(0);
  });
});

describe('follow-up entry', () => {
  const today = '2026-11-20';
  it('accepts up to three distinct lines dated today or earlier', () => {
    expect(contactProblem([{ slot: 1, contactDate: today, contactPerson: 'Owner' }, { slot: 2, contactDate: '2026-11-18', remarks: 'No answer' }], today)).toBeNull();
  });
  it('rejects duplicates, bad slots, future dates and empty lines', () => {
    expect(contactProblem([{ slot: 1, contactDate: today, remarks: 'a' }, { slot: 1, contactDate: today, remarks: 'b' }], today)).toMatch(/once/);
    expect(contactProblem([{ slot: 4, contactDate: today, remarks: 'a' }], today)).toMatch(/1 to 3/);
    expect(contactProblem([{ slot: 1, contactDate: '2026-11-21', remarks: 'a' }], today)).toMatch(/future/);
    expect(contactProblem([{ slot: 1, contactDate: today, contactPerson: ' ', remarks: '' }], today)).toMatch(/person spoken to/);
  });
  it('only open cases take entries', () => {
    expect(followUpBlocked('OPEN')).toBeNull();
    expect(followUpBlocked('VISITED')).toMatch(/visited/);
    expect(followUpBlocked('CLOSED')).toMatch(/closed/);
  });
  it('checks the rule numbers together', () => {
    expect(ruleProblem({ dueDays: 90, rotationDays: 90, followUp1Days: 15, followUp2Days: 5 })).toBeNull();
    expect(ruleProblem({ dueDays: 90, rotationDays: 90, followUp1Days: 5, followUp2Days: 15 })).toMatch(/1st follow-up/);
    expect(ruleProblem({ dueDays: 10, rotationDays: 90, followUp1Days: 15, followUp2Days: 5 })).toMatch(/more than the due days/);
    expect(ruleProblem({ dueDays: 90, rotationDays: 0, followUp1Days: 15, followUp2Days: 5 })).toMatch(/Rotation/);
  });
});

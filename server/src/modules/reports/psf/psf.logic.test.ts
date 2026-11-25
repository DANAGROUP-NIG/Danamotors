import type { PsfStatus } from '@prisma/client';
import { inModelRange, labourSection, letterGroups, letterRows, mailingAddress, modelRows, psfCounts, statusRows, type LetterJob } from './psf.logic';

const jobs = (statuses: (PsfStatus | null)[], model: string | null = 'Rio') => statuses.map((status, index) => ({ jobId: `j${index}`, model, status }));

describe('psfCounts', () => {
  it('counts statuses, followed up, contacted and not contacted', () => {
    const counts = psfCounts(jobs(['SATISFIED', 'SATISFIED', 'SATISFIED', 'DISSATISFIED', 'NO_PHONE', 'NOT_AVAILABLE', 'CLOSED', null, null, null]));
    expect(counts).toMatchObject({
      delivered: 10,
      followedUp: 7,
      satisfied: 3,
      dissatisfied: 1,
      noPhone: 1,
      notAvailable: 1,
      closed: 1,
      notFollowed: 3,
      contacted: 4,
      notContacted: 5,
      followedUpPct: 70,
      satisfactionPct: 75,
    });
  });

  it('is all zeros for no jobs', () => {
    expect(psfCounts([])).toMatchObject({ delivered: 0, followedUpPct: 0, satisfactionPct: 0 });
  });
});

describe('statusRows', () => {
  it('lists the five statuses in legend order, then not followed up', () => {
    const rows = statusRows(psfCounts(jobs(['SATISFIED', 'DISSATISFIED', null, null])));
    expect(rows.map((row) => [row.code, row.jobs, row.deliveredPct, row.followedUpPct])).toEqual([
      ['1', 1, 25, 50],
      ['2', 1, 25, 50],
      ['3', 0, 0, 0],
      ['4', 0, 0, 0],
      ['5', 0, 0, 0],
      ['', 2, 50, null],
    ]);
  });
});

describe('labourSection', () => {
  it('groups last-call lines by code, service lines first, with satisfaction %', () => {
    const section = labourSection([
      { kind: 'LABOUR', code: 'AC', description: 'AC regas', status: 'DISSATISFIED' },
      { kind: 'SERVICE', code: 'RR', description: 'Running repair', status: 'SATISFIED' },
      { kind: 'LABOUR', code: 'AC', description: 'AC regas', status: 'SATISFIED' },
      { kind: 'LABOUR', code: 'AC', description: 'AC regas', status: 'NOT_AVAILABLE' },
    ]);
    expect(section.rows.map((row) => [row.code, row.lines, row.satisfied, row.dissatisfied, row.notAvailable, row.satisfactionPct])).toEqual([
      ['RR', 1, 1, 0, 0, 100],
      ['AC', 3, 1, 1, 1, 50],
    ]);
    expect(section.total).toMatchObject({ lines: 4, satisfied: 2, dissatisfied: 1, satisfactionPct: 66.67 });
  });
});

describe('model-wise analysis', () => {
  it('gives one row per model in name order, model not set last, totalling the plain analysis', () => {
    const all = [...jobs(['SATISFIED', null], 'sportage'), ...jobs(['DISSATISFIED'], 'Rio'), ...jobs(['SATISFIED'], null)];
    const rows = modelRows(all);
    expect(rows.map((row) => [row.model, row.delivered, row.satisfied])).toEqual([
      ['Rio', 1, 0],
      ['sportage', 2, 1],
      ['Model not set', 1, 1],
    ]);
    const plain = psfCounts(all);
    expect(rows.reduce((sum, row) => sum + Number(row.delivered), 0)).toBe(plain.delivered);
    expect(rows.reduce((sum, row) => sum + Number(row.satisfied), 0)).toBe(plain.satisfied);
  });

  it('keeps models between the two names, inclusive and case-insensitive', () => {
    expect(inModelRange('Rio', 'rio', 'Sportage')).toBe(true);
    expect(inModelRange('Sorento', 'Rio', 'Sportage')).toBe(true);
    expect(inModelRange('Picanto', 'Rio', 'Sportage')).toBe(false);
    expect(inModelRange(null, 'Rio', null)).toBe(false);
    expect(inModelRange(null, null, null)).toBe(true);
    expect(inModelRange('Cerato', null, 'Rio')).toBe(true);
  });
});

describe('follow-up letter', () => {
  it('puts a job in the right groups', () => {
    expect(letterGroups('NO_PHONE', true)).toEqual(['NO_PHONE']);
    expect(letterGroups('NOT_AVAILABLE', true)).toEqual(['NOT_AVAILABLE']);
    expect(letterGroups(null, true)).toEqual(['NOT_FOLLOWED_UP']);
    expect(letterGroups(null, false)).toEqual(['NO_PHONE', 'NOT_FOLLOWED_UP']);
    expect(letterGroups('SATISFIED', true)).toEqual([]);
    expect(letterGroups('CLOSED', false)).toEqual([]);
  });

  const base: Omit<LetterJob, 'jobId' | 'jobNumber' | 'deliveredAt' | 'status' | 'customerId' | 'customer'> = {
    registration: 'LSL-1', model: 'Rio', serviceType: 'Paid service', customerAddress: '1 Road, Ikeja', customerCity: 'Ikeja', hasPhone: true,
    branchName: 'Main', branchAddress: null, branchPhone: null, branchEmail: null,
  };
  const job = (id: string, customerId: string, status: PsfStatus | null, day: string, extra: Partial<LetterJob> = {}): LetterJob => ({
    ...base, jobId: id, jobNumber: id, deliveredAt: new Date(`${day}T10:00:00Z`), status, customerId, customer: `Customer ${customerId}`, ...extra,
  });

  it('prints each customer once, for the chosen groups, latest job first', () => {
    const rows = letterRows(
      [
        job('J1', 'b', 'NOT_AVAILABLE', '2026-11-02'),
        job('J2', 'b', null, '2026-11-05'),
        job('J3', 'a', 'SATISFIED', '2026-11-03'),
        job('J4', 'c', 'NO_PHONE', '2026-11-04', { customerAddress: null }),
      ],
      new Set(['NO_PHONE', 'NOT_AVAILABLE', 'NOT_FOLLOWED_UP']),
    );
    expect(rows.map((row) => [row.customerId, row.jobCount, row.jobNumber, row.groups, row.mailable])).toEqual([
      ['b', 2, 'J2', ['NOT_AVAILABLE', 'NOT_FOLLOWED_UP'], true],
      ['c', 1, 'J4', ['NO_PHONE'], false],
    ]);
  });

  it('leaves out jobs outside the chosen groups', () => {
    const rows = letterRows([job('J1', 'b', 'NOT_AVAILABLE', '2026-11-02'), job('J2', 'c', null, '2026-11-05')], new Set(['NOT_AVAILABLE']));
    expect(rows.map((row) => row.customerId)).toEqual(['b']);
  });

  it('needs a street address to post a letter', () => {
    expect(mailingAddress({ address: ' 12 Allen Avenue ', city: 'Ikeja', state: 'Lagos' })).toBe('12 Allen Avenue, Ikeja, Lagos');
    expect(mailingAddress({ address: '', city: 'Ikeja', state: 'Lagos' })).toBeNull();
    expect(mailingAddress({ address: '5 Road', city: null, state: ' ' })).toBe('5 Road');
  });
});

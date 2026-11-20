import { buildAnalysis, buildDateSummary, repeatPercent, selectListRows, statusTotals, type RepeatReportRow, type RepeatReviewStatus } from './repeat.logic';

const reasons = [
  { id: 'r1', code: '1', description: 'Component failure' },
  { id: 'r4', code: '4', description: 'Workmanship problem' },
];

let seq = 0;
function row(status: RepeatReviewStatus, overrides: Partial<RepeatReportRow> = {}): RepeatReportRow {
  seq += 1;
  return {
    repeatId: `rep-${seq}`, jobId: `job-${seq}`, jobNumber: `J${seq}`, jobDate: new Date('2026-07-16T09:00:00Z'), day: '2026-07-16',
    modelId: 'seltos', model: 'Seltos', variantId: 'seltos-ex', variant: 'Seltos EX',
    reviewStatus: status, previousEngineerId: 'eng-a', previousEngineer: 'Engineer A', previousServiceAdvisorId: 'sa-a', previousServiceAdvisor: 'Advisor A',
    reasons: [], ...overrides,
  };
}

describe('repeat list options', () => {
  const rows = [row('PENDING_REVIEW'), row('CONFIRMED'), row('NOT_REPEAT')];

  it('lists only repeats that count by default', () => {
    expect(selectListRows(rows, { includeNotRepeat: false, onlyNotRepeat: false }).map((r) => r.reviewStatus)).toEqual(['PENDING_REVIEW', 'CONFIRMED']);
  });

  it('includes "not a repeat" jobs on request', () => {
    expect(selectListRows(rows, { includeNotRepeat: true, onlyNotRepeat: false })).toHaveLength(3);
  });

  it('isolates "not a repeat" jobs, overriding include', () => {
    expect(selectListRows(rows, { includeNotRepeat: false, onlyNotRepeat: true }).map((r) => r.reviewStatus)).toEqual(['NOT_REPEAT']);
    expect(selectListRows(rows, { includeNotRepeat: true, onlyNotRepeat: true })).toHaveLength(1);
  });

  it('totals repeats, pending, confirmed and not a repeat', () => {
    expect(statusTotals(rows)).toEqual({ count: 3, repeats: 2, pending: 1, confirmed: 1, notRepeat: 1 });
  });
});

describe('repeat analysis', () => {
  const rows = [
    row('CONFIRMED', { reasons: [reasons[0], reasons[1]] }),
    row('CONFIRMED', { reasons: [reasons[1]], previousEngineerId: 'eng-b', previousEngineer: 'Engineer B' }),
    row('PENDING_REVIEW', { modelId: 'rio', model: 'Rio', variantId: 'rio-at', variant: 'Rio AT' }),
    row('NOT_REPEAT', { reasons: [] }),
  ];
  const modelJobs = [
    { key: 'seltos', label: 'Seltos', jobs: 20 },
    { key: 'rio', label: 'Rio', jobs: 10 },
    { key: 'sportage', label: 'Sportage', jobs: 5 },
  ];

  it('counts jobs, repeats (not "not a repeat"), repeat % and each reason per group', () => {
    const result = buildAnalysis({ rows, jobCounts: modelJobs, reasons, by: 'model', mode: 'both' });
    const seltos = result.groups.find((g) => g.key === 'seltos')!;
    expect(seltos.totals).toEqual({ count: 2, jobs: 20, repeats: 2, repeatPct: 10, pending: 0, confirmed: 2, reason_1: 1, reason_4: 2 });
    expect(result.groups.find((g) => g.key === 'rio')!.totals).toMatchObject({ jobs: 10, repeats: 1, repeatPct: 10, pending: 1, reason_1: 0 });
    // A group with jobs and no repeats still shows in the summary at 0 %.
    expect(result.groups.find((g) => g.key === 'sportage')!.totals).toMatchObject({ jobs: 5, repeats: 0, repeatPct: 0 });
    expect(result.totals).toEqual({ count: 3, jobs: 35, repeats: 3, repeatPct: 8.57, pending: 1, confirmed: 2, reason_1: 1, reason_4: 2 });
    expect(result.rows.map((r) => r.reviewStatus)).not.toContain('NOT_REPEAT');
  });

  it('flags each detail row under its reason columns', () => {
    const detail = buildAnalysis({ rows, jobCounts: modelJobs, reasons, by: 'model', mode: 'detail' });
    expect(detail.rows[0]).toMatchObject({ groupKey: 'seltos', repeats: 1, confirmed: 1, reason_1: 1, reason_4: 1 });
    // Detail leaves out groups without repeats.
    expect(detail.groups.map((g) => g.key)).toEqual(['seltos', 'rio']);
  });

  it('groups by the previous engineer: repeats against them over the jobs they handled', () => {
    const result = buildAnalysis({ rows, jobCounts: [{ key: 'eng-a', label: 'Engineer A', jobs: 8 }, { key: 'eng-c', label: 'Engineer C', jobs: 4 }], reasons, by: 'engineer', mode: 'summary' });
    expect(result.groups.map((g) => [g.key, g.totals.jobs, g.totals.repeats, g.totals.repeatPct])).toEqual([
      ['eng-a', 8, 2, 25],
      ['eng-b', 0, 1, 0],
      ['eng-c', 4, 0, 0],
    ]);
  });

  it('puts repeats without the person in a "none" group', () => {
    const result = buildAnalysis({ rows: [row('CONFIRMED', { previousServiceAdvisorId: null, previousServiceAdvisor: null })], jobCounts: [], reasons, by: 'serviceAdvisor', mode: 'both' });
    expect(result.groups).toEqual([expect.objectContaining({ key: 'none', label: 'No service advisor', count: 1 })]);
  });
});

describe('date-wise summary', () => {
  it('gives jobs, repeats, repeat % and review status per date with a grand total', () => {
    const rows = [row('CONFIRMED', { day: '2026-07-16' }), row('PENDING_REVIEW', { day: '2026-07-16' }), row('NOT_REPEAT', { day: '2026-07-17' })];
    const result = buildDateSummary([{ key: '2026-07-16', label: '', jobs: 12 }, { key: '2026-07-17', label: '', jobs: 8 }, { key: '2026-07-18', label: '', jobs: 3 }], rows);
    expect(result.rows).toEqual([
      { id: '2026-07-16', day: '2026-07-16', jobs: 12, repeats: 2, repeatPct: 16.67, pending: 1, confirmed: 1, notRepeat: 0 },
      { id: '2026-07-17', day: '2026-07-17', jobs: 8, repeats: 0, repeatPct: 0, pending: 0, confirmed: 0, notRepeat: 1 },
      { id: '2026-07-18', day: '2026-07-18', jobs: 3, repeats: 0, repeatPct: 0, pending: 0, confirmed: 0, notRepeat: 0 },
    ]);
    expect(result.totals).toEqual({ count: 3, jobs: 23, repeats: 2, repeatPct: 8.7, pending: 1, confirmed: 1, notRepeat: 1 });
  });

  it('returns 0 % when there are no jobs', () => {
    expect(repeatPercent(0, 0)).toBe(0);
    expect(repeatPercent(1, 3)).toBe(33.33);
  });
});

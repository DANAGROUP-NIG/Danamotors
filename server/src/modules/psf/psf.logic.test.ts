import {
  callBlocked,
  followLines,
  followUpProblem,
  isContacted,
  needsCall,
  phoneList,
  remarkProblem,
  resolveLineStatuses,
  satisfactionPct,
  SERVICE_LINE_KEY,
  statusCode,
} from './psf.logic';

const labour = (id: string, flags: { followUpAnalysis?: boolean; majorLabour?: boolean } = {}) => ({
  id,
  code: id.toUpperCase(),
  description: `Labour ${id}`,
  followUpAnalysis: flags.followUpAnalysis ?? true,
  majorLabour: flags.majorLabour ?? false,
});

describe('PSF statuses', () => {
  it('keeps the legacy codes 1-5', () => {
    expect(['SATISFIED', 'DISSATISFIED', 'NO_PHONE', 'NOT_AVAILABLE', 'CLOSED'].map((status) => statusCode(status as never))).toEqual([1, 2, 3, 4, 5]);
  });

  it('counts only satisfied and dissatisfied as contacted', () => {
    expect(isContacted('SATISFIED')).toBe(true);
    expect(isContacted('DISSATISFIED')).toBe(true);
    expect(isContacted('NO_PHONE')).toBe(false);
    expect(isContacted('CLOSED')).toBe(false);
    expect(isContacted(null)).toBe(false);
  });

  it('needs a call when never followed up or not reached', () => {
    expect(needsCall(null)).toBe(true);
    expect(needsCall('NO_PHONE')).toBe(true);
    expect(needsCall('NOT_AVAILABLE')).toBe(true);
    expect(needsCall('SATISFIED')).toBe(false);
    expect(needsCall('CLOSED')).toBe(false);
  });

  it('gives satisfaction % over contacted customers only', () => {
    expect(satisfactionPct(3, 1)).toBe(75);
    expect(satisfactionPct(2, 1)).toBe(66.67);
    expect(satisfactionPct(0, 0)).toBe(0);
  });
});

describe('followLines', () => {
  it('lists the service type, then labour marked for follow-up analysis, in job order', () => {
    const lines = followLines({ code: 'RR', description: 'Running repair' }, [labour('a'), labour('b', { followUpAnalysis: false }), labour('c', { majorLabour: true })]);
    expect(lines.map((line) => [line.key, line.kind, line.code, line.major])).toEqual([
      [SERVICE_LINE_KEY, 'SERVICE', 'RR', false],
      ['a', 'LABOUR', 'A', false],
      ['c', 'LABOUR', 'C', true],
    ]);
  });

  it('has no service line when the job has no service type', () => {
    expect(followLines(null, [labour('a')]).map((line) => line.key)).toEqual(['a']);
  });
});

describe('resolveLineStatuses', () => {
  const lines = followLines({ code: 'RR', description: 'Running repair' }, [labour('a'), labour('b')]);

  it('gives every line the call status when the customer was not reached or the follow-up is closed', () => {
    for (const status of ['NO_PHONE', 'NOT_AVAILABLE', 'CLOSED'] as const) {
      const result = resolveLineStatuses(status, lines, [{ key: 'a', status: 'SATISFIED' }]);
      expect(result.ok && [...result.statuses.values()]).toEqual([status, status, status]);
    }
  });

  it('takes a status per line when reached', () => {
    const result = resolveLineStatuses('DISSATISFIED', lines, [
      { key: SERVICE_LINE_KEY, status: 'SATISFIED' },
      { key: 'a', status: 'DISSATISFIED' },
      { key: 'b', status: 'SATISFIED' },
    ]);
    expect(result.ok && Object.fromEntries(result.statuses)).toEqual({ SERVICE: 'SATISFIED', a: 'DISSATISFIED', b: 'SATISFIED' });
  });

  it('refuses a satisfied call with a dissatisfied line', () => {
    const result = resolveLineStatuses('SATISFIED', lines, [
      { key: SERVICE_LINE_KEY, status: 'SATISFIED' },
      { key: 'a', status: 'DISSATISFIED' },
      { key: 'b', status: 'SATISFIED' },
    ]);
    expect(result).toEqual({ ok: false, problem: expect.stringContaining('dissatisfied') });
  });

  it('needs every line once, from this job, with a contacted status', () => {
    expect(resolveLineStatuses('SATISFIED', lines, [{ key: 'a', status: 'SATISFIED' }]).ok).toBe(false);
    expect(resolveLineStatuses('SATISFIED', lines, [{ key: 'zz', status: 'SATISFIED' }]).ok).toBe(false);
    expect(
      resolveLineStatuses('SATISFIED', lines, [
        { key: SERVICE_LINE_KEY, status: 'SATISFIED' },
        { key: 'a', status: 'SATISFIED' },
        { key: 'a', status: 'SATISFIED' },
      ]).ok,
    ).toBe(false);
    expect(
      resolveLineStatuses('SATISFIED', lines, [
        { key: SERVICE_LINE_KEY, status: 'SATISFIED' },
        { key: 'a', status: 'NO_PHONE' },
        { key: 'b', status: 'SATISFIED' },
      ]).ok,
    ).toBe(false);
  });

  it('accepts a reached call on a job with no lines', () => {
    expect(resolveLineStatuses('SATISFIED', [], undefined).ok).toBe(true);
  });
});

describe('rules', () => {
  it('blocks calls once closed', () => {
    expect(callBlocked('CLOSED')).toMatch(/closed/);
    expect(callBlocked('DISSATISFIED')).toBeNull();
    expect(callBlocked(null)).toBeNull();
  });

  it('follows up only delivered, not cancelled, non-PDI jobs', () => {
    const delivered = new Date('2026-11-18T10:00:00Z');
    expect(followUpProblem({ deliveredAt: delivered, status: 'DELIVERED', isPdi: false })).toBeNull();
    expect(followUpProblem({ deliveredAt: null, status: 'READY', isPdi: false })).toMatch(/not been delivered/);
    expect(followUpProblem({ deliveredAt: delivered, status: 'CANCELLED', isPdi: false })).toMatch(/cancelled/);
    expect(followUpProblem({ deliveredAt: delivered, status: 'DELIVERED', isPdi: true })).toMatch(/PDI/);
  });

  it('needs a remark for a dissatisfied customer or a closed follow-up', () => {
    expect(remarkProblem('DISSATISFIED', null)).not.toBeNull();
    expect(remarkProblem('CLOSED', null)).not.toBeNull();
    expect(remarkProblem('CLOSED', 'Resolved by the service manager')).toBeNull();
    expect(remarkProblem('NOT_AVAILABLE', null)).toBeNull();
  });

  it('lists every phone once, labelled', () => {
    expect(phoneList({ phoneNumber: '0803 123 4567', mobile2: '08031234567', residencePhone: ' ', office1: '012345678', office2: null })).toEqual([
      { label: 'Mobile', number: '0803 123 4567' },
      { label: 'Office', number: '012345678' },
    ]);
    expect(phoneList(null)).toEqual([]);
  });
});

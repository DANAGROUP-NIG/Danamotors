import { RepeatJobSource, RepeatJobStatus } from '@prisma/client';
import { findLastBilledJob, resolveRepeatAtOpening, type PreviousJob } from './repeat-job.detect';
import { canReview, countsAsRepeat, isNotRepeatReason, matchWindow, repeatDifference, reviewOutcome, technicianIds, type ReasonOption } from './repeat-job.logic';

const window = { days: 15, km: 500 };
const at = (iso: string) => new Date(iso);

describe('repeat window', () => {
  const previous = { date: at('2026-07-01T09:00:00Z'), mileage: 60000 };

  it('flags by days only', () => {
    const difference = repeatDifference({ date: at('2026-07-10T09:00:00Z'), mileage: 61500 }, previous);
    expect(difference).toEqual({ days: 9, km: 1500 });
    expect(matchWindow(difference, window)).toEqual({ matched: true, byDays: true, byKm: false });
  });

  it('flags by km only', () => {
    const difference = repeatDifference({ date: at('2026-08-20T09:00:00Z'), mileage: 60400 }, previous);
    expect(matchWindow(difference, window)).toEqual({ matched: true, byDays: false, byKm: true });
  });

  it('flags when within both limits', () => {
    expect(matchWindow(repeatDifference({ date: at('2026-07-05T09:00:00Z'), mileage: 60100 }, previous), window)).toEqual({ matched: true, byDays: true, byKm: true });
  });

  it('does not flag outside both limits', () => {
    expect(matchWindow(repeatDifference({ date: at('2026-09-01T09:00:00Z'), mileage: 64000 }, previous), window).matched).toBe(false);
  });

  it('includes the last day of the window and counts local calendar days (Lagos)', () => {
    // 23:30 UTC on 1 Jul is 00:30 on 2 Jul in Lagos.
    const late = { date: at('2026-07-01T23:30:00Z'), mileage: null };
    expect(repeatDifference({ date: at('2026-07-17T08:00:00Z'), mileage: null }, late).days).toBe(15);
    expect(matchWindow({ days: 15, km: null }, window).matched).toBe(true);
    expect(matchWindow({ days: 16, km: null }, window).matched).toBe(false);
  });

  it('never counts a lower reading (odometer replaced) or a missing one as within km', () => {
    const lower = repeatDifference({ date: at('2026-09-01T09:00:00Z'), mileage: 1200 }, previous);
    expect(lower.km).toBeNull();
    expect(matchWindow(lower, window).matched).toBe(false);
    expect(repeatDifference({ date: at('2026-09-01T09:00:00Z'), mileage: null }, previous).km).toBeNull();
  });

  it('checks days only when the branch has no km limit', () => {
    expect(matchWindow({ days: 40, km: 10 }, { days: 15, km: null }).matched).toBe(false);
  });
});

describe('review rules', () => {
  const options: ReasonOption[] = [
    { id: 'r0', code: '0', isNotRepeat: true, active: true },
    { id: 'r1', code: '1', isNotRepeat: false, active: true },
    { id: 'r2', code: '2', isNotRepeat: false, active: true },
    { id: 'r3', code: '3', isNotRepeat: false, active: true },
    { id: 'r4', code: '4', isNotRepeat: false, active: true },
    { id: 'r5', code: '5', isNotRepeat: false, active: true },
    { id: 'r6', code: '6', isNotRepeat: false, active: false },
  ];

  it('confirms with one to five distinct reasons and remarks', () => {
    expect(reviewOutcome({ reasonIds: ['r4'], remarks: ' Clutch not replaced ' }, options)).toEqual({ status: RepeatJobStatus.CONFIRMED, remarks: 'Clutch not replaced' });
    expect(reviewOutcome({ reasonIds: ['r1', 'r2', 'r3', 'r4', 'r5'], remarks: 'x' }, options).status).toBe(RepeatJobStatus.CONFIRMED);
  });

  it('rejects none, more than five, or duplicates', () => {
    expect(() => reviewOutcome({ reasonIds: [], remarks: 'x' }, options)).toThrow('at least one');
    expect(() => reviewOutcome({ reasonIds: ['r1', 'r2', 'r3', 'r4', 'r5', 'r0'], remarks: 'x' }, options)).toThrow('at most 5');
    expect(() => reviewOutcome({ reasonIds: ['r1', 'r1'], remarks: 'x' }, options)).toThrow('only once');
    expect(() => reviewOutcome({ reasonIds: ['unknown'], remarks: 'x' }, options)).toThrow('repeat reason list');
  });

  it('allows "not a repeat job" only on its own', () => {
    expect(reviewOutcome({ reasonIds: ['r0'], remarks: 'Scheduled service' }, options).status).toBe(RepeatJobStatus.NOT_REPEAT);
    expect(() => reviewOutcome({ reasonIds: ['r0', 'r4'], remarks: 'x' }, options)).toThrow('cannot be combined');
  });

  it('requires remarks', () => {
    expect(() => reviewOutcome({ reasonIds: ['r4'], remarks: '  ' }, options)).toThrow('remarks');
    expect(() => reviewOutcome({ reasonIds: ['r4'], remarks: undefined }, options)).toThrow('remarks');
  });

  it('keeps an inactive reason already on the record but refuses it as a new choice', () => {
    expect(() => reviewOutcome({ reasonIds: ['r6'], remarks: 'x' }, options)).toThrow('no longer in use');
    expect(reviewOutcome({ reasonIds: ['r6'], remarks: 'x' }, options, ['r6']).status).toBe(RepeatJobStatus.CONFIRMED);
  });

  it('lets anyone review a pending record, and only the reviewer or an Admin change a reviewed one', () => {
    const pending = { status: RepeatJobStatus.PENDING_REVIEW, reviewedById: null };
    const reviewed = { status: RepeatJobStatus.CONFIRMED, reviewedById: 'u1' };
    expect(canReview(pending, { userId: 'u2', role: 'WorkshopManager' })).toBe(true);
    expect(canReview(reviewed, { userId: 'u1', role: 'WorkshopManager' })).toBe(true);
    expect(canReview(reviewed, { userId: 'u2', role: 'WorkshopManager' })).toBe(false);
    expect(canReview(reviewed, { userId: 'u2', role: 'Admin' })).toBe(true);
    expect(canReview(reviewed, { userId: 'u2', role: 'SuperAdmin' })).toBe(true);
  });

  it('reads the not-a-repeat flag from the master, falling back to code 0', () => {
    expect(isNotRepeatReason({ code: '0', attributes: null })).toBe(true);
    expect(isNotRepeatReason({ code: '0', attributes: { isNotRepeat: false } })).toBe(false);
    expect(isNotRepeatReason({ code: 'NR', attributes: { isNotRepeat: true } })).toBe(true);
    expect(countsAsRepeat('NOT_REPEAT')).toBe(false);
    expect(countsAsRepeat('PENDING_REVIEW')).toBe(true);
  });

  it('lists the previous technicians once each', () => {
    expect(technicianIds('t1', ['t2', null, 't1'])).toEqual(['t1', 't2']);
  });
});

describe('detection queries', () => {
  const previousJob = (overrides: Partial<PreviousJob> = {}): PreviousJob => ({
    id: 'prev', jobNumber: '2026000346', createdAt: at('2026-07-01T09:00:00Z'), mileage: 60000, status: 'DELIVERED', workDone: 'AC gas top-up', description: 'AC not cooling',
    branchId: 'b1', engineerId: 'e1', serviceAdvisorId: 'a1', technicianId: 't1', serviceType: null, engineer: null, serviceAdvisor: null, technician: null, labourLines: [],
    ...overrides,
  });

  it('compares with the last billed job: not cancelled, not PDI, any branch, newest first', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    await findLastBilledJob({ jobCard: { findFirst } } as never, 'v1', at('2026-07-10T09:00:00Z'));
    const { where, orderBy } = findFirst.mock.calls[0][0];
    expect(where).toMatchObject({ vehicleId: 'v1', createdAt: { lt: at('2026-07-10T09:00:00Z') }, status: { notIn: ['CANCELLED', 'Cancelled'] } });
    expect(where.branchId).toBeUndefined();
    expect(where.OR).toEqual([{ billedAt: { not: null } }, { status: { in: ['BILLED', 'Billed', 'DELIVERED', 'Closed'] } }]);
    expect(where.AND).toEqual([expect.objectContaining({ jobType: 'SERVICE' })]);
    expect(orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  const tx = (lastBilled: PreviousJob | null, manual: PreviousJob | null = null) => {
    const findFirst = jest.fn().mockImplementation(({ where }) => Promise.resolve(where.id ? manual : lastBilled));
    return { tx: { $executeRaw: jest.fn().mockResolvedValue(0), jobCard: { findFirst }, auditLog: { create: jest.fn() } } as never, findFirst };
  };
  const input = { vehicleId: 'v1', mileage: 60200, at: at('2026-07-10T09:00:00Z'), window, actorId: 'u1' };

  it('flags automatically within the window', async () => {
    const { tx: db } = tx(previousJob());
    await expect(resolveRepeatAtOpening(db, input)).resolves.toMatchObject({ source: RepeatJobSource.AUTOMATIC, difference: { days: 9, km: 200 }, previous: { id: 'prev' } });
  });

  it('does not flag when the last billed job is outside the window, or there is none', async () => {
    await expect(resolveRepeatAtOpening(tx(previousJob({ createdAt: at('2026-05-01T09:00:00Z'), mileage: 50000 })).tx, input)).resolves.toBeNull();
    await expect(resolveRepeatAtOpening(tx(null).tx, input)).resolves.toBeNull();
  });

  it('records a job picked by hand outside the window as manual', async () => {
    const older = previousJob({ id: 'older', createdAt: at('2026-03-01T09:00:00Z'), mileage: 52000 });
    const { tx: db, findFirst } = tx(null, older);
    await expect(resolveRepeatAtOpening(db, { ...input, manualPreviousJobId: 'older' })).resolves.toMatchObject({ source: RepeatJobSource.MANUAL, previous: { id: 'older' }, difference: { km: 8200 } });
    expect(findFirst.mock.calls[1][0].where).toMatchObject({ id: 'older', vehicleId: 'v1', status: { notIn: ['CANCELLED', 'Cancelled'] } });
  });

  it('keeps the automatic source when the advisor confirms the detected job', async () => {
    await expect(resolveRepeatAtOpening(tx(previousJob()).tx, { ...input, manualPreviousJobId: 'prev' })).resolves.toMatchObject({ source: RepeatJobSource.AUTOMATIC });
  });

  it('refuses a hand-picked job that is not an earlier, open-able job of the vehicle', async () => {
    await expect(resolveRepeatAtOpening(tx(null, null).tx, { ...input, manualPreviousJobId: 'other' })).rejects.toThrow('previous job');
  });

  it('opens the job unflagged when the lookup fails, recording the failure', async () => {
    const failing = { $executeRaw: jest.fn().mockResolvedValue(0), jobCard: { findFirst: jest.fn().mockRejectedValue(new Error('timeout')) }, auditLog: { create: jest.fn() } };
    await expect(resolveRepeatAtOpening(failing as never, input)).resolves.toBeNull();
    expect(failing.$executeRaw).toHaveBeenCalledTimes(2); // SAVEPOINT, ROLLBACK TO SAVEPOINT
    expect(failing.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'REPEAT_DETECTION_FAILED' }) });
  });
});

import { Prisma, RepeatJobSource } from '@prisma/client';
import { BadRequestError } from '../../shared/errors/appError';
import { serviceHistoryWhere } from '../pdi/pdi.logic';
import {
  BILLED_JOB_STATUSES,
  CANCELLED_JOB_STATUSES,
  matchWindow,
  repeatDifference,
  technicianIds,
  type RepeatDifference,
  type RepeatWindow,
  type WindowMatch,
} from './repeat-job.logic';

type Db = Prisma.TransactionClient;

const person = { select: { id: true, firstName: true, lastName: true } } as const;

/** What the opening form and the repeat record need from the previous job. */
export const previousJobSelect = {
  id: true,
  jobNumber: true,
  createdAt: true,
  mileage: true,
  status: true,
  workDone: true,
  description: true,
  branchId: true,
  engineerId: true,
  serviceAdvisorId: true,
  technicianId: true,
  serviceType: { select: { code: true, description: true } },
  engineer: person,
  serviceAdvisor: person,
  technician: person,
  labourLines: { select: { technicianId: true } },
} satisfies Prisma.JobCardSelect;

export type PreviousJob = Prisma.JobCardGetPayload<{ select: typeof previousJobSelect }>;

export interface RepeatCandidate {
  previous: PreviousJob;
  difference: RepeatDifference;
  match: WindowMatch;
}

export function windowOf(settings: { repeatWindowDays: number; repeatWindowKm: number | null }): RepeatWindow {
  return { days: settings.repeatWindowDays, km: settings.repeatWindowKm };
}

/** Earlier service jobs of the vehicle (any branch): not cancelled, not PDI. */
export function earlierServiceJobsWhere(vehicleId: string, before: Date): Prisma.JobCardWhereInput {
  return {
    vehicleId,
    createdAt: { lt: before },
    status: { notIn: [...CANCELLED_JOB_STATUSES] },
    AND: [serviceHistoryWhere()],
  };
}

/** The vehicle's most recent billed job before `before`: the job a new visit is compared with. */
export function findLastBilledJob(db: Db, vehicleId: string, before: Date): Promise<PreviousJob | null> {
  return db.jobCard.findFirst({
    where: {
      ...earlierServiceJobsWhere(vehicleId, before),
      OR: [{ billedAt: { not: null } }, { status: { in: [...BILLED_JOB_STATUSES] } }],
    },
    select: previousJobSelect,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
}

/** The repeat candidate for a visit at `at` with `mileage`, or null when the last billed job is outside the window. */
export async function findRepeatCandidate(
  db: Db,
  input: { vehicleId: string; mileage: number | null; at: Date; window: RepeatWindow },
): Promise<RepeatCandidate | null> {
  const previous = await findLastBilledJob(db, input.vehicleId, input.at);
  if (!previous) return null;
  const difference = repeatDifference({ date: input.at, mileage: input.mileage }, { date: previous.createdAt, mileage: previous.mileage });
  const match = matchWindow(difference, input.window);
  return match.matched ? { previous, difference, match } : null;
}

/**
 * Detection inside the opening transaction. A failed lookup must not stop the job opening, so it runs
 * in a savepoint; on failure the savepoint is rolled back, the failure is recorded in the audit log and
 * the job opens unflagged (the advisor can still flag it by hand, or a reviewer can add it later).
 */
export async function detectRepeatSafely(
  tx: Db,
  input: { vehicleId: string; mileage: number | null; at: Date; window: RepeatWindow; actorId: string },
): Promise<RepeatCandidate | null> {
  try {
    await tx.$executeRaw`SAVEPOINT repeat_detection`;
  } catch {
    return null;
  }
  try {
    const candidate = await findRepeatCandidate(tx, input);
    await tx.$executeRaw`RELEASE SAVEPOINT repeat_detection`;
    return candidate;
  } catch (error) {
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT repeat_detection`;
    await tx.auditLog.create({
      data: {
        userId: input.actorId,
        action: 'REPEAT_DETECTION_FAILED',
        details: JSON.stringify({ vehicleId: input.vehicleId, error: error instanceof Error ? error.message : String(error) }),
      },
    });
    return null;
  }
}

/** A previous job chosen by hand: an earlier, non-cancelled, non-PDI job of the same vehicle. Billing is not required. */
export async function requireManualPrevious(tx: Db, vehicleId: string, previousJobId: string, at: Date): Promise<PreviousJob> {
  const previous = await tx.jobCard.findFirst({
    where: { id: previousJobId, ...earlierServiceJobsWhere(vehicleId, at) },
    select: previousJobSelect,
  });
  if (!previous)
    throw new BadRequestError('The previous job must be an earlier job of this vehicle that is not cancelled or a PDI').withCode('FIELD_VALIDATION', {
      field: 'previousJobId',
    });
  return previous;
}

export interface RepeatAtOpening {
  previous: PreviousJob;
  difference: RepeatDifference;
  source: RepeatJobSource;
}

/**
 * Decides the repeat flag of a job being opened. The automatic candidate wins unless the advisor picked
 * a different previous job by hand; a hand-picked job (inside or outside the window) is MANUAL.
 */
export async function resolveRepeatAtOpening(
  tx: Db,
  input: { vehicleId: string; mileage: number | null; at: Date; window: RepeatWindow; actorId: string; manualPreviousJobId?: string },
): Promise<RepeatAtOpening | null> {
  const candidate = await detectRepeatSafely(tx, input);
  if (input.manualPreviousJobId && input.manualPreviousJobId !== candidate?.previous.id) {
    const previous = await requireManualPrevious(tx, input.vehicleId, input.manualPreviousJobId, input.at);
    const difference = repeatDifference({ date: input.at, mileage: input.mileage }, { date: previous.createdAt, mileage: previous.mileage });
    return { previous, difference, source: RepeatJobSource.MANUAL };
  }
  return candidate ? { previous: candidate.previous, difference: candidate.difference, source: RepeatJobSource.AUTOMATIC } : null;
}

/** The repeat record for a newly opened job, with the previous job's staff and the window in force. */
export function createRepeatRecord(
  tx: Db,
  input: { jobCardId: string; branchId: string; repeat: RepeatAtOpening; window: RepeatWindow; note: string | null },
) {
  const { previous, difference, source } = input.repeat;
  return tx.repeatJob.create({
    data: {
      jobCardId: input.jobCardId,
      previousJobId: previous.id,
      branchId: input.branchId,
      daysDifference: difference.days,
      kmDifference: difference.km,
      previousEngineerId: previous.engineerId,
      previousServiceAdvisorId: previous.serviceAdvisorId,
      previousTechnicianIds: technicianIds(previous.technicianId, previous.labourLines.map((line) => line.technicianId)),
      windowDays: input.window.days,
      windowKm: input.window.km,
      source,
      openingNote: input.note,
    },
  });
}

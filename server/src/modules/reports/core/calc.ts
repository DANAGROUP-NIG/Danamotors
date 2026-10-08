/**
 * Pure calculations behind the reports. They take plain values (no database) so the rules
 * the business cares about are unit-tested directly.
 */
import { JOB_STATUS_ALIASES } from './sql';

export const JOB_STATUS_ORDER = ['OPEN', 'IN_PROGRESS', 'QC', 'READY', 'BILLED', 'DELIVERED'] as const;
export type JobStatus = (typeof JOB_STATUS_ORDER)[number] | 'CANCELLED';

export const JOB_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  QC: 'QC',
  READY: 'Ready',
  BILLED: 'Billed – not delivered',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export function canonicalStatus(status: string | null | undefined): string | null {
  if (!status) return null;
  return JOB_STATUS_ALIASES[status] ?? status;
}

export interface StatusAsOnInput {
  createdAt: Date;
  /** Status of the latest history entry made before the end of the day, if any. */
  historyStatus: string | null;
  /** A bill was active (issued and not yet cancelled) at the end of the day. */
  billedAsOf: boolean;
  /** When the vehicle was delivered (deliveredAt, or the delivery found in history). */
  deliveredAt: Date | null;
  /** When the job was cancelled, if it was. */
  cancelledAt: Date | null;
  /**
   * Only for jobs with no status history at all (e.g. imported from the legacy system):
   * the current status and the last time the job changed. The current status has held
   * at least since then.
   */
  current?: { status: string; since: Date } | null;
}

/**
 * A job's status as it stood at `asOf` (the end of the report day), worked out from status
 * history rather than today's status. Returns null if the job did not exist yet.
 */
export function statusAsOn(input: StatusAsOnInput, asOf: Date): JobStatus | null {
  if (input.createdAt >= asOf) return null;
  if (input.cancelledAt && input.cancelledAt < asOf) return 'CANCELLED';
  if (input.deliveredAt && input.deliveredAt < asOf) return 'DELIVERED';
  if (input.billedAsOf) return 'BILLED';
  const fromHistory = canonicalStatus(input.historyStatus) ?? (input.current && input.current.since < asOf ? canonicalStatus(input.current.status) : null);
  // Delivery/billing in history without the matching timestamps means the data was
  // corrected later (bill cancelled, delivery undone); trust the timestamps above.
  if (!fromHistory || fromHistory === 'DELIVERED' || fromHistory === 'BILLED' || fromHistory === 'CANCELLED') return 'OPEN';
  return (JOB_STATUS_ORDER as readonly string[]).includes(fromHistory) ? (fromHistory as JobStatus) : 'OPEN';
}

/** Whole days a job has been open at `until` (at least 0). */
export function daysOpen(createdAt: Date, until: Date): number {
  return Math.max(0, Math.floor((until.getTime() - createdAt.getTime()) / 86_400_000));
}

export type PromiseState = 'OVERDUE' | 'DUE_SOON' | 'ON_TIME' | 'NO_PROMISE' | 'DELIVERED_LATE' | 'DELIVERED_ON_TIME';

export const PROMISE_STATE_ORDER: PromiseState[] = ['OVERDUE', 'DUE_SOON', 'ON_TIME', 'NO_PROMISE', 'DELIVERED_LATE', 'DELIVERED_ON_TIME'];
export const PROMISE_STATE_LABELS: Record<PromiseState, string> = {
  OVERDUE: 'Overdue',
  DUE_SOON: 'Due soon',
  ON_TIME: 'On time',
  NO_PROMISE: 'No promise time',
  DELIVERED_LATE: 'Delivered late',
  DELIVERED_ON_TIME: 'Delivered on time',
};

export interface PromiseInput {
  promisedAt: Date | null;
  readyAt: Date | null;
  deliveredAt: Date | null;
}

/**
 * Where a job stands against its promise date and time.
 * - Delivered: late when delivered after the promise.
 * - Ready, not delivered: the workshop finished; late (overdue) only if it was ready after the promise.
 * - In work: overdue once the promise has passed, due soon within `dueSoonHours` of it.
 * `minutes` is positive while time remains and negative once late.
 */
export function promiseState(input: PromiseInput, now: Date, dueSoonHours: number): { state: PromiseState; minutes: number | null } {
  const { promisedAt, readyAt, deliveredAt } = input;
  if (!promisedAt) return { state: deliveredAt ? 'DELIVERED_ON_TIME' : 'NO_PROMISE', minutes: null };
  const minutesUntil = (at: Date) => Math.round((promisedAt.getTime() - at.getTime()) / 60_000);

  if (deliveredAt) {
    const minutes = minutesUntil(deliveredAt);
    return { state: minutes < 0 ? 'DELIVERED_LATE' : 'DELIVERED_ON_TIME', minutes };
  }
  if (readyAt) {
    const minutes = minutesUntil(readyAt);
    return { state: minutes < 0 ? 'OVERDUE' : 'ON_TIME', minutes };
  }
  const minutes = minutesUntil(now);
  if (minutes < 0) return { state: 'OVERDUE', minutes };
  if (minutes <= dueSoonHours * 60) return { state: 'DUE_SOON', minutes };
  return { state: 'ON_TIME', minutes };
}

export interface Band {
  id: string;
  label: string;
  fromKm: number;
  /** null = and above. */
  toKm: number | null;
}

/** The band a mileage falls in (bands checked in order), or null when unrecorded or outside every band. */
export function mileageBandFor<B extends Band>(mileage: number | null | undefined, bands: B[]): B | null {
  if (mileage === null || mileage === undefined || !Number.isFinite(mileage)) return null;
  return bands.find((band) => mileage >= band.fromKm && (band.toKm === null || mileage <= band.toKm)) ?? null;
}

/**
 * "Reported before first service": the job's local date is after the sale date, and it was
 * opened before the vehicle's first free service job (or there has been none yet).
 */
export function isBeforeFirstService(job: { at: Date; localDate: string }, saleDate: string | null, firstServiceAt: Date | null): boolean {
  if (!saleDate) return false;
  if (job.localDate <= saleDate) return false;
  return !firstServiceAt || job.at < firstServiceAt;
}

export interface LabourLineAmounts {
  standardHours: number | null;
  /** Charged hours. */
  hours: number;
  amount: number;
}

export interface LineTechnician {
  technicianId: string;
  sharePercent: number | null;
}

export interface TechnicianShare extends LineTechnician {
  standardHours: number | null;
  chargedHours: number;
  amount: number;
  /** The percentage actually applied. */
  appliedPercent: number;
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Credit a labour line to its technicians: by the recorded shares when every technician has
 * one, otherwise evenly. Hours and amounts are rounded to 2dp and the last technician takes the
 * remainder, so the shares always add back up to the line.
 */
export function splitLabourLine(line: LabourLineAmounts, technicians: LineTechnician[]): TechnicianShare[] {
  if (!technicians.length) return [];
  const recorded = technicians.every((t) => t.sharePercent !== null && t.sharePercent > 0);
  const total = recorded ? technicians.reduce((sum, t) => sum + (t.sharePercent ?? 0), 0) : technicians.length;
  const fraction = (t: LineTechnician) => (recorded ? (t.sharePercent ?? 0) / total : 1 / technicians.length);

  let standardLeft = line.standardHours ?? 0;
  let chargedLeft = line.hours;
  let amountLeft = line.amount;
  return technicians.map((technician, index) => {
    const last = index === technicians.length - 1;
    const part = fraction(technician);
    const standardHours = last ? round2(standardLeft) : round2((line.standardHours ?? 0) * part);
    const chargedHours = last ? round2(chargedLeft) : round2(line.hours * part);
    const amount = last ? round2(amountLeft) : round2(line.amount * part);
    standardLeft -= standardHours;
    chargedLeft -= chargedHours;
    amountLeft -= amount;
    return {
      ...technician,
      standardHours: line.standardHours === null ? null : standardHours,
      chargedHours,
      amount,
      appliedPercent: round2(part * 100),
    };
  });
}

/** Efficiency = standard hours ÷ charged hours, as a percentage (null when nothing was charged). */
export function efficiency(standardHours: number, chargedHours: number): number | null {
  return chargedHours > 0 ? Math.round((standardHours / chargedHours) * 100) : null;
}

/**
 * Bill groups on the billing reports. Bills do not yet record cash / credit (issue #65), so
 * non-zero bills share one group; zero-value bills (total 0) are separate, as in the legacy
 * registers.
 */
export const BILL_GROUPS = [
  { key: 'BILLED', label: 'Cash and credit bills' },
  { key: 'ZERO', label: 'Zero value bills' },
] as const;

export function billGroupOf(total: number): 'BILLED' | 'ZERO' {
  return Math.abs(total) < 0.005 ? 'ZERO' : 'BILLED';
}

/** Free service: the service charge plus warranty labour and parts on the job is claimable. */
export function freeServiceClaimable(input: { serviceCharge: number | null; warrantyLabour: number; warrantyParts: number }): number {
  return round2((input.serviceCharge ?? 0) + input.warrantyLabour + input.warrantyParts);
}

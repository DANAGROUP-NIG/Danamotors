/**
 * FPC bulletin rules shared by the FPC vehicles list (F1) and the FPC analysis (F2).
 * Database-free so the legacy "called / visited / attended" derivation can be unit tested.
 *
 * - Called:   the campaign vehicle has at least one contact log (any channel or outcome).
 * - Visited:  a job card that is not cancelled is linked to the campaign for that vehicle.
 * - Attended: that job card answered "work done" for the campaign.
 */
import { CampaignVehicleStatus } from '@prisma/client';
import { notAttendedReasonLabel, OUTSTANDING_VEHICLE_STATUSES } from '../campaign/campaign.logic';

export const FPC_SHOWS = ['TO_BE_CALLED', 'CALLED_NOT_VISITED', 'VISITED_NOT_ATTENDED', 'ATTENDED', 'ATTENDED_NOT_CALLED'] as const;
export type FpcShow = (typeof FPC_SHOWS)[number];

export const FPC_SHOW_LABELS: Record<FpcShow, string> = {
  TO_BE_CALLED: 'To be called',
  CALLED_NOT_VISITED: 'Called but not visited',
  VISITED_NOT_ATTENDED: 'Visited but not attended',
  ATTENDED: 'Attended',
  ATTENDED_NOT_CALLED: 'Attended but not called',
};

export interface FpcVisit {
  jobId: string;
  jobNumber: string;
  jobDate: Date;
  billedAt: Date | null;
  /** null = not answered (job cards from before the READY rule, or still open). */
  attended: boolean | null;
  notAttendedReason: string | null;
}

export interface FpcVehicleFacts {
  status: CampaignVehicleStatus;
  campaignActive: boolean;
  /** When each contact was logged. */
  contactDates: Date[];
  visits: FpcVisit[];
}

export const isCalled = (facts: FpcVehicleFacts) => facts.contactDates.length > 0;
export const isVisited = (facts: FpcVehicleFacts) => facts.visits.length > 0;
export const attendedVisits = (facts: FpcVehicleFacts) => facts.visits.filter((visit) => visit.attended === true);

/** A contact logged before the job card was opened. */
export const calledBefore = (facts: FpcVehicleFacts, at: Date) => facts.contactDates.some((date) => date < at);

/**
 * The rows a campaign vehicle contributes to an F1 list. `null` is one row for the vehicle;
 * a visit is one row per job card (visited and attended lists show the job).
 */
export function fpcRowsFor(show: FpcShow, facts: FpcVehicleFacts): (FpcVisit | null)[] {
  switch (show) {
    case 'TO_BE_CALLED':
      return facts.campaignActive && facts.status !== CampaignVehicleStatus.COMPLETED && facts.status !== CampaignVehicleStatus.NOT_APPLICABLE ? [null] : [];
    case 'CALLED_NOT_VISITED':
      return isCalled(facts) && !isVisited(facts) ? [null] : [];
    case 'VISITED_NOT_ATTENDED':
      return attendedVisits(facts).length === 0 ? facts.visits : [];
    case 'ATTENDED':
      return attendedVisits(facts);
    case 'ATTENDED_NOT_CALLED':
      return attendedVisits(facts).filter((visit) => !calledBefore(facts, visit.jobDate));
  }
}

/** How many rows each F1 list would have, for the summary tiles. */
export function fpcShowCounts(all: FpcVehicleFacts[]): Record<FpcShow, number> {
  return Object.fromEntries(FPC_SHOWS.map((show) => [show, all.reduce((sum, facts) => sum + fpcRowsFor(show, facts).length, 0)])) as Record<FpcShow, number>;
}

// ── F2 analysis ──────────────────────────────────────────────────────────────

export const NOT_ANSWERED = 'Not answered';

export interface FpcAnalysisCounts {
  /** Campaign vehicles, less those marked not applicable. */
  affected: number;
  called: number;
  /** Visits (job cards) billed in the period. */
  visited: number;
  attended: number;
  notAttended: number;
  /** Not-attended visits in the period by reason label. */
  reasons: Record<string, number>;
  /** Vehicles with an attended job card at any time. */
  attendedToDate: number;
  outstanding: number;
}

export function emptyFpcCounts(): FpcAnalysisCounts {
  return { affected: 0, called: 0, visited: 0, attended: 0, notAttended: 0, reasons: {}, attendedToDate: 0, outstanding: 0 };
}

/** Adds one campaign vehicle to the counts. `inPeriod` decides which visits were billed in the period. */
export function addFpcFacts(counts: FpcAnalysisCounts, facts: FpcVehicleFacts, inPeriod: (visit: FpcVisit) => boolean): FpcAnalysisCounts {
  if (facts.status === CampaignVehicleStatus.NOT_APPLICABLE) return counts;
  counts.affected += 1;
  if (isCalled(facts)) counts.called += 1;
  if (attendedVisits(facts).length > 0) counts.attendedToDate += 1;
  if (OUTSTANDING_VEHICLE_STATUSES.includes(facts.status)) counts.outstanding += 1;
  for (const visit of facts.visits.filter(inPeriod)) {
    counts.visited += 1;
    if (visit.attended === true) {
      counts.attended += 1;
      continue;
    }
    counts.notAttended += 1;
    const reason = visit.attended === null ? NOT_ANSWERED : notAttendedReasonLabel(visit.notAttendedReason);
    counts.reasons[reason] = (counts.reasons[reason] ?? 0) + 1;
  }
  return counts;
}

export function mergeFpcCounts(into: FpcAnalysisCounts, from: FpcAnalysisCounts): FpcAnalysisCounts {
  for (const key of ['affected', 'called', 'visited', 'attended', 'notAttended', 'attendedToDate', 'outstanding'] as const) into[key] += from[key];
  for (const [reason, count] of Object.entries(from.reasons)) into.reasons[reason] = (into.reasons[reason] ?? 0) + count;
  return into;
}

/** Percentage to 1 decimal place, or null when there is nothing to divide by. */
export function fpcPercent(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 1000) / 10;
}

/** "Parts not available 2, Not answered 1", largest first. */
export function reasonsText(reasons: Record<string, number>): string {
  return Object.entries(reasons)
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .map(([reason, count]) => `${reason} ${count}`)
    .join(', ');
}

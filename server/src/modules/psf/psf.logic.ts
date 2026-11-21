import type { PsfLineKind, PsfStatus } from '@prisma/client';

/** The five legacy follow-up statuses in legend order; code is the legacy number typed on the screen. */
export const PSF_STATUSES: readonly { status: PsfStatus; code: number; label: string }[] = [
  { status: 'SATISFIED', code: 1, label: 'Customer satisfied' },
  { status: 'DISSATISFIED', code: 2, label: 'Customer dissatisfied' },
  { status: 'NO_PHONE', code: 3, label: 'No phone' },
  { status: 'NOT_AVAILABLE', code: 4, label: 'Customer not available' },
  { status: 'CLOSED', code: 5, label: 'Follow-up closed' },
];

export const PSF_STATUS_VALUES = PSF_STATUSES.map((item) => item.status) as [PsfStatus, ...PsfStatus[]];

export const MAX_PSF_REMARK = 500;

/** The default remark for a status (the legacy screen prefilled "Cs" for a satisfied customer). */
export const DEFAULT_REMARK: Partial<Record<PsfStatus, string>> = {
  SATISFIED: 'Customer satisfied',
  NO_PHONE: 'No phone number',
  NOT_AVAILABLE: 'Customer not available',
};

export function statusLabel(status: PsfStatus): string {
  return PSF_STATUSES.find((item) => item.status === status)?.label ?? status;
}

export function statusCode(status: PsfStatus): number {
  return PSF_STATUSES.find((item) => item.status === status)?.code ?? 0;
}

/** Reached the customer: they said satisfied or dissatisfied. */
export function isContacted(status: PsfStatus | null | undefined): boolean {
  return status === 'SATISFIED' || status === 'DISSATISFIED';
}

/** Still to be called: never followed up, or the last call did not reach the customer. */
export function needsCall(status: PsfStatus | null | undefined): boolean {
  return !status || status === 'NO_PHONE' || status === 'NOT_AVAILABLE';
}

/** Satisfied ÷ contacted (satisfied + dissatisfied), as a percentage with 2 decimals; 0 when nobody was reached. */
export function satisfactionPct(satisfied: number, dissatisfied: number): number {
  const contacted = satisfied + dissatisfied;
  return contacted ? Math.round((satisfied / contacted) * 10_000) / 100 : 0;
}

/** Part of a whole as a percentage with 2 decimals. */
export function pctOf(part: number, whole: number): number {
  return whole ? Math.round((part / whole) * 10_000) / 100 : 0;
}

// ── Lines ───────────────────────────────────────────────────────────────────

/** Key of the service-type line; labour lines are keyed by their JobCardLabour id. */
export const SERVICE_LINE_KEY = 'SERVICE';

export interface JobLabourInput {
  id: string;
  code: string;
  description: string;
  followUpAnalysis: boolean;
  majorLabour: boolean;
}

export interface FollowLine {
  key: string;
  kind: PsfLineKind;
  jobCardLabourId: string | null;
  code: string;
  description: string;
  major: boolean;
}

/**
 * The lines followed up on a job: its service type (legacy "RR Running repair"), then every labour line
 * whose labour item is marked for follow-up analysis, in job order.
 */
export function followLines(serviceType: { code: string; description: string } | null, labour: JobLabourInput[]): FollowLine[] {
  const lines: FollowLine[] = [];
  if (serviceType) lines.push({ key: SERVICE_LINE_KEY, kind: 'SERVICE', jobCardLabourId: null, code: serviceType.code, description: serviceType.description, major: false });
  for (const item of labour) {
    if (!item.followUpAnalysis) continue;
    lines.push({ key: item.id, kind: 'LABOUR', jobCardLabourId: item.id, code: item.code, description: item.description, major: item.majorLabour });
  }
  return lines;
}

export interface LineStatusInput {
  key: string;
  status: PsfStatus;
}

/**
 * Line statuses to store for a call, or a problem. When the customer was not reached (3, 4) or the
 * follow-up is closed (5), every line takes the call's status. When reached (1, 2), each line is 1 or 2,
 * every line of the job must be given once, and a "satisfied" call cannot carry a dissatisfied line
 * (so the dissatisfied list misses nobody).
 */
export function resolveLineStatuses(
  status: PsfStatus,
  lines: FollowLine[],
  given: LineStatusInput[] | undefined,
): { ok: true; statuses: Map<string, PsfStatus> } | { ok: false; problem: string } {
  if (!isContacted(status)) return { ok: true, statuses: new Map(lines.map((line) => [line.key, status])) };

  const input = given ?? [];
  const keys = new Set(lines.map((line) => line.key));
  const seen = new Set<string>();
  for (const item of input) {
    if (!keys.has(item.key)) return { ok: false, problem: 'A line does not belong to this job. Reload the job and try again.' };
    if (seen.has(item.key)) return { ok: false, problem: 'A line was given twice' };
    if (!isContacted(item.status)) return { ok: false, problem: 'Each line is either satisfied or dissatisfied when the customer was reached' };
    seen.add(item.key);
  }
  if (seen.size !== keys.size) return { ok: false, problem: 'Give a status for every line. Reload the job if its lines changed.' };
  if (status === 'SATISFIED' && input.some((item) => item.status === 'DISSATISFIED'))
    return { ok: false, problem: 'A line is marked dissatisfied: set the call status to "Customer dissatisfied"' };
  return { ok: true, statuses: new Map(input.map((item) => [item.key, item.status])) };
}

/** Why a job cannot get another call, or null. */
export function callBlocked(current: PsfStatus | null | undefined): string | null {
  return current === 'CLOSED' ? 'This follow-up is closed. A closed follow-up cannot be called again.' : null;
}

/** Why a job cannot be followed up at all, or null. */
export function followUpProblem(job: { deliveredAt: Date | null; status: string; isPdi: boolean }): string | null {
  if (job.status === 'CANCELLED') return 'This job was cancelled.';
  if (job.isPdi) return 'PDI jobs are not followed up.';
  if (!job.deliveredAt) return 'This job has not been delivered yet. Only delivered jobs are followed up.';
  return null;
}

/** A dissatisfied customer or a closed follow-up needs a remark saying what happened. */
export function remarkProblem(status: PsfStatus, remark: string | null): string | null {
  if (status === 'DISSATISFIED' && !remark) return 'Say what the customer is dissatisfied with in the remark';
  if (status === 'CLOSED' && !remark) return 'Give the reason for closing the follow-up in the remark';
  return null;
}

/** Trimmed remark, null when blank. */
export function cleanRemark(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

// ── Phones ──────────────────────────────────────────────────────────────────

export interface CustomerPhones {
  phoneNumber: string | null;
  mobile2: string | null;
  residencePhone: string | null;
  office1: string | null;
  office2: string | null;
}

const PHONE_LABELS: [keyof CustomerPhones, string][] = [
  ['phoneNumber', 'Mobile'],
  ['mobile2', 'Mobile 2'],
  ['residencePhone', 'Residence'],
  ['office1', 'Office'],
  ['office2', 'Office 2'],
];

/** Every phone the customer has, labelled, without blanks or repeats. */
export function phoneList(customer: CustomerPhones | null | undefined): { label: string; number: string }[] {
  if (!customer) return [];
  const seen = new Set<string>();
  return PHONE_LABELS.flatMap(([key, label]) => {
    const number = customer[key]?.trim();
    const digits = number?.replace(/\D/g, '');
    if (!number || !digits || seen.has(digits)) return [];
    seen.add(digits);
    return [{ label, number }];
  });
}

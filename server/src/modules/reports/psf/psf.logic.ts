import type { PsfLineKind, PsfStatus } from '@prisma/client';
import { pctOf, PSF_STATUSES, satisfactionPct } from '../../psf/psf.logic';
import type { ReportColumnDef, ReportRow, ReportSection } from '../core/types';

/** One delivered job in the period with its current follow-up status (null = not followed up). */
export interface PsfJobFact {
  jobId: string;
  model: string | null;
  status: PsfStatus | null;
}

/** One line of a job's last call. */
export interface PsfLineFact {
  kind: PsfLineKind;
  code: string;
  description: string;
  status: PsfStatus;
}

export interface PsfCounts extends Record<string, number> {
  delivered: number;
  followedUp: number;
  satisfied: number;
  dissatisfied: number;
  noPhone: number;
  notAvailable: number;
  closed: number;
  notFollowed: number;
  contacted: number;
  notContacted: number;
  followedUpPct: number;
  satisfactionPct: number;
}

const STATUS_KEY: Record<PsfStatus, 'satisfied' | 'dissatisfied' | 'noPhone' | 'notAvailable' | 'closed'> = {
  SATISFIED: 'satisfied',
  DISSATISFIED: 'dissatisfied',
  NO_PHONE: 'noPhone',
  NOT_AVAILABLE: 'notAvailable',
  CLOSED: 'closed',
};

/**
 * Counts per status. Followed up = has a status (1-5). Contacted = satisfied + dissatisfied.
 * Not contacted = no follow-up, no phone or not available. Satisfaction % = satisfied ÷ contacted.
 */
export function psfCounts(jobs: readonly Pick<PsfJobFact, 'status'>[]): PsfCounts {
  const counts = { satisfied: 0, dissatisfied: 0, noPhone: 0, notAvailable: 0, closed: 0, notFollowed: 0 };
  for (const job of jobs) {
    if (job.status) counts[STATUS_KEY[job.status]] += 1;
    else counts.notFollowed += 1;
  }
  const delivered = jobs.length;
  const followedUp = delivered - counts.notFollowed;
  const contacted = counts.satisfied + counts.dissatisfied;
  return {
    delivered,
    followedUp,
    ...counts,
    contacted,
    notContacted: counts.notFollowed + counts.noPhone + counts.notAvailable,
    followedUpPct: pctOf(followedUp, delivered),
    satisfactionPct: satisfactionPct(counts.satisfied, counts.dissatisfied),
  };
}

/** The analysis table: one row per status (legend order), then "Not followed up". */
export function statusRows(counts: PsfCounts): ReportRow[] {
  const rows: ReportRow[] = PSF_STATUSES.map((item) => {
    const jobs = counts[STATUS_KEY[item.status]];
    return { id: item.status, code: String(item.code), label: item.label, jobs, deliveredPct: pctOf(jobs, counts.delivered), followedUpPct: pctOf(jobs, counts.followedUp) };
  });
  rows.push({ id: 'NOT_FOLLOWED', code: '', label: 'Not followed up', jobs: counts.notFollowed, deliveredPct: pctOf(counts.notFollowed, counts.delivered), followedUpPct: null });
  return rows;
}

const COUNT_COLUMNS: ReportColumnDef[] = [
  { key: 'satisfied', label: 'Satisfied', format: 'integer' },
  { key: 'dissatisfied', label: 'Dissatisfied', format: 'integer' },
  { key: 'noPhone', label: 'No phone', format: 'integer' },
  { key: 'notAvailable', label: 'Not available', format: 'integer' },
  { key: 'closed', label: 'Closed', format: 'integer' },
  { key: 'satisfactionPct', label: 'Satisfaction %', format: 'percent' },
];

/**
 * Labour / service-wise satisfaction from the lines of each job's last call: one row per code
 * (service lines first, then labour, each by code). Lines with the same code count together.
 */
interface LabourRow {
  key: string;
  kind: PsfLineKind;
  code: string;
  label: string;
  lines: number;
  satisfied: number;
  dissatisfied: number;
  noPhone: number;
  notAvailable: number;
  closed: number;
}

export function labourSection(lines: readonly PsfLineFact[]): ReportSection {
  const byCode = new Map<string, LabourRow>();
  for (const line of lines) {
    const key = `${line.kind}:${line.code}`;
    const row = byCode.get(key) ?? { key, kind: line.kind, code: line.code, label: line.description, lines: 0, satisfied: 0, dissatisfied: 0, noPhone: 0, notAvailable: 0, closed: 0 };
    row.lines += 1;
    row[STATUS_KEY[line.status]] += 1;
    byCode.set(key, row);
  }
  const rows = [...byCode.values()]
    .sort((a, b) => (a.kind === b.kind ? a.code.localeCompare(b.code) : a.kind === 'SERVICE' ? -1 : 1))
    .map((row) => ({ ...row, type: row.kind === 'SERVICE' ? 'Service' : 'Labour', satisfactionPct: satisfactionPct(row.satisfied, row.dissatisfied) }));
  const total = sumRows(rows, ['lines', 'satisfied', 'dissatisfied', 'noPhone', 'notAvailable', 'closed']);
  return {
    key: 'labour',
    title: 'Labour / service-wise satisfaction',
    columns: [
      { key: 'code', label: 'Code' },
      { key: 'label', label: 'Labour / service' },
      { key: 'type', label: 'Type' },
      { key: 'lines', label: 'Followed up', format: 'integer' },
      ...COUNT_COLUMNS,
    ],
    rows,
    total: { code: 'Total', label: '', type: '', ...total, satisfactionPct: satisfactionPct(total.satisfied, total.dissatisfied) },
  };
}

function sumRows<K extends string>(rows: readonly object[], keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, rows.reduce((sum, row) => sum + Number((row as Record<string, unknown>)[key] ?? 0), 0)])) as Record<K, number>;
}

export const NO_MODEL = 'Model not set';

/** Model-wise analysis: one row per model in name order (jobs without a model last), each with the analysis figures. */
export function modelRows(jobs: readonly PsfJobFact[]): ReportRow[] {
  const byModel = new Map<string, PsfJobFact[]>();
  for (const job of jobs) {
    const model = job.model?.trim() || NO_MODEL;
    byModel.set(model, [...(byModel.get(model) ?? []), job]);
  }
  return [...byModel.entries()]
    .sort(([a], [b]) => (a === NO_MODEL ? 1 : b === NO_MODEL ? -1 : a.localeCompare(b, 'en', { sensitivity: 'base' })))
    .map(([model, list]) => ({ id: model, model, ...psfCounts(list) }));
}

/** True when a model name lies between two model names (inclusive, case-insensitive); open ends allowed. */
export function inModelRange(model: string | null, from: string | null, to: string | null): boolean {
  if (!from && !to) return true;
  if (!model) return false;
  const compare = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' });
  return (!from || compare(model, from) >= 0) && (!to || compare(model, to) <= 0);
}

// ── Follow-up letter ──────────────────────────────────────────────────────────

export type LetterGroup = 'NO_PHONE' | 'NOT_AVAILABLE' | 'NOT_FOLLOWED_UP';

export const LETTER_GROUP_LABELS: Record<LetterGroup, string> = {
  NO_PHONE: 'Customer has no phone',
  NOT_AVAILABLE: 'Customer not available',
  NOT_FOLLOWED_UP: 'Customer not followed up',
};

/** The letter groups a job falls in: no phone (status 3, or never followed up and no phone on record), not available (4), not followed up. */
export function letterGroups(status: PsfStatus | null, customerHasPhone: boolean): LetterGroup[] {
  if (status === 'NO_PHONE') return ['NO_PHONE'];
  if (status === 'NOT_AVAILABLE') return ['NOT_AVAILABLE'];
  if (status) return [];
  return customerHasPhone ? ['NOT_FOLLOWED_UP'] : ['NO_PHONE', 'NOT_FOLLOWED_UP'];
}

export interface LetterJob {
  jobId: string;
  jobNumber: string;
  deliveredAt: Date;
  registration: string | null;
  model: string | null;
  serviceType: string;
  status: PsfStatus | null;
  customerId: string;
  customer: string;
  customerAddress: string | null;
  customerCity: string | null;
  hasPhone: boolean;
  branchName: string;
  branchAddress: string | null;
  branchPhone: string | null;
  branchEmail: string | null;
}

/**
 * One row per customer with at least one job in a chosen group: their groups and jobs (latest
 * delivery first), in customer name order. A customer is printed once however many jobs they have.
 * mailable = the customer has an address.
 */
export function letterRows(jobs: readonly LetterJob[], chosen: ReadonlySet<LetterGroup>): ReportRow[] {
  const byCustomer = new Map<string, { jobs: LetterJob[]; groups: Set<LetterGroup> }>();
  for (const job of jobs) {
    const groups = letterGroups(job.status, job.hasPhone).filter((group) => chosen.has(group));
    if (!groups.length) continue;
    const entry = byCustomer.get(job.customerId) ?? { jobs: [], groups: new Set<LetterGroup>() };
    entry.jobs.push(job);
    groups.forEach((group) => entry.groups.add(group));
    byCustomer.set(job.customerId, entry);
  }
  return [...byCustomer.entries()]
    .map(([customerId, entry]) => {
      const list = [...entry.jobs].sort((a, b) => b.deliveredAt.getTime() - a.deliveredAt.getTime() || b.jobNumber.localeCompare(a.jobNumber));
      const latest = list[0];
      const groups = (Object.keys(LETTER_GROUP_LABELS) as LetterGroup[]).filter((group) => entry.groups.has(group));
      return {
        id: customerId,
        customerId,
        customer: latest.customer,
        customerAddress: latest.customerAddress,
        mailable: Boolean(latest.customerAddress?.trim()),
        groups,
        groupLabels: groups.map((group) => LETTER_GROUP_LABELS[group]).join('; '),
        jobCount: list.length,
        jobNumber: latest.jobNumber,
        deliveredAt: latest.deliveredAt,
        registration: latest.registration,
        model: latest.model,
        serviceType: latest.serviceType,
        registrations: [...new Set(list.map((job) => job.registration).filter(Boolean))].join(', '),
        jobs: list.map((job) => ({ jobId: job.jobId, jobNumber: job.jobNumber, deliveredAt: job.deliveredAt, registration: job.registration, model: job.model, serviceType: job.serviceType })),
        branchName: latest.branchName,
        branchAddress: latest.branchAddress,
        branchPhone: latest.branchPhone,
        branchEmail: latest.branchEmail,
      };
    })
    .sort((a, b) => a.customer.localeCompare(b.customer, 'en', { sensitivity: 'base' }));
}

/** "12 Allen Avenue, Ikeja, Lagos": the usable parts of an address; null when there is no street address. */
export function mailingAddress(parts: { address: string | null; city: string | null; state: string | null }): string | null {
  const street = parts.address?.trim();
  if (!street) return null;
  return [street, parts.city?.trim(), parts.state?.trim()].filter(Boolean).join(', ');
}

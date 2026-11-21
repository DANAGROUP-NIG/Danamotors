import type { PsfStatus } from '@prisma/client';
import { z } from 'zod';
import { PERMISSIONS } from '../../../shared/constants/roles';
import { plate } from '../../psf/psf.sql';
import { branchParam, flag, modeParam, rangeQuery } from '../core/filters';
import { defineReport, type ReportDefinition } from '../core/types';
import { loadFollowUpList, loadJobFacts, loadLastLines, loadLetterJobs, loadMailingList, loadStatusList, loadVehicleHistory } from './psf.data';
import { inModelRange, labourSection, letterRows, modelRows, psfCounts, statusRows, type LetterGroup } from './psf.logic';

const RULES =
  'Only delivered, not cancelled, non-PDI jobs count. The period filters the delivery date (Africa/Lagos days). Each job counts once, at its current follow-up status (its last call). Followed up = status 1-5; contacted = satisfied + dissatisfied; satisfaction % = satisfied ÷ contacted.';

const defaultTrue = z.preprocess((value) => (value === undefined ? true : value === true || value === 'true' || value === '1'), z.boolean());
const uuidOrBlank = z.preprocess((value) => (value === '' ? undefined : value), z.string().uuid().optional());
const allDatesDoc = { name: 'allDates', description: 'true: every delivery date (from/to ignored). Default false.', schema: { type: 'boolean' } };

const jobExample = {
  jobId: 'job-uuid', jobNumber: '2026000412', deliveredAt: '2026-11-18T15:10:00.000Z', registration: 'LSD686KC', model: 'Sportage', variant: 'SPORTAGE 2.0 AT',
  customer: 'Chinedu Okafor', customerPhones: '+2348031234567', customerAddress: '12 Allen Avenue, Ikeja, Lagos', serviceType: 'Running repair', receivedBy: 'Ada Obi',
};

// ── 2. Post-service follow-up list ─────────────────────────────────────────────

const followUpList = defineReport({
  slug: 'psf-followup-list',
  title: 'Post-service follow-up list',
  width: 132,
  permission: PERMISSIONS.PSF_READ,
  summary: `Who to call: one row per delivered job with registration, model, customer, every phone, preferred follow-up day / time, service, the labour lines followed up and the current follow-up status. basis=ALL (100% follow-up, every job) or MAJOR (jobs with a major labour line, only those lines). flaggedOnly=true keeps labour marked "include for follow-up analysis" (and jobs that have some). Accidental jobs (service type category ACCIDENTAL or code AC) are left out unless includeAccidental=true. notContacted = INCLUDE (default), EXCLUDE or ONLY (not contacted = never followed up, no phone or not available). ${RULES}`,
  period: 'range',
  query: rangeQuery([], {
    basis: z.enum(['ALL', 'MAJOR']).default('ALL'),
    flaggedOnly: flag,
    includeAccidental: flag,
    notContacted: z.enum(['INCLUDE', 'EXCLUDE', 'ONLY']).default('INCLUDE'),
  }),
  filterKeys: [],
  params: [
    { name: 'basis', description: 'ALL (100% follow-up, default) or MAJOR (major labour).', schema: { type: 'string', enum: ['ALL', 'MAJOR'] } },
    { name: 'flaggedOnly', description: 'true: only labour marked for follow-up analysis (legacy "Y").', schema: { type: 'boolean' } },
    { name: 'includeAccidental', description: 'true: include accidental jobs.', schema: { type: 'boolean' } },
    { name: 'notContacted', description: 'INCLUDE (default), EXCLUDE or ONLY customers not contacted.', schema: { type: 'string', enum: ['INCLUDE', 'EXCLUDE', 'ONLY'] } },
  ],
  example: {
    rows: [{ ...jobExample, status: null, statusLabel: 'Not followed up', callCount: 0, preferredDay: 'Monday', preferredTime: 'Morning', accidental: false, labour: [{ code: 'AC-REGAS', description: 'AC regas', major: false }] }],
    groups: [],
    totals: { count: 1, notContacted: 1, contacted: 0, followedUp: 0 },
  },
  async run(db, scope, query) {
    const { rows, truncated } = await loadFollowUpList(db, scope, { from: query.from, to: query.to }, query);
    const counts = psfCounts(rows.map((row) => ({ status: (row.status as PsfStatus | null) ?? null })));
    const totals = { count: rows.length, notContacted: counts.notContacted, contacted: counts.contacted, followedUp: counts.followedUp };
    return { rows, groups: [], totals, summary: totals, truncated };
  },
});

// ── 3. Customer follow-up analysis ─────────────────────────────────────────────

const analysis = defineReport({
  slug: 'psf-analysis',
  title: 'Customer follow-up analysis',
  width: 80,
  permission: PERMISSIONS.PSF_ANALYSIS_READ,
  summary: `Jobs delivered, jobs followed up, and the jobs at each of the five statuses (with % of delivered and of followed up), plus "Not followed up". labourWise=true (default) adds the labour / service-wise satisfaction from the lines of each job's last call. ${RULES}`,
  period: 'range',
  query: rangeQuery([], { labourWise: defaultTrue }),
  filterKeys: [],
  params: [{ name: 'labourWise', description: 'Print labour-wise satisfaction (default true).', schema: { type: 'boolean', default: true } }],
  example: {
    rows: [
      { id: 'SATISFIED', code: '1', label: 'Customer satisfied', jobs: 30, deliveredPct: 75, followedUpPct: 85.71 },
      { id: 'NOT_FOLLOWED', code: '', label: 'Not followed up', jobs: 5, deliveredPct: 12.5, followedUpPct: null },
    ],
    groups: [],
    totals: { delivered: 40, followedUp: 35, satisfied: 30, dissatisfied: 2, contacted: 32, satisfactionPct: 93.75 },
  },
  async run(db, scope, query) {
    const period = { from: query.from, to: query.to };
    const [jobs, lines] = await Promise.all([loadJobFacts(db, scope, period), query.labourWise ? loadLastLines(db, scope, period) : Promise.resolve([])]);
    const counts = psfCounts(jobs);
    return {
      rows: statusRows(counts),
      groups: [],
      totals: { ...counts, jobs: counts.delivered, deliveredPct: 100 },
      summary: { delivered: counts.delivered, followedUp: counts.followedUp, contacted: counts.contacted, satisfactionPct: counts.satisfactionPct },
      sections: query.labourWise ? [labourSection(lines)] : [],
    };
  },
});

// ── 4. Customer follow-up analysis, model-wise ─────────────────────────────────

const modelAnalysis = defineReport({
  slug: 'psf-analysis-model',
  title: 'Customer follow-up analysis, model-wise',
  width: 80,
  permission: PERMISSIONS.PSF_ANALYSIS_MODEL_READ,
  summary: `The follow-up analysis split by model: per model the jobs delivered, followed up, at each status, not followed up and the satisfaction %. modelFrom / modelTo (model ids) limit the models to those whose names lie between the two, in name order; with neither, the totals equal the customer follow-up analysis for the same dates. ${RULES}`,
  period: 'range',
  query: rangeQuery([], { modelFrom: uuidOrBlank, modelTo: uuidOrBlank }),
  filterKeys: [],
  params: [
    { name: 'modelFrom', description: 'First model (id) of the range, in name order.', schema: { type: 'string', format: 'uuid' } },
    { name: 'modelTo', description: 'Last model (id) of the range, in name order.', schema: { type: 'string', format: 'uuid' } },
  ],
  example: {
    rows: [{ id: 'Sportage', model: 'Sportage', delivered: 12, followedUp: 10, satisfied: 8, dissatisfied: 1, noPhone: 0, notAvailable: 1, closed: 0, notFollowed: 2, satisfactionPct: 88.89 }],
    groups: [],
    totals: { delivered: 12, followedUp: 10, satisfied: 8, dissatisfied: 1, satisfactionPct: 88.89 },
  },
  async run(db, scope, query) {
    const ids = [query.modelFrom, query.modelTo].filter((id): id is string => Boolean(id));
    const models = ids.length ? await db.workshopMaster.findMany({ where: { id: { in: ids }, kind: 'MODEL' }, select: { id: true, description: true } }) : [];
    const name = (id?: string) => (id ? (models.find((model) => model.id === id)?.description ?? null) : null);
    let [from, to] = [name(query.modelFrom), name(query.modelTo)];
    if (from && to && from.localeCompare(to, 'en', { sensitivity: 'base' }) > 0) [from, to] = [to, from];
    const jobs = (await loadJobFacts(db, scope, { from: query.from, to: query.to })).filter((job) => inModelRange(job.model, from, to));
    const counts = psfCounts(jobs);
    return {
      rows: modelRows(jobs),
      groups: [],
      totals: counts,
      summary: { delivered: counts.delivered, followedUp: counts.followedUp, contacted: counts.contacted, satisfactionPct: counts.satisfactionPct, modelFrom: from, modelTo: to },
    };
  },
});

// ── 5. / 6. Dissatisfied and closed lists ──────────────────────────────────────

function statusList(status: 'DISSATISFIED' | 'CLOSED'): ReportDefinition {
  const dissatisfied = status === 'DISSATISFIED';
  return defineReport({
    slug: dissatisfied ? 'psf-dissatisfied' : 'psf-closed',
    title: dissatisfied ? 'Follow-up list for dissatisfied customers' : 'List of follow-up closed',
    width: 132,
    permission: dissatisfied ? PERMISSIONS.PSF_DISSATISFIED_READ : PERMISSIONS.PSF_CLOSED_READ,
    summary: dissatisfied
      ? `Jobs whose current follow-up status is 2 (customer dissatisfied): job, delivery date, registration, model, customer, phones, address, the lines marked dissatisfied on the last call, the remark, who called and when. The list service management acts on; closing the follow-up (status 5) takes a job off it. model filters the vehicle model (blank = all). ${RULES}`
      : `Jobs whose current follow-up status is 5 (follow-up closed): job, delivery date, registration, model, customer, the closing remark, who closed it and when, and the status before closing. model filters the vehicle model (blank = all). ${RULES}`,
    period: 'range',
    query: rangeQuery(['model'], {}),
    filterKeys: ['model'],
    example: {
      rows: [
        {
          ...jobExample, status, statusLabel: dissatisfied ? 'Customer dissatisfied' : 'Follow-up closed', remark: dissatisfied ? 'AC still weak after the regas' : 'Service manager called; AC rechecked under warranty',
          callCount: 2, lastCalledAt: '2026-11-20T10:00:00.000Z', lastCalledBy: 'Ngozi Eze', dissatisfiedLines: dissatisfied ? [{ code: 'AC-REGAS', description: 'AC regas' }] : [],
          closedAt: dissatisfied ? null : '2026-11-20T10:00:00.000Z', closedBy: dissatisfied ? null : 'Ngozi Eze', previousStatus: dissatisfied ? null : 'DISSATISFIED', previousStatusLabel: dissatisfied ? null : 'Customer dissatisfied',
        },
      ],
      groups: [],
      totals: { count: 1 },
    },
    async run(db, scope, query) {
      const { rows, truncated } = await loadStatusList(db, scope, { from: query.from, to: query.to, filters: query }, status);
      return { rows, groups: [], totals: { count: rows.length }, summary: { count: rows.length }, truncated };
    },
  });
}

// ── 7. Vehicle follow-up history ───────────────────────────────────────────────

const history = defineReport({
  slug: 'psf-history',
  title: 'Vehicle follow-up history',
  width: 132,
  permission: PERMISSIONS.PSF_HISTORY_READ,
  summary: `Every follow-up call on the jobs of one vehicle delivered in the period (oldest first): job, delivery date, service, mileage, attempt number, call date, caller, status, remark, booking and the status of each line. A job never followed up shows once as "Not followed up". registration is required (spaces and dashes ignored); allDates=true ignores from/to. ${RULES}`,
  period: 'range',
  query: rangeQuery([], { registration: z.string().trim().min(1, 'Enter a registration number').max(20), allDates: flag }),
  filterKeys: [],
  params: [{ name: 'registration', description: 'Registration number (required).', required: true, schema: { type: 'string' } }, allDatesDoc],
  example: {
    rows: [
      {
        ...jobExample, mileage: 42150, currentStatus: 'SATISFIED', callCount: 2, callId: 'call-uuid', attempt: 2, calledAt: '2026-11-20T10:00:00.000Z', callStatus: 'SATISFIED', callStatusLabel: 'Customer satisfied',
        remark: 'Customer satisfied', calledBy: 'Ngozi Eze', bookingAt: null, bookingNumber: null, lines: [{ code: 'RR', description: 'Running repair', kind: 'SERVICE', status: 'SATISFIED', statusLabel: 'Customer satisfied' }],
      },
    ],
    groups: [],
    totals: { count: 1, jobs: 1, calls: 2 },
  },
  async run(db, scope, query) {
    if (!plate(query.registration)) return { rows: [], groups: [], totals: { count: 0, jobs: 0, calls: 0 } };
    const { rows, truncated } = await loadVehicleHistory(db, scope, { from: query.from, to: query.to, allDates: query.allDates }, query.registration);
    const totals = { count: rows.length, jobs: new Set(rows.map((row) => row.jobId)).size, calls: rows.filter((row) => row.callId).length };
    return { rows, groups: [], totals, summary: totals, truncated };
  },
});

// ── 8. Customer follow-up letter ───────────────────────────────────────────────

const letter = defineReport({
  slug: 'psf-letter',
  title: 'Customer follow-up letter',
  width: 80,
  permission: PERMISSIONS.PSF_LETTER,
  summary: `Customers to write to about a job delivered in the period, one row (and one letter) per customer however many jobs they have: noPhone (current status 3, or never followed up with no phone on record), notAvailable (status 4), notFollowedUp (never followed up). All three default to true; at least one is required. A customer can be in several groups. mailable=false when the customer has no street address: the letter leaves them out (totals.noAddress). The letter text is the PSF letter template in report settings. ${RULES}`,
  period: 'range',
  query: rangeQuery([], { noPhone: defaultTrue, notAvailable: defaultTrue, notFollowedUp: defaultTrue }).refine(
    (query) => query.noPhone || query.notAvailable || query.notFollowedUp,
    { message: 'Choose at least one group of customers', path: ['notFollowedUp'] },
  ),
  filterKeys: [],
  params: [
    { name: 'noPhone', description: 'Customer has no phone (default true).', schema: { type: 'boolean', default: true } },
    { name: 'notAvailable', description: 'Customer not available (default true).', schema: { type: 'boolean', default: true } },
    { name: 'notFollowedUp', description: 'Customer not followed up (default true).', schema: { type: 'boolean', default: true } },
  ],
  example: {
    rows: [
      {
        id: 'customer-uuid', customerId: 'customer-uuid', customer: 'Chinedu Okafor', customerAddress: '12 Allen Avenue, Ikeja, Lagos', mailable: true, groups: ['NOT_AVAILABLE'], groupLabels: 'Customer not available',
        jobCount: 1, jobNumber: '2026000412', deliveredAt: '2026-11-18T15:10:00.000Z', registration: 'LSD686KC', model: 'Sportage', serviceType: 'Running repair', registrations: 'LSD686KC',
        jobs: [{ jobId: 'job-uuid', jobNumber: '2026000412' }], branchName: 'Main Branch', branchAddress: '1 Dana Road, Ikeja, Lagos', branchPhone: '0700 000 0000', branchEmail: 'service@example.com',
      },
    ],
    groups: [],
    totals: { count: 1, mailable: 1, noAddress: 0 },
  },
  async run(db, scope, query) {
    const chosen = new Set<LetterGroup>([...(query.noPhone ? ['NO_PHONE' as const] : []), ...(query.notAvailable ? ['NOT_AVAILABLE' as const] : []), ...(query.notFollowedUp ? ['NOT_FOLLOWED_UP' as const] : [])]);
    const rows = letterRows(await loadLetterJobs(db, scope, { from: query.from, to: query.to }), chosen);
    const mailable = rows.filter((row) => row.mailable).length;
    const totals = { count: rows.length, mailable, noAddress: rows.length - mailable };
    return { rows, groups: [], totals, summary: totals };
  },
});

// ── 9. Mailing list ────────────────────────────────────────────────────────────

const mailingQuery = z
  .object({
    branchId: branchParam,
    mode: modeParam,
    city: z.string().trim().max(100).optional(),
    address: z.enum(['CORRESPONDENCE', 'REGISTRATION']).default('CORRESPONDENCE'),
  })
  .strict();

const mailingList = defineReport<z.infer<typeof mailingQuery>>({
  slug: 'psf-mailing-list',
  title: 'Mailing list',
  width: 80,
  permission: PERMISSIONS.PSF_LETTER,
  summary:
    'Customers of the branch (vendors and merged records left out) with their postal address, in name order, for a list or address labels. city limits the list to one city (blank = all cities). Customers without a street address are not listed; totals.noAddress counts them. address=REGISTRATION is accepted for the legacy option but the customer record holds one address, so both choices list the same address (TODO(confirm) #111 open question 5).',
  period: 'none',
  query: mailingQuery,
  filterKeys: [],
  params: [
    { name: 'city', description: 'One city (blank = all cities).', schema: { type: 'string' } },
    { name: 'address', description: 'CORRESPONDENCE (default) or REGISTRATION (same address: the customer has one).', schema: { type: 'string', enum: ['CORRESPONDENCE', 'REGISTRATION'] } },
  ],
  example: {
    rows: [{ id: 'customer-uuid', code: 'C000123', customer: 'Mr. Chinedu Okafor', address: '12 Allen Avenue', city: 'Ikeja', state: 'Lagos', customerAddress: '12 Allen Avenue, Ikeja, Lagos', phone: '+2348031234567', branchName: 'Main Branch' }],
    groups: [],
    totals: { count: 1, noAddress: 3 },
  },
  async run(db, scope, query) {
    const { rows, truncated, noAddress } = await loadMailingList(db, scope, query.city || null);
    const totals = { count: rows.length, noAddress };
    return { rows, groups: [], totals, summary: totals, truncated };
  },
});

export const PSF_REPORTS = [followUpList, analysis, modelAnalysis, statusList('DISSATISFIED'), statusList('CLOSED'), history, letter, mailingList];

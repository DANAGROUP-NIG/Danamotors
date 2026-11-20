/** OpenAPI for the late-delivery entry screens (mounted at /late-deliveries). Merged into the spec in config/swagger.ts. */
const uuid = { type: 'string', format: 'uuid' };
const ids = { job: '61616161-6161-4616-8616-616161616161', reason1: '62626262-6262-4626-8626-626262626262', reason2: '63636363-6363-4636-8636-636363636363', user: '64646464-6464-4646-8646-646464646464' };

export const lateDeliveryExamples = {
  save: { kind: 'DATE', reasonIds: [ids.reason1, ids.reason2], remarks: 'Compressor arrived a day late from the main store; customer informed by phone.' },
  listItem: {
    id: ids.job, jobNumber: '2026000006', jobType: 'SERVICE', promisedAt: '2026-01-02T16:00:00.000Z', deliveredAt: '2026-01-03T10:20:00.000Z',
    registration: 'LSD686KC', model: 'Sportage', variant: 'SPORTAGE 2.0 AT', serviceType: 'Paid service', serviceAdvisor: 'Ada Obi', branchName: 'Main Branch',
    daysLate: 1, minutesLate: 1100, reasonCount: 0, lateRemarks: null,
  },
  detail: {
    id: ids.job, jobNumber: '2026000006', jobType: 'SERVICE', jobDate: '2026-01-02T08:05:00.000Z', branch: { id: ids.user, name: 'Main Branch' },
    registration: 'LSD686KC', vin: 'KNAPU81BDM7012345', model: 'Sportage', variant: 'SPORTAGE 2.0 AT', customer: 'Chinedu Okafor', serviceType: 'Paid service',
    serviceAdvisor: 'Ada Obi', deliveryAdvisor: 'Ada Obi', gatePassNumber: 'GP2026000004', promisedAt: '2026-01-02T16:00:00.000Z', deliveredAt: '2026-01-03T10:20:00.000Z',
    billedAt: '2026-01-03T09:50:00.000Z', lateness: { kind: 'DATE', daysLate: 1, minutesLate: 1100 }, reasonIds: [ids.reason2], remarks: null,
    history: [{ id: 'audit-uuid', at: '2026-01-05T09:00:00.000Z', by: 'Musa Bello', kind: 'DATE', before: { reasonIds: [], remarks: null }, after: { reasonIds: [ids.reason2], remarks: null } }],
  },
};

const error = (description: string) => ({ description });
const errors = { 400: error('Validation failed, or the job was not delivered late of this kind (code NOT_LATE)'), 401: error('Sign in required'), 403: error('Permission or branch access denied'), 404: error('Not found') };
const ok = (example: unknown) => ({ 200: { description: 'OK', content: { 'application/json': { example: { status: 'success', statusCode: 200, data: example } } } }, ...errors });
const op = (summary: string, permission: string, description: string, extra: Record<string, unknown> = {}) => ({
  tags: ['Late Deliveries'], summary, description: `Requires ${permission}. ${description}`, security: [{ BearerAuth: [] }],
  responses: { 200: { description: 'OK: data holds the result' }, ...errors }, ...extra,
});
const kindParam = { in: 'query', name: 'kind', required: true, schema: { type: 'string', enum: ['DATE', 'TIME'] }, description: 'DATE: delivered on a later day than promised. TIME: delivered later on the promised day.' };
const jobParam = { in: 'path', name: 'jobCardId', required: true, schema: uuid };

export const lateDeliveryPaths: Record<string, Record<string, unknown>> = {
  '/late-deliveries/reasons': {
    get: op('Late-delivery reasons', 'jobcard:read', 'LATE_REASON masters in legend order (codes 1-6) with active.', {
      responses: ok([{ id: ids.reason1, code: '1', description: 'Engineer absent', active: true }, { id: ids.reason2, code: '2', description: 'Spare unavailable', active: true }]),
    }),
  },
  '/late-deliveries': {
    get: op('Jobs delivered late (worklist)', 'jobcard:late-reason:update', 'Delivered, not cancelled jobs late of the given kind, branch-scoped, newest promise first. dateFrom / dateTo filter the promised date (Africa/Lagos days). search matches job no or registration (spaces and dashes ignored). reasons = all (default), missing or recorded. counts gives all / missing / recorded for the same filters.', {
      parameters: [
        kindParam,
        ...['branchId', 'dateFrom', 'dateTo', 'search'].map((name) => ({ in: 'query', name, schema: { type: 'string' } })),
        { in: 'query', name: 'reasons', schema: { type: 'string', enum: ['all', 'missing', 'recorded'] } },
        ...['page', 'limit'].map((name) => ({ in: 'query', name, schema: { type: 'integer' } })),
      ],
      responses: ok({ items: [lateDeliveryExamples.listItem], counts: { all: 1, missing: 1, recorded: 0 }, meta: { page: 1, limit: 25, total: 1, totalPages: 1 } }),
    }),
  },
  '/late-deliveries/find': {
    get: op('Find a late job by job no or registration', 'jobcard:late-reason:update', 'q is a job number (exact) or a registration (the vehicle\'s most recent job delivered late of this kind). 400 NOT_LATE explains why a job cannot be opened (not delivered, on time, or late of the other kind); 403 for another branch.', {
      parameters: [kindParam, { in: 'query', name: 'q', required: true, schema: { type: 'string' } }, { in: 'query', name: 'branchId', schema: uuid }],
      responses: ok({ id: ids.job }),
    }),
  },
  '/late-deliveries/{jobCardId}': {
    get: op('Late delivery details of a job', 'jobcard:late-reason:update', 'Promised and delivered date-times, how late, reasons, delay remark and the correction history. 400 NOT_LATE when the job is not late of this kind.', {
      parameters: [jobParam, kindParam],
      responses: ok(lateDeliveryExamples.detail),
    }),
    put: op('Save late-delivery reasons and remark', 'jobcard:late-reason:update', 'One to six distinct LATE_REASON ids (an inactive one only if the job already has it) and an optional remark (≤ 1000). The job must be late of this kind and in the user\'s branch (unless branch:all). Audited as LATE_DELIVERY_REASONS_UPDATED with the previous values. changed=false when nothing differed.', {
      parameters: [jobParam],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['kind', 'reasonIds'] }, example: lateDeliveryExamples.save } } },
      responses: ok({ id: ids.job, changed: true }),
    }),
  },
};

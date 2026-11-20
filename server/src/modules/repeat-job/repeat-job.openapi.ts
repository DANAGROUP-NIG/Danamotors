/** OpenAPI for repeat jobs (mounted at /repeat-jobs). Merged into the spec in config/swagger.ts. */
const uuid = { type: 'string', format: 'uuid' };
const ids = {
  repeat: '51515151-5151-4515-8515-515151515151', job: '44444444-4444-4444-8444-444444444444', previous: '45454545-4545-4545-8545-454545454545',
  reason: '52525252-5252-4525-8525-525252525252', reason2: '53535353-5353-4535-8535-535353535353',
};

export const repeatJobExamples = {
  review: { reasonIds: [ids.reason, ids.reason2], remarks: 'Same AC noise as job 2026000346; compressor clutch not replaced and no road test recorded.' },
  notRepeat: { reasonIds: [ids.reason], remarks: 'Different complaint: customer back for a scheduled paid service.' },
  listItem: {
    id: ids.repeat, status: 'PENDING_REVIEW', source: 'AUTOMATIC', daysDifference: 9, kmDifference: 412, window: { days: 15, km: 500 },
    job: { id: ids.job, jobNumber: '2026001260', date: '2026-07-16T08:10:00.000Z', mileage: 60985, registration: 'GGE965JU', variant: 'SELTOS 1.6 EX AT' },
    previousJob: { id: ids.previous, jobNumber: '2026000346', date: '2026-07-07T09:00:00.000Z', mileage: 60573 },
    previousEngineer: 'Isiaka Kamorudeen', previousServiceAdvisor: 'Ada Obi', reasons: [],
  },
};

const error = (description: string) => ({ description });
const errors = { 400: error('Validation or business rule failed'), 401: error('Sign in required'), 403: error('Permission or branch access denied'), 404: error('Not found') };
const op = (summary: string, permission: string, description: string, extra: Record<string, unknown> = {}) => ({
  tags: ['Repeat Jobs'], summary, description: `Requires ${permission}. ${description}`, security: [{ BearerAuth: [] }],
  responses: { 200: { description: 'OK: data holds the result' }, ...errors }, ...extra,
});
const pathId = (name = 'id') => ({ in: 'path', name, required: true, schema: uuid });

export const repeatJobPaths: Record<string, Record<string, unknown>> = {
  '/repeat-jobs': {
    get: op('List repeat jobs', 'repeatjob:read', 'Branch-scoped, newest first; cancelled jobs are left out. status = PENDING_REVIEW (default), CONFIRMED, NOT_REPEAT or ALL. search matches the job no, previous job no, registration or VIN. Returns items, statusCounts (per status and ALL) and meta.', {
      parameters: [
        { in: 'query', name: 'status', schema: { type: 'string', enum: ['PENDING_REVIEW', 'CONFIRMED', 'NOT_REPEAT', 'ALL'] } },
        { in: 'query', name: 'source', schema: { type: 'string', enum: ['AUTOMATIC', 'MANUAL'] } },
        ...['branchId', 'search', 'dateFrom', 'dateTo'].map((name) => ({ in: 'query', name, schema: { type: 'string' } })),
        ...['page', 'limit'].map((name) => ({ in: 'query', name, schema: { type: 'integer' } })),
      ],
      responses: { 200: { description: 'OK', content: { 'application/json': { example: { status: 'success', data: { items: [repeatJobExamples.listItem], statusCounts: { PENDING_REVIEW: 1, CONFIRMED: 0, NOT_REPEAT: 0, ALL: 1 }, meta: { page: 1, limit: 25, total: 1, totalPages: 1 } } } } } }, ...errors },
    }),
  },
  '/repeat-jobs/reasons': {
    get: op('Repeat reason codes', 'jobcard:read', 'REPEAT_REASON masters in legend order with active and isNotRepeat (code 0 = not a repeat job).'),
  },
  '/repeat-jobs/job/{jobCardId}': {
    get: op('Repeat summary of a job card', 'jobcard:read', 'The repeat record of the job (or null) and the branch "print repeat block" setting, for the job card badge and print.', { parameters: [pathId('jobCardId')] }),
  },
  '/repeat-jobs/{id}': {
    get: op('Repeat job review details', 'repeatjob:read', 'Current and previous job side by side (job no, date, registration, variant, VIN, mileage, advisor, engineer, customer requests, work done), the differences, the window in force, reasons, reviewer, canReview, and the neighbouring pending records for save-and-next.', { parameters: [pathId()] }),
  },
  '/repeat-jobs/{id}/review': {
    put: op('Review a repeat job', 'repeatjob:review', 'One to five distinct reason codes and remarks. "Not a repeat job" (isNotRepeat) cannot be combined with others and sets NOT_REPEAT (the job leaves repeat counts; JobCard.isRepeat becomes false); any other code sets CONFIRMED. A reviewed record can be changed only by its reviewer or an Admin. Audited as REPEAT_JOB_REVIEWED.', {
      parameters: [pathId()],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['reasonIds', 'remarks'] }, examples: { confirmed: { value: repeatJobExamples.review }, notRepeat: { value: repeatJobExamples.notRepeat } } } } },
    }),
  },
};

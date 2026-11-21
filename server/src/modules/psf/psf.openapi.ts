/** OpenAPI for the post-service follow-up entry screen (mounted at /psf). Merged into the spec in config/swagger.ts. */
const uuid = { type: 'string', format: 'uuid' };
const ids = { job: '71717171-7171-4717-8717-717171717171', labour: '72727272-7272-4727-8727-727272727272', call: '73737373-7373-4737-8737-737373737373', customer: '74747474-7474-4747-8747-747474747474', branch: '75757575-7575-4757-8757-757575757575' };
const statusSchema = { type: 'string', enum: ['SATISFIED', 'DISSATISFIED', 'NO_PHONE', 'NOT_AVAILABLE', 'CLOSED'] };

export const psfExamples = {
  call: {
    status: 'DISSATISFIED',
    remark: 'AC still weak after the regas; asked for a callback from the service manager.',
    lines: [
      { key: 'SERVICE', status: 'SATISFIED' },
      { key: ids.labour, status: 'DISSATISFIED' },
    ],
    booking: { scheduledAt: '2026-11-25T09:00:00+01:00', serviceTypeId: null, notes: 'Recheck AC under warranty' },
  },
  listItem: {
    id: ids.job, jobNumber: '2026000412', deliveredAt: '2026-11-18T15:10:00.000Z', registration: 'LSD686KC', model: 'Sportage', serviceType: 'Running repair',
    customer: 'Chinedu Okafor', phones: '+2348031234567 / 012345678', branchName: 'Main Branch', status: 'NOT_AVAILABLE', callCount: 1,
    lastCalledAt: '2026-11-19T10:00:00.000Z', lastCalledBy: 'Ngozi Eze',
  },
  detail: {
    id: ids.job, jobNumber: '2026000412', jobDate: '2026-11-17T08:05:00.000Z', branch: { id: ids.branch, name: 'Main Branch' }, deliveredAt: '2026-11-18T15:10:00.000Z',
    mileage: 42150, registration: 'LSD686KC', vin: 'KNAPU81BDM7012345', model: 'Sportage', variant: 'SPORTAGE 2.0 AT', serviceType: { code: 'RR', description: 'Running repair' },
    serviceAdvisor: 'Ada Obi', deliveryAdvisor: 'Ada Obi',
    customer: {
      id: ids.customer, name: 'Chinedu Okafor', contactPerson: null, email: 'chinedu@example.com', phones: [{ label: 'Mobile', number: '+2348031234567' }],
      address: '12 Allen Avenue, Ikeja, Lagos', preferredFollowupDay: 'Monday', preferredFollowupTime: 'Morning', preferredContactMethod: 'Phone',
    },
    lines: [
      { key: 'SERVICE', kind: 'SERVICE', jobCardLabourId: null, code: 'RR', description: 'Running repair', major: false, status: 'NOT_AVAILABLE' },
      { key: ids.labour, kind: 'LABOUR', jobCardLabourId: ids.labour, code: 'AC-REGAS', description: 'AC regas', major: false, status: 'NOT_AVAILABLE' },
    ],
    followUp: { status: 'NOT_AVAILABLE', remark: 'Customer not available', callCount: 1, lastCalledAt: '2026-11-19T10:00:00.000Z', lastCalledBy: 'Ngozi Eze', closedAt: null, closedBy: null },
    calls: [
      {
        id: ids.call, status: 'NOT_AVAILABLE', remark: 'Customer not available', calledAt: '2026-11-19T10:00:00.000Z', calledBy: 'Ngozi Eze', bookingAt: null, bookingServiceType: null, appointment: null,
        lines: [{ code: 'RR', description: 'Running repair', status: 'NOT_AVAILABLE' }],
      },
    ],
    blockedReason: null,
    activeBooking: null,
  },
};

const error = (description: string) => ({ description });
const errors = {
  400: error('Validation failed, or the job cannot be followed up (code NOT_FOLLOWABLE: not delivered, cancelled or PDI)'),
  401: error('Sign in required'),
  403: error('Permission or branch access denied'),
  404: error('Not found'),
};
const ok = (example: unknown, code = 200) => ({ [code]: { description: 'OK', content: { 'application/json': { example: { status: 'success', statusCode: code, data: example } } } }, ...errors });
const op = (summary: string, permission: string, description: string, extra: Record<string, unknown> = {}) => ({
  tags: ['Post-service Follow-up'], summary, description: `Requires ${permission}. ${description}`, security: [{ BearerAuth: [] }],
  responses: { 200: { description: 'OK: data holds the result' }, ...errors }, ...extra,
});
const jobParam = { in: 'path', name: 'jobCardId', required: true, schema: uuid };

export const psfPaths: Record<string, Record<string, unknown>> = {
  '/psf/service-types': {
    get: op('Service types for a booking', 'psf:read', 'Active, non-PDI SERVICE_TYPE masters in display order, for the optional booking made from a call.', {
      responses: ok([{ id: 'service-type-uuid', code: 'RG', description: 'Regular service' }]),
    }),
  },
  '/psf/jobs': {
    get: op('Delivered jobs to follow up (worklist)', 'psf:read', 'Delivered, not cancelled, non-PDI jobs, branch-scoped, newest delivery first, with their current follow-up status (the last call). dateFrom / dateTo filter the delivery date (Africa/Lagos days). search matches job no, registration (spaces and dashes ignored) or customer name. state = toCall (default: never followed up, or no phone / not available), dissatisfied, satisfied, closed or all; counts gives every tab for the same filters.', {
      parameters: [
        ...['branchId', 'dateFrom', 'dateTo', 'search'].map((name) => ({ in: 'query', name, schema: { type: 'string' } })),
        { in: 'query', name: 'state', schema: { type: 'string', enum: ['toCall', 'dissatisfied', 'satisfied', 'closed', 'all'] } },
        ...['page', 'limit'].map((name) => ({ in: 'query', name, schema: { type: 'integer' } })),
      ],
      responses: ok({ items: [psfExamples.listItem], counts: { all: 40, toCall: 12, dissatisfied: 2, satisfied: 25, closed: 1 }, meta: { page: 1, limit: 25, total: 12, totalPages: 1 } }),
    }),
  },
  '/psf/find': {
    get: op('Find a job by job no or registration', 'psf:read', 'q is a job number (exact) or a registration (the vehicle\'s most recent delivered job). 400 NOT_FOLLOWABLE explains why a job cannot be followed up; 403 for another branch.', {
      parameters: [{ in: 'query', name: 'q', required: true, schema: { type: 'string' } }, { in: 'query', name: 'branchId', schema: uuid }],
      responses: ok({ id: ids.job }),
    }),
  },
  '/psf/jobs/{jobCardId}': {
    get: op('Follow-up of a job', 'psf:read', 'Job, vehicle and customer (every phone, address, preferred follow-up day / time / method), the lines followed up (the service type, then labour lines marked for follow-up analysis) with their current status, the current follow-up and every call, newest first. blockedReason is set when no further call can be recorded (follow-up closed). activeBooking is the vehicle\'s open booking, if any.', {
      parameters: [jobParam],
      responses: ok(psfExamples.detail),
    }),
  },
  '/psf/jobs/{jobCardId}/calls': {
    post: op('Record a follow-up call', 'psf:update', 'Adds a call (every attempt is kept) and makes it the job\'s current follow-up. status is 1-5 (SATISFIED, DISSATISFIED, NO_PHONE, NOT_AVAILABLE, CLOSED). For SATISFIED / DISSATISFIED give lines: every line key of the job once (SERVICE for the service type, the job card labour id for labour), each SATISFIED or DISSATISFIED; a SATISFIED call cannot have a dissatisfied line. For the other statuses lines are ignored and take the call status. A remark is required for DISSATISFIED and CLOSED (blank SATISFIED = "Customer satisfied"). booking (only with SATISFIED / DISSATISFIED) creates a booking (source PSF) or links the vehicle\'s active one. 409 PSF_CLOSED once the follow-up is closed. Audited as PSF_CALL_RECORDED.', {
      parameters: [jobParam],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: { status: statusSchema } }, example: psfExamples.call } } },
      responses: ok({ id: ids.job, callId: ids.call, status: 'DISSATISFIED', statusLabel: 'Customer dissatisfied', booking: { id: 'booking-uuid', bookingNumber: 'BK2026000101', linked: false } }, 201),
    }),
  },
};

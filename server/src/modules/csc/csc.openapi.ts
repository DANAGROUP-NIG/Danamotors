/** OpenAPI for CSC (mounted at /csc). Merged into the spec in config/swagger.ts. */
const uuid = { type: 'string', format: 'uuid' };
const ids = {
  model: '61616161-6161-4616-8616-616161616161', service: '62626262-6262-4626-8626-626262626262', reason: '63636363-6363-4636-8636-636363636363',
  case: '64646464-6464-4646-8646-646464646464', user: '65656565-6565-4656-8656-656565656565',
};

export const cscExamples = {
  saveRules: {
    modelIds: [ids.model], effectiveDate: '2026-12-01', notVisitedMonths: 48, matchDaysBefore: 10, matchDaysAfter: 10,
    services: [{ serviceTypeId: ids.service, dueDays: 90, dueKm: 5000, rotationDays: 90, rotationKm: 5000, followUp1Days: 15, followUp2Days: 5, variationDays: 45, variationKm: 2500, active: true }],
  },
  reason: { code: 'R0009', description: 'Customer travelling, call next month', shortDescription: 'TRAVEL', closureType: 'PARTIAL', active: true },
  generate: { from: '2026-12-01', to: '2026-12-31', modelIds: [ids.model], serviceTypeIds: [ids.service] },
  generated: {
    from: '2026-12-01', to: '2026-12-31', vehiclesChecked: 412, due: 57, created: 55, alreadyGenerated: 2, alreadyVisited: 3,
    byService: [{ code: '2F', description: 'SECOND SERVICE', due: 9 }, { code: 'RG', description: 'PAID SERVICE', due: 48 }],
    skipped: { noStartDate: 4, notVisitedRecently: 31, noSchedule: 0 },
  },
  followUp: {
    stage: 'FIRST',
    contacts: [
      { slot: 1, contactDate: '2026-11-18', contactPerson: 'Owner', remarks: 'No answer', doneById: ids.user },
      { slot: 2, contactDate: '2026-11-20', contactPerson: 'Driver', remarks: 'Will bring it on Monday', doneById: ids.user },
    ],
    booking: { scheduledAt: '2026-11-23T09:00:00+01:00', notes: 'Customer prefers morning' },
    closure: null,
  },
  close: { stage: 'SECOND', contacts: [{ slot: 1, contactDate: '2026-11-20', remarks: 'Vehicle sold last month' }], closure: { reasonId: ids.reason, remarks: 'Sold to a buyer in Kano' } },
};

const error = (description: string) => ({ description });
const errors = { 400: error('Validation or business rule failed'), 401: error('Sign in required'), 403: error('Permission or branch access denied'), 404: error('Not found'), 409: error('Conflict with the current state') };
const op = (summary: string, permission: string, description: string, extra: Record<string, unknown> = {}) => ({
  tags: ['CSC'], summary, description: `Requires ${permission}. ${description}`, security: [{ BearerAuth: [] }],
  responses: { 200: { description: 'OK: data holds the result' }, ...errors }, ...extra,
});
const pathId = (name = 'id') => ({ in: 'path', name, required: true, schema: uuid });
const body = (examples: Record<string, unknown>) => ({ required: true, content: { 'application/json': { schema: { type: 'object' }, examples: Object.fromEntries(Object.entries(examples).map(([key, value]) => [key, { value }])) } } });
const q = (name: string, schema: Record<string, unknown>, required = false) => ({ in: 'query', name, required, schema });

export const cscPaths: Record<string, Record<string, unknown>> = {
  '/csc/rules/models': { get: op('Models with their CSC schedule versions', 'csc:master:read', 'Every MODEL master (active first) with its versions (effective date, number of services).') },
  '/csc/rules': {
    get: op('A model\'s CSC schedule', 'csc:master:read', 'Versions newest first; each has notVisitedMonths, the match window and its services (due, rotation, follow-up and variation days/km).', { parameters: [q('modelId', uuid, true)] }),
    put: op('Save a CSC schedule version', 'csc:master:update', 'Inserts or updates the rule per model, service and effective date. A later effective date supersedes earlier versions for vehicles sold from that date; old versions are kept. Applying to several models saves the same version on each. Audited as CSC_RULES_SAVED.', { requestBody: body({ save: cscExamples.saveRules }) }),
  },
  '/csc/service-types': { get: op('Service types for the schedule', 'csc:master:read', 'Active SERVICE_TYPE masters.') },
  '/csc/close-reasons': {
    get: op('Closure reasons', 'csc:master:read or csc:case:read', 'Active reasons by code; includeInactive=true adds deactivated ones. used = cases and stage closures that refer to it.', { parameters: [q('includeInactive', { type: 'boolean' })] }),
    post: op('Add a closure reason', 'csc:master:update', 'FINAL closes the case ("final closure"); PARTIAL closes the current follow-up stage only ("particular follow-up closure"). Codes are unique.', { requestBody: body({ partial: cscExamples.reason }), responses: { 201: { description: 'Created' }, ...errors } }),
  },
  '/csc/close-reasons/{id}': {
    put: op('Edit a closure reason', 'csc:master:update', 'Description, short description, closure type and active. The code cannot change.', { parameters: [pathId()], requestBody: body({ edit: { description: 'Customer travelling', shortDescription: 'TRAVEL', closureType: 'PARTIAL', active: false } }) }),
    delete: op('Delete an unused closure reason', 'csc:master:update', 'Refused (409) once the reason is used on a case: deactivate it instead.', { parameters: [pathId()] }),
  },
  '/csc/cases/generate': {
    post: op('Generate CSC cases', 'csc:case:generate', 'Creates a case for every vehicle whose next service falls due from..to (at most 366 days), for the chosen models and services (omit = all). Branch-scoped users generate for their branch; cross-branch users for branchId or all branches. Idempotent: an existing case (vehicle, service, due date) is not duplicated. Vehicles already visited inside the match window are created as VISITED. Audited as CSC_CASES_GENERATED.', {
      requestBody: body({ generate: cscExamples.generate }),
      responses: { 200: { description: 'OK', content: { 'application/json': { example: { status: 'success', data: cscExamples.generated } } } }, ...errors },
    }),
  },
  '/csc/cases': {
    get: op('Follow-up list', 'csc:case:read', 'stage FIRST (1st follow-up date in from..to), SECOND (2nd follow-up date; only cases whose 1st follow-up is done unless includeFirstNotDone) or NOT_VISITED (due date in from..to and the window after it passed; daysNotVisited, onlyFollowedUp). state DUE (open, stage not done), DONE (contact or closure recorded at the stage) or BOTH (every case in the range; on NOT_VISITED, open or done there). Returns items, stateCounts and meta. Re-matches visits for the branch first.', {
      parameters: [
        q('stage', { type: 'string', enum: ['FIRST', 'SECOND', 'NOT_VISITED'] }, true), q('state', { type: 'string', enum: ['DUE', 'DONE', 'BOTH'] }),
        q('from', { type: 'string', format: 'date' }, true), q('to', { type: 'string', format: 'date' }, true), q('includeFirstNotDone', { type: 'boolean' }),
        q('daysNotVisited', { type: 'integer' }), q('onlyFollowedUp', { type: 'boolean' }), q('modelId', { type: 'string' }), q('serviceTypeId', { type: 'string' }),
        q('search', { type: 'string' }), q('branchId', uuid), q('page', { type: 'integer' }), q('limit', { type: 'integer' }),
      ],
    }),
  },
  '/csc/cases/{id}': { get: op('A CSC case', 'csc:case:read', 'Customer contact and preferences, vehicle, previous visit, the visit (with timing EARLY / ON_TIME / LATE), booking, closure and the contacts and closure of each stage. Another branch\'s case returns 403.', { parameters: [pathId()] }) },
  '/csc/cases/{id}/follow-up': {
    put: op('Save a follow-up', 'csc:followup:update', 'Open cases only. Replaces the stage\'s contact lines (slots 1–3, dated today or earlier). booking creates a booking (source CSC) for the case\'s customer, or links the vehicle\'s active booking. closure needs an active reason: PARTIAL closes the stage, FINAL closes the case (and cannot be combined with a booking). One transaction, audited as CSC_FOLLOWUP_SAVED.', {
      parameters: [pathId()], requestBody: body({ contactAndBook: cscExamples.followUp, finalClosure: cscExamples.close }),
    }),
  },
  '/csc/summary': { get: op('Follow-up counts', 'csc:case:read', 'Open cases, 1st and 2nd follow-ups due today or earlier (not yet overdue), not visited, booked, visited and closed this month.', { parameters: [q('branchId', uuid)] }) },
  '/csc/staff': { get: op('Staff for "done by"', 'csc:case:read', 'Active users of the branch.', { parameters: [q('branchId', uuid)] }) },
};

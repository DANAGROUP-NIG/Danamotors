/** OpenAPI for the PDI module (mounted at /pdi). Merged into the spec in config/swagger.ts. */
const uuid = { type: 'string', format: 'uuid' };
const ids = {
  branch: '33333333-3333-4333-8333-333333333333', job: '44444444-4444-4444-8444-444444444444', vehicle: '22222222-2222-4222-8222-222222222222',
  serviceType: '77777777-7777-4777-8777-777777777777', bay: '88888888-8888-4888-8888-888888888888', advisor: '99999999-9999-4999-8999-999999999999',
  engineer: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', team: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', defect: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  tyreMake: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', part: '55555555-5555-4555-8555-555555555555', line: '66666666-6666-4666-8666-666666666666',
  labour: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', technician: 'ffffffff-ffff-4fff-8fff-ffffffffffff', catalogue: '12121212-1212-4212-8212-121212121212',
  colour: '13131313-1313-4313-8313-131313131313', requisition: '14141414-1414-4414-8414-141414141414',
};

export const pdiExamples = {
  open: {
    branchId: ids.branch, vehicleId: ids.vehicle, serviceTypeId: ids.serviceType, mileage: 12, bayId: ids.bay, serviceAdvisorId: ids.advisor,
    engineerId: ids.engineer, teamId: ids.team, promisedAt: '2026-11-20T15:00:00.000Z', pdiRegistration: '123456',
    defects: [{ defectId: ids.defect, spare: 4500, oil: 0, labour: 3000 }, { description: 'Rear bumper scratch', labour: 6000 }],
    tyres: [{ makeId: ids.tyreMake, number: 'TY-0001' }, { makeId: ids.tyreMake, number: 'TY-0002' }],
  },
  vehicle: { vin: 'KNADN512BM6123456', catalogueId: ids.catalogue, colourId: ids.colour, engineNumber: 'G4FG123456', acType: 'FACTORY' },
  update: { pdiRegistration: 'TMP-3456', remarks: 'Customer asked for delivery on Friday' },
  requisition: { branchId: ids.branch, jobCardId: ids.job, chargeType: 'WARRANTY', mileage: 12, pickingListNumber: 'PL-0042', lines: [{ sparePartId: ids.part, quantityRequired: 1, quantityIssued: 1 }] },
  goodwill: { branchId: ids.branch, jobCardId: ids.job, chargeType: 'GOODWILL', goodwillReason: 'Dealer contribution', lines: [{ sparePartId: ids.part, quantityRequired: 2, quantityIssued: 2, approvalPercent: 60, customerPercent: 40 }] },
  returnSlip: { requisitionId: ids.requisition, lines: [{ requisitionLineId: ids.line, quantity: 1 }] },
  labour: { branchId: ids.branch, jobCardId: ids.job, groupId: ids.team, engineerId: ids.engineer, lines: [{ labourItemId: ids.labour, chargeType: 'FREE', technicianId: ids.technician, chargedHours: 1.5 }] },
  billPreview: { jobCardId: ids.job, partsDiscountPercent: 0, labourDiscountPercent: 0 },
  bill: { jobCardId: ids.job, billType: 'ZERO', deliveryAdvisorId: ids.advisor, partsDiscountPercent: 0, labourDiscountPercent: 0, remarks: 'All PDI work under warranty and FOC' },
  invoiceBill: { jobCardId: ids.job, billType: 'INVOICE', deliveryAdvisorId: ids.advisor, creditCompany: 'Fleet Leasing Ltd', cardNumber: 'FL-889', partsDiscountPercent: 5, labourDiscountPercent: 0 },
  settings: { jobFreezeDate: '2026-10-31', billEditAfterPrint: false, roundBill: true, includeInHistory: false, postBillsToTally: true, invoiceTitle: 'PDI INVOICE', cashMemoTitle: 'PDI CASH MEMO' },
};

const error = (description: string) => ({ description });
const errors = { 400: error('Validation or business rule failed'), 401: error('Sign in required'), 403: error('Permission or branch access denied'), 404: error('Not found') };
const json = (example: unknown) => ({ required: true, content: { 'application/json': { schema: { type: 'object' }, example } } });
const op = (summary: string, permission: string, description: string, extra: Record<string, unknown> = {}) => ({
  tags: ['PDI'], summary, description: `Requires ${permission}. ${description}`, security: [{ BearerAuth: [] }],
  responses: { 200: { description: 'OK: data holds the result' }, ...errors }, ...extra,
});
const created = (summary: string, permission: string, description: string, example: unknown) => ({
  ...op(summary, permission, description, { requestBody: json(example) }),
  responses: { 201: { description: 'Created' }, ...errors, 409: error('Conflict: frozen date, print rule, duplicate or concurrent change') },
});
const pathId = { in: 'path', name: 'id', required: true, schema: uuid };
const listParams = ['branchId', 'jobCardId', 'search', 'dateFrom', 'dateTo', 'page', 'limit'].map(name => ({ in: 'query', name, schema: { type: name === 'page' || name === 'limit' ? 'integer' : 'string' } }));

export const pdiPaths: Record<string, Record<string, unknown>> = {
  '/pdi': {
    get: op('List PDI job cards', 'pdi:read', 'Branch-scoped. Filters: status, vin, search (job no, PDI registration, VIN, model), dateFrom/dateTo (Lagos days). Returns items, statusCounts and meta.', {
      parameters: ['branchId', 'status', 'vin', 'search', 'dateFrom', 'dateTo', 'page', 'limit'].map(name => ({ in: 'query', name, schema: { type: 'string' } })),
    }),
    post: created('Open a PDI job card', 'pdi:create', 'Own number series (P + YYYY######). PDI registration defaults to the last 6 characters of the VIN and is stored on the job card only. Only PDI service types; at least one defect line; customer defaults to the PDI settings customer. Tyres and battery are saved to the vehicle. No warranty case is opened; open campaigns must be acknowledged.', pdiExamples.open),
  },
  '/pdi/{id}': {
    parameters: [pathId],
    get: op('PDI job card detail', 'pdi:read', 'Defects with totals, requisitions, returns and labour slips with footer totals, bill, status history and allowed actions.'),
    patch: { ...op('Edit a PDI job card', 'pdi:update', 'Header fields, defects (replaced), tyres and battery. Freeze date and edit before/after print rules apply.', { requestBody: json(pdiExamples.update) }) },
  },
  '/pdi/{id}/work-done': { parameters: [pathId], post: op('Record PDI work done', 'pdi:update', 'Moves the job to QC (through IN_PROGRESS when still open).', { requestBody: json({ workDone: 'Fitted bulb; polished bumper' }) }) },
  '/pdi/{id}/vehicle-ready': { parameters: [pathId], post: op('Mark the vehicle ready', 'pdi:update', 'The PDI is the inspection: records QC passed and moves the job to READY. Linked campaigns need an attended answer. Notifies billing.', { requestBody: json({ remarks: 'Inspection passed' }) }) },
  '/pdi/{id}/cancel': { parameters: [pathId], post: op('Cancel a PDI job card', 'pdi:update', 'Only with no issued parts or labour left on the job.', { requestBody: json({ reason: 'Vehicle transferred to another branch' }) }) },
  '/pdi/settings': {
    get: op('PDI settings', 'pdi:read', 'Company-wide: freeze dates, edit before/after print, round bill, default customer, include in history, Tally posting, print titles.'),
    put: op('Change PDI settings', 'pdi:settings', 'Partial update; dates are YYYY-MM-DD or null.', { requestBody: json(pdiExamples.settings) }),
  },
  '/pdi/service-types': { get: op('PDI service types for a vehicle', 'pdi:create', 'Only pre-delivery (PDI category) service types with the model charge.', { parameters: [{ in: 'query', name: 'vehicleId', required: true, schema: uuid }, { in: 'query', name: 'date', schema: { type: 'string', format: 'date' } }] }) },
  '/pdi/defects': { get: op('PDI defect master', 'pdi:read', 'Active PDI defects with their group and the vehicle model estimate (parts, oil, labour).', { parameters: ['search', 'vehicleId', 'limit'].map(name => ({ in: 'query', name, schema: { type: 'string' } })) }) },
  '/pdi/vehicles': {
    get: op('Find vehicles by VIN', 'pdi:read', 'Exact VIN or VIN ending; includes PDI done/date, tyres and recent PDI jobs.', { parameters: [{ in: 'query', name: 'vin', required: true, schema: { type: 'string', minLength: 3 } }] }),
    post: created('Create a new vehicle for PDI', 'pdi:create', 'From the catalogue variant and colour, with engine number. No registration number (a new vehicle has no plate).', pdiExamples.vehicle),
  },
  '/pdi/vehicles/{id}/jobs': { parameters: [pathId], get: op('PDI jobs of a vehicle', 'pdi:read', 'For the PDI tab of the vehicle page. These jobs are never in the service history.') },
  '/pdi/requisitions': {
    get: op('PDI requisition register', 'pdi:read', 'Requisitions of PDI jobs with footer totals.', { parameters: listParams }),
    post: created('Issue parts to a PDI job (IPO)', 'pdi:update', 'Same engine as service requisitions: rate snapshot, approval/customer split, stock check and deduction in one transaction. Numbers P + YYYY######; warranty requisitions PW + YYYY######. Warranty needs no warranty case and FOC needs no campaign on PDI jobs. No signed-estimate gate. GOODWILL also needs requisition:goodwill.', pdiExamples.requisition),
  },
  '/pdi/requisitions/{id}': { parameters: [pathId], get: op('PDI requisition', 'pdi:read', 'Lines with qty required/issued/returned, rate, amount, approval and customer shares; footer totals.') },
  '/pdi/requisitions/{id}/cancel': { parameters: [pathId], post: op('Cancel a PDI requisition', 'pdi:update', 'Returns stock. Freeze date and print rules apply.', { requestBody: json({ reason: 'Issued against the wrong job' }) }) },
  '/pdi/returns': {
    get: op('PDI return register', 'pdi:read', 'Returns of PDI jobs with footer totals.', { parameters: listParams }),
    post: created('Return parts from a PDI requisition', 'pdi:update', 'Quantity returned ≤ issued − already returned; stock goes back in the same transaction.', pdiExamples.returnSlip),
  },
  '/pdi/returns/{id}': { parameters: [pathId], get: op('PDI return', 'pdi:read', 'Return lines and totals.') },
  '/pdi/returns/{id}/cancel': { parameters: [pathId], post: op('Cancel a PDI return', 'pdi:update', 'Takes the stock back out. Freeze date and print rules apply.', { requestBody: json({ reason: 'Wrong quantity' }) }) },
  '/pdi/labour-slips': {
    get: op('PDI labour slip register', 'pdi:read', 'Labour slips with totals by charge type (warranty, non-warranty, FOC, goodwill).', { parameters: listParams }),
    post: created('Record a PDI labour slip', 'pdi:update', 'Labour code from the labour master, standard hours and model rate; W/T/Q charge type per line.', pdiExamples.labour),
  },
  '/pdi/labour-slips/{id}': { parameters: [pathId], get: op('PDI labour slip', 'pdi:read', 'Lines and totals by charge type.') },
  '/pdi/labour-slips/{id}/lines': { parameters: [pathId], post: op('Add a PDI labour line', 'pdi:update', 'Freeze date and print rules apply.', { requestBody: json(pdiExamples.labour.lines[0]) }) },
  '/pdi/bills': { get: op('PDI bill register', 'pdi:read', 'PDI bills with type (CASH, INVOICE, ZERO), total and Tally voucher.', { parameters: listParams }) ,
    post: created('Create a PDI bill', 'pdi:bill', 'Lines come only from the job requisitions (net of returns), labour and service charge; amounts cannot be edited. ZERO only when nothing is chargeable; INVOICE needs a credit company. Number P + YYYY######. Sets PDI done and PDI date on the vehicle.', pdiExamples.bill) },
  '/pdi/bills/preview': { post: op('Preview a PDI bill', 'pdi:bill', 'Live totals from the server for the chosen discounts; lists chargeable and no-charge lines and the suggested bill type.', { requestBody: json(pdiExamples.billPreview) }) },
  '/pdi/bills/{id}': { parameters: [pathId], get: op('PDI bill', 'pdi:bill or pdi:read', 'Bill, print title (PDI INVOICE or PDI CASH MEMO from settings), job lines and the voucher number/type of the accounts posting.') },
  '/pdi/bills/{id}/cancel': { parameters: [pathId], post: op('Cancel a PDI bill', 'pdi:bill', 'Not after Tally export or receipts. Reopens the job as READY and undoes PDI done on the vehicle.', { requestBody: json({ reason: 'Wrong bill type' }) }) },
  '/pdi/print/{kind}/{id}': { parameters: [{ in: 'path', name: 'kind', required: true, schema: { type: 'string', enum: ['job', 'requisition', 'return', 'labour', 'bill'] } }, pathId], post: op('Record the first print of a PDI document', 'pdi:read', 'Edit-after-print rules apply from the first print.') },
};

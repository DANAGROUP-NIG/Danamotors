import test from 'node:test';

import assert from 'node:assert/strict';

import fs from 'node:fs';

import path from 'node:path';

import vm from 'node:vm';

import { createRequire } from 'node:module';

import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const require = createRequire(import.meta.url);

const root = fileURLToPath(new URL('../', import.meta.url));

function load(relative) {

  const file = path.join(root, relative);

  const module = { exports: {} };

  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, { require, module, exports: module.exports, Intl, Date }, { filename: file });

  return module.exports;

}

const logic = load('features/service-transactions/transaction.logic.ts');

test('booking date entry and output use Lagos independently of the browser timezone', () => {

  assert.equal(logic.lagosIso('2026-10-21T10:30'), '2026-10-21T09:30:00.000Z');

  assert.equal(logic.lagosIso('2026-10-21T09:30:00Z'), '2026-10-21T09:30:00.000Z');

  assert.equal(logic.lagosInput('2026-10-21T23:30:00Z'), '2026-10-22T00:30');

});

test('booking service and requests remain optional', () => {

  const schema = load('features/appointments/schemas/appointment.schema.ts').createAppointmentSchema;

  assert.equal(schema.safeParse({ customerId: 'customer', vehicleId: 'vehicle', branchName: 'branch', scheduledAt: '2026-10-21T10:30' }).success, true);

});

test('transaction write guard accounts for invoices and all terminal statuses', () => {

  for (const status of ['BILLED','DELIVERED','CANCELLED','Closed']) assert.equal(logic.canWriteTransactions({ status }), false);

  assert.equal(logic.canWriteTransactions({ status: 'OPEN', invoices: [{ status: 'Posted' }] }), false);

  assert.equal(logic.canWriteTransactions({ status: 'READY', invoices: [{ status: 'VOID' }] }), true);

});

test('returns count only active previous returns and never expose a negative allowance', () => {

  assert.equal(logic.remainingReturn({ quantityIssued: 5, returns: [{ quantity: 2, status: 'Completed' }, { quantity: 3, status: 'Cancelled' }] }), 3);

  assert.equal(logic.remainingReturn({ quantityIssued: 1, returns: [{ quantity: 2, status: 'Completed' }] }), 0);

});


const booking = load('features/service-transactions/booking.logic.ts');
test('conversion starts from the saved booking and leaves an editable blank complaint for optional requests', () => {
  const source = { id: 'booking', customerId: 'customer', vehicleId: 'vehicle', branch: { name: 'Branch' }, serviceTypeId: 'service', mileage: 42, requests: [{ description: 'Saved noise', complaintCodeId: null, defectCode: 'DEFECT', estimatedParts: '0.10', estimatedOil: '0.20', estimatedLabour: '12.35' }] };
  const values = booking.bookingOpeningValues(source);
  assert.equal(values.appointmentId, 'booking'); assert.equal(values.customerId, 'customer'); assert.equal(values.vehicleId, 'vehicle');
  assert.equal(values.complaints[0].spare, 0.1); assert.equal(values.complaints[0].description, 'Saved noise');
  assert.equal(booking.bookingOpeningValues({ ...source, requests: [] }).complaints.length, 1);
  assert.equal(booking.bookingOpeningValues({ ...source, requests: [] }).complaints[0].description, '');
});
test('converted, linked and terminal legacy bookings cannot be edited', () => {
  for (const bookingStatus of ['CONVERTED','CANCELLED','NO_SHOW']) assert.equal(logic.canEditBooking({ status: 'Pending', bookingStatus }), false);
  assert.equal(logic.canEditBooking({ status: 'Completed' }), false);
  assert.equal(logic.canEditBooking({ status: 'Pending', jobCards: [{}] }), false);
  assert.equal(logic.canEditBooking({ status: 'Pending', bookingStatus: 'BOOKED' }), true);
});

test('labour payload keeps one assignee and sends campaign/reason only for the selected payer', () => {
  const body = logic.labourBody({ labourItemId: 'operation', chargeType: 'CUSTOMER', technicianId: 'technician', mechanicId: '', campaignId: 'old-campaign', reason: 'old reason', groupId: '' });
  assert.equal(body.technicianId, 'technician'); assert.equal(body.mechanicId, undefined); assert.equal(body.campaignId, undefined); assert.equal(body.reason, undefined); assert.equal(body.groupId, undefined);
  assert.equal(logic.labourBody({ labourItemId: 'operation', chargeType: 'GOODWILL', mechanicId: 'employee', reason: '  Approved reason  ' }).reason, 'Approved reason');
});

test('job opening uses the conversion endpoint only for a linked booking', async () => {
  const requests = []; const module = { exports: {} };
  const source = fs.readFileSync(path.join(root, 'features/job-cards/api/job-card.api.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { module, exports: module.exports, URLSearchParams, require: name => name.endsWith('apiClient') ? { apiPost: async (url, body) => { requests.push({ url, body }); return { jobCard: { id: 'created-job' } }; } } : { API_ROUTES: { service: { jobCards: { base: '/service/job-cards' } } } } });
  assert.equal((await module.exports.createJobCardRequest({ appointmentId: 'saved-booking', vehicleId: 'vehicle', serviceId: '' })).id, 'created-job');
  await module.exports.createJobCardRequest({ appointmentId: '', vehicleId: 'vehicle' });
  assert.equal(requests[0].url, '/service/appointments/saved-booking/convert');
  assert.equal(requests[0].body.serviceId, undefined);
  assert.equal(requests[1].url, '/service/job-cards');
});

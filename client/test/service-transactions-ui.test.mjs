import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const dependency = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const folder = 'features/service-transactions/components/';
const job = { id: 'job', branchId: 'branch', jobNumber: 'JOB-001', status: 'OPEN', qcStatus: 'Pending', vehicleId: 'vehicle', vehicle: { registrationNumber: 'REG-001', vin: 'SYNTHETICVIN', model: 'Synthetic model', trim: 'Variant' }, mileage: 1234, estimates: [{ id: 'estimate', version: 1, status: 'Approved' }], campaigns: [] };
function render(name, { permissions = [], card = job, data, error = false, props = {} } = {}) {
  const cache = new Map(); const queries = [];
  const mocks = {
    'features/auth/hooks/use-auth': { useAuth: () => ({ hasPermission: permission => permissions.includes(permission) }) },
    'features/service-transactions/hooks/use-service-transactions': { useServiceAction: () => ({ mutate: () => {}, isPending: false }), useServiceData: (url, enabled = true) => { queries.push({ url, enabled }); return { data: data ?? { document: { id: 'document', remarks: 'Saved remarks' }, requisitions: [], returnSlips: [], labourSlips: [] }, isError: error, isLoading: false, refetch: () => {} }; } },
    'features/job-cards/components/WorkshopPicker': { WorkshopPicker: ({ label, disabled }) => React.createElement('label', null, label, React.createElement('input', { role: 'combobox', disabled, readOnly: true })) },
    'features/appointments/hooks/use-update-appointment': { useUpdateAppointment: () => ({ mutate: () => {}, isPending: false }) },
    'features/job-cards/components/JobCardOpeningModal': { JobCardOpeningModal: () => null },
    'features/job-cards/components/opening/CustomerRequestsTab': { requestTotals: rows => Object.fromEntries(['spare','oil','labour'].map(key => [key, rows.reduce((total, row) => total + Math.round((row[key] ?? 0) * 100), 0) / 100])) },
  };
  function load(file) {
    const relative = path.relative(root, file).replaceAll('\\', '/').replace(/\.tsx?$/, '');
    if (mocks[relative]) return mocks[relative];
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const require = specifier => {
      if (specifier === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
      if (!specifier.startsWith('@/') && !specifier.startsWith('.')) return dependency(specifier);
      const base = specifier.startsWith('@/') ? path.join(root, specifier.slice(2)) : path.resolve(path.dirname(file), specifier);
      const target = ['.tsx','.ts','.js','/index.ts'].map(ext => base + ext).find(candidate => fs.existsSync(candidate));
      if (!target) throw new Error(`Cannot resolve ${specifier}`);
      return load(target);
    };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { module, exports: module.exports, require, Intl, Date, URLSearchParams, console }, { filename: file });
    return module.exports;
  }
  const Component = load(path.join(root, folder + name + '.tsx'))[name];
  return { html: renderToStaticMarkup(React.createElement(Component, { job: card, ...props })), queries };
}
test('workspace hides all transaction actions without permissions', () => assert.equal(render('ServiceTransactions').html, ''));
test('requisition screen has required/issued quantities and hides unauthorized goodwill', () => {
  const { html } = render('RequisitionPanel', { permissions: ['requisition:create','requisition:read'] });
  for (const text of ['Quantity required','Quantity issued','Save and issue parts','No saved documents']) assert.ok(html.includes(text));
  assert.equal(html.includes('value="GOODWILL"'), false);
  assert.ok(render('RequisitionPanel', { permissions: ['requisition:create','requisition:goodwill'] }).html.includes('value="GOODWILL"'));
});
test('closed-job requisition and labour forms are disabled', () => {
  for (const name of ['RequisitionPanel','LabourPanel']) {
    const { html } = render(name, { card: { ...job, status: 'BILLED' }, permissions: ['requisition:create','jobcard:labour:update'] });
    assert.ok(html.includes('<fieldset disabled=""')); assert.ok(html.includes('read-only after billing'));
  }
});
test('return screen does not permit an empty return and displays load failures', () => {
  const { html } = render('ReturnPanel', { permissions: ['requisition:create','requisition:read'] });
  assert.match(html, /<button[^>]*disabled=""[^>]*>Save return slip/);
  assert.ok(render('ReturnPanel', { permissions: ['requisition:read'], error: true }).html.includes('Could not load documents'));
});
test('labour screen keeps a single technician or employee assignment and separates work done', () => {
  const { html } = render('LabourPanel', { permissions: ['jobcard:labour:update','jobcard:update','employee:read'] });
  for (const text of ['Charged hours','Technician login','Employee mechanic','Work done','Mark vehicle ready']) assert.ok(html.includes(text));
  assert.match(html, /<button[^>]*disabled=""[^>]*>Mark vehicle ready/);
  const ready = render('LabourPanel', { permissions: ['jobcard:update'], card: { ...job, status: 'QC', qcStatus: 'PASSED' } }).html;
  const button = ready.match(/<button[^>]*>Mark vehicle ready/)[0]; assert.equal(button.includes('disabled=""'), false);
});
test('remarks remain editable on delivered jobs with the dedicated permission', () => {
  const { html } = render('RemarksPanel', { card: { ...job, status: 'DELIVERED' }, permissions: ['jobcard:read','jobcard:remarks:update'] });
  assert.ok(html.includes('Changes are audited')); assert.ok(html.includes('Save remarks'));
  assert.equal(html.match(/<textarea[^>]*>/)[0].includes('disabled'), false);
  const readonly = render('RemarksPanel', { permissions: ['jobcard:read'] }).html;
  assert.equal(readonly.includes('Save remarks'), false); assert.ok(readonly.match(/<textarea[^>]*>/)[0].includes('disabled'));
});
test('print permission is checked before fetching an internal document', () => {
  const { html, queries } = render('ServiceDocumentPrint', { props: { kind: 'job-picking', id: 'job' } });
  assert.ok(html.includes('print permission')); assert.equal(queries.some(query => query.enabled), false);
});
test('picking output renders explicit internal fields and printable totals without leaking extra records', () => {
  const pickingList = { branch: { name: 'Synthetic branch' }, job: { number: 'JOB-001', date: '2026-10-21T09:30:00Z', mileage: 1234, remarks: 'Internal job remark' }, estimate: { number: 'EST-001', date: '2026-10-21T09:30:00Z', version: 2, status: 'Approved', currency: 'NGN', remarks: 'Internal estimate remark' }, vehicle: job.vehicle, lines: [{ lineId: 'line', partNumber: 'PART-001', flag: 'L', description: 'Filter', uom: 'UNIT', quantityRequired: 2, rate: 12.35, amount: 24.7 }], totals: { numberOfItems: 1, quantityRequired: 2, totalAmount: 24.7 }, printedAt: '2026-10-21T09:30:00Z', supplierPassword: 'SECRET-NOT-PRINTABLE' };
  const { html, queries } = render('ServiceDocumentPrint', { permissions: ['jobcard:picking-list:print'], props: { kind: 'job-picking', id: 'job' }, data: { pickingList } });
  for (const text of ['PART-001','Quantity required','Revision 2','Internal job remark','Internal estimate remark','Africa/Lagos','24.70']) assert.ok(html.includes(text));
  assert.equal(html.includes('SECRET-NOT-PRINTABLE'), false); assert.equal(queries[0].url, '/service/job-cards/job/picking-list/print');
});
test('converted booking is read-only and links to its job instead of permitting another conversion', () => {
  const appointment = { id: 'booking', branchId: 'branch', customerId: 'customer', vehicleId: 'vehicle', scheduledAt: '2026-10-22T09:30:00Z', createdAt: '2026-10-21T09:30:00Z', status: 'Pending', bookingStatus: 'CONVERTED', bookingNumber: 'BOOK-001', jobCards: [{ id: 'linked', jobNumber: 'JOB-001' }], requests: [] };
  const { html } = render('BookingPanel', { permissions: ['appointment:update','jobcard:create'], props: { appointment } });
  assert.ok(html.includes('BOOK-001')); assert.ok(html.includes('/job-cards/linked')); assert.equal(html.includes('Convert to job card'), false); assert.equal(html.includes('Save booking details'), false);
});

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
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, { require, module, exports: module.exports, Intl, Date, Math, Number, Set, Map }, { filename: file });
  return module.exports;
}

const logic = load('features/psf/lib/psf.logic.ts');

const lines = [{ key: 'SERVICE', status: null }, { key: 'a', status: 'DISSATISFIED' }];
const draft = (overrides = {}) => ({
  status: 'SATISFIED',
  remark: '',
  lineStatuses: { SERVICE: 'SATISFIED', a: 'SATISFIED' },
  booking: { enabled: false, date: '2099-01-01', time: '09:00', serviceTypeId: '', notes: '' },
  ...overrides,
});

test('keeps the legacy status codes 1-5 in legend order', () => {
  assert.deepEqual([...logic.PSF_STATUS_ORDER].map((status) => logic.PSF_STATUS[status].code), [1, 2, 3, 4, 5]);
});

test('satisfaction is satisfied over reached customers', () => {
  assert.equal(logic.satisfactionPct(2, 1), 66.67);
  assert.equal(logic.satisfactionPct(0, 0), null);
});

test('starts a new call from the last reached line statuses', () => {
  assert.deepEqual({ ...logic.initialLineStatuses(lines) }, { SERVICE: 'SATISFIED', a: 'DISSATISFIED' });
  assert.deepEqual({ ...logic.applyToAll(lines, 'DISSATISFIED') }, { SERVICE: 'DISSATISFIED', a: 'DISSATISFIED' });
});

test('checks the call like the server', () => {
  assert.equal(logic.callProblem(draft(), lines), null);
  assert.match(logic.callProblem(draft({ status: null }), lines), /outcome/);
  assert.match(logic.callProblem(draft({ lineStatuses: { SERVICE: 'SATISFIED', a: 'DISSATISFIED' } }), lines), /dissatisfied/);
  assert.match(logic.callProblem(draft({ status: 'DISSATISFIED' }), lines), /dissatisfied with/);
  assert.match(logic.callProblem(draft({ status: 'CLOSED' }), lines), /reason/);
  assert.equal(logic.callProblem(draft({ status: 'NOT_AVAILABLE', lineStatuses: {} }), lines), null);
  assert.match(logic.callProblem(draft({ status: 'NOT_AVAILABLE', booking: { ...draft().booking, enabled: true } }), lines), /booking needs/);
  assert.match(logic.callProblem(draft({ booking: { ...draft().booking, enabled: true, date: '2020-01-01' } }), lines), /past/);
});

test('sends lines only when the customer was reached, and the booking in Lagos time', () => {
  const reached = logic.callPayload(draft({ booking: { enabled: true, date: '2099-01-01', time: '09:30', serviceTypeId: '', notes: ' ' } }), lines);
  assert.equal(reached.lines.length, 2);
  assert.deepEqual({ ...reached.booking }, { scheduledAt: '2099-01-01T09:30:00+01:00', serviceTypeId: null, notes: null });
  const missed = logic.callPayload(draft({ status: 'NO_PHONE', remark: '  ' }), lines);
  assert.equal(missed.lines, undefined);
  assert.equal(missed.remark, null);
  assert.equal(missed.booking, null);
});

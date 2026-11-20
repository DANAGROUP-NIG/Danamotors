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

const logic = load('features/csc/lib/csc.logic.ts');
const today = '2026-11-20';
const draft = (over = {}) => ({ slot: 1, contactDate: today, contactPerson: '', remarks: '', doneById: '', ...over });

test('three contact lines per stage, filled from the saved calls', () => {
  const detail = { stages: { FIRST: { contacts: [{ slot: 2, contactDate: '2026-11-18', contactPerson: 'Owner', remarks: 'No answer', doneBy: { id: 'u1', name: 'A' } }], closure: null } } };
  const drafts = logic.contactDrafts(detail, 'FIRST', today, 'me');
  assert.equal(drafts.length, 3);
  assert.equal(drafts[0].doneById, 'me');
  assert.equal(drafts[1].contactPerson, 'Owner');
  assert.equal(drafts[1].doneById, 'u1');
});

test('the payload sends only filled lines and trims text', () => {
  const payload = logic.followUpPayload('SECOND', {
    contacts: [draft({ contactPerson: ' Driver ', doneById: 'u1' }), draft({ slot: 2 }), draft({ slot: 3, remarks: 'Call back' })],
    book: true, scheduledAt: '2026-11-25T09:00:00.000Z', bookingNotes: ' ', close: false, reasonId: '', closeRemarks: '',
  });
  assert.equal(JSON.stringify(payload), JSON.stringify({
    stage: 'SECOND',
    contacts: [{ slot: 1, contactDate: today, contactPerson: 'Driver', remarks: null, doneById: 'u1' }, { slot: 3, contactDate: today, contactPerson: null, remarks: 'Call back', doneById: null }],
    booking: { scheduledAt: '2026-11-25T09:00:00.000Z', notes: null },
    closure: null,
  }));
});

test('the form is checked like the server', () => {
  const now = new Date('2026-11-20T10:00:00Z');
  const base = { contacts: [draft({ remarks: 'ok' })], book: false, scheduledAt: '', close: false, reasonId: '' };
  assert.equal(logic.followUpProblem(base, today, now), null);
  assert.match(logic.followUpProblem({ ...base, contacts: [draft({ remarks: 'x', contactDate: '2026-11-21' })] }, today, now), /future/);
  assert.match(logic.followUpProblem({ ...base, close: true }, today, now), /reason/);
  assert.match(logic.followUpProblem({ ...base, book: true, scheduledAt: '2026-11-19T09:00:00Z' }, today, now), /past/);
  assert.match(logic.followUpProblem({ ...base, book: true, scheduledAt: '2026-11-22T09:00:00Z', close: true, reasonId: 'r', reasonType: 'FINAL' }, today, now), /cannot also be booked/);
  assert.match(logic.followUpProblem({ ...base, contacts: [draft()] }, today, now), /Record a call/);
});

test('rule checks and the example timeline', () => {
  const rule = { dueDays: 90, dueKm: 5000, rotationDays: 90, rotationKm: 5000, followUp1Days: 15, followUp2Days: 5, variationDays: 45, variationKm: 2500 };
  assert.equal(logic.ruleProblem(rule), null);
  assert.match(logic.ruleProblem({ ...rule, followUp1Days: 3 }), /1st call/);
  assert.equal(JSON.stringify(logic.ruleTimeline(rule).map((step) => step.day)), JSON.stringify([75, 85, 90, 135]));
});

test('dates: default ranges, next month and relative days', () => {
  assert.equal(JSON.stringify(logic.defaultRange('NOT_VISITED', today)), JSON.stringify({ from: '2026-08-22', to: '2026-11-19' }));
  assert.equal(JSON.stringify(logic.nextMonthRange('2026-12-15')), JSON.stringify({ from: '2027-01-01', to: '2027-01-31' }));
  assert.equal(logic.relativeDay('2026-11-25', today), 'in 5 days');
  assert.equal(logic.relativeDay('2026-11-19', today), 'yesterday');
});

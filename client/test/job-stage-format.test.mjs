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
const cache = new Map();

/** Transpiles a TypeScript module and resolves its "@/" and relative imports the same way. */
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const resolve = (spec) => {
    if (spec.startsWith('@/')) return load(path.join(root, `${spec.slice(2)}.ts`));
    if (spec.startsWith('.')) return load(path.resolve(path.dirname(file), `${spec}.ts`));
    return require(spec);
  };
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  vm.runInNewContext(output, { require: resolve, module, exports: module.exports, Intl, Date, Math, Number, Map, Set }, { filename: file });
  return module.exports;
}

const format = load(path.join(root, 'lib/format.ts'));
const stages = load(path.join(root, 'features/job-cards/lib/job-stage.logic.ts'));

test('formatMoney shows naira with commas and two decimals, without floats for decimal strings', () => {
  assert.equal(format.formatMoney(152112.5), '₦152,112.50');
  assert.equal(format.formatMoney('152112.50'), '₦152,112.50');
  assert.equal(format.formatMoney('100.01'), '₦100.01');
  assert.equal(format.formatMoney(0), '₦0.00');
  assert.equal(format.formatMoney(-2000), '-₦2,000.00');
  for (const missing of [null, undefined, '', 'abc', Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(format.formatMoney(missing), 'Not provided');
});

test('dates use Lagos time and one format', () => {
  assert.equal(format.formatDate('2026-11-25T08:15:00Z'), '25 Nov 2026');
  assert.equal(format.formatDateTime('2026-11-25T08:15:00Z'), '25 Nov 2026, 09:15');
  assert.equal(format.formatDateTime('2026-11-25T23:30:00Z'), '26 Nov 2026, 00:30');
  assert.equal(format.formatDateTime(new Date('2026-11-28T15:00:00Z')), '28 Nov 2026, 16:00');
  for (const missing of [null, undefined, '', 'not a date']) {
    assert.equal(format.formatDate(missing), 'Not provided');
    assert.equal(format.formatDateTime(missing), 'Not provided');
  }
});

test('formatRelative reads like "in 5 h" and "2 days ago"', () => {
  const now = new Date('2026-11-25T10:00:00Z');
  assert.equal(format.formatRelative('2026-11-25T15:00:00Z', now), 'in 5 h');
  assert.equal(format.formatRelative('2026-11-23T10:00:00Z', now), '2 days ago');
  assert.equal(format.formatRelative('2026-11-25T09:48:00Z', now), '12 min ago');
  assert.equal(format.formatRelative('2026-11-25T10:00:20Z', now), 'just now');
  assert.equal(format.formatRelative('2026-11-26T09:00:00Z', now), 'in 23 h');
  assert.equal(format.formatRelative(null, now), 'Not provided');
});

test('every stage has a readable badge and step label', () => {
  const all = ['CHECK_IN', 'DIAGNOSIS', 'WARRANTY', 'ESTIMATE', 'REPAIR', 'QUALITY_CHECK', 'BILLING', 'DELIVERY', 'CLOSED', 'CANCELLED'];
  for (const stage of all) {
    const badge = stages.jobStageBadge(stage, 'OPEN');
    assert.match(badge.label, /^[A-Z][A-Za-z -]+$/, `${stage} badge`);
    assert.doesNotMatch(stages.STAGE_LABELS[stage], /_/);
  }
  assert.deepEqual({ ...stages.jobStageBadge('REPAIR', 'WAITING_PARTS') }, { label: 'Waiting parts', tone: 'amber' });
  assert.deepEqual({ ...stages.jobStageBadge('REPAIR', 'IN_PROGRESS') }, { label: 'In repair', tone: 'blue' });
  assert.deepEqual({ ...stages.jobStageBadge('WARRANTY', 'OPEN') }, { label: 'Warranty check', tone: 'purple' });
  assert.deepEqual({ ...stages.jobStageBadge('ESTIMATE', 'OPEN') }, { label: 'Awaiting approval', tone: 'amber' });
  assert.deepEqual({ ...stages.jobStageBadge('BILLING', 'QC') }, { label: 'QC passed', tone: 'emerald' });
  assert.deepEqual({ ...stages.jobStageBadge('BILLING', 'READY') }, { label: 'Ready', tone: 'emerald' });
  assert.deepEqual({ ...stages.jobStageBadge('CLOSED', 'DELIVERED') }, { label: 'Delivered', tone: 'gray' });
  assert.deepEqual({ ...stages.jobStageBadge('CANCELLED', 'CANCELLED') }, { label: 'Cancelled', tone: 'red' });
});

test('the job list Step column shows the step name in the badge colour', () => {
  assert.deepEqual({ ...stages.jobStepBadge('DELIVERY', 'BILLED') }, { label: 'Delivery', tone: 'emerald' });
  assert.deepEqual({ ...stages.jobStepBadge('BILLING', 'READY') }, { label: 'Billing', tone: 'emerald' });
  assert.deepEqual({ ...stages.jobStepBadge('REPAIR', 'WAITING_PARTS') }, { label: 'Repair', tone: 'amber' });
  assert.deepEqual({ ...stages.jobStepBadge('CLOSED', 'DELIVERED') }, { label: 'Closed', tone: 'gray' });
});

test('phone stepper label', () => {
  assert.equal(stages.phoneStepLabel('REPAIR'), 'Step 5 of 8: Repair');
  assert.equal(stages.phoneStepLabel('CHECK_IN'), 'Step 1 of 8: Check-in');
  assert.equal(stages.phoneStepLabel('DELIVERY'), 'Step 8 of 8: Delivery');
  assert.equal(stages.phoneStepLabel('CANCELLED'), 'Cancelled');
  assert.equal(stages.phoneStepLabel('CLOSED'), 'Closed');
});

test('stepper states: completed, skipped, current and upcoming', () => {
  const states = stages.stepStates({
    stage: 'REPAIR',
    summaries: [
      { stage: 'CHECK_IN', state: 'COMPLETED', by: 'Chidi Eze', at: '2026-11-25T08:40:00Z' },
      { stage: 'DIAGNOSIS', state: 'COMPLETED', by: 'Musa Abdullahi', at: '2026-11-25T10:00:00Z' },
      { stage: 'WARRANTY', state: 'SKIPPED', by: null, at: null },
      { stage: 'ESTIMATE', state: 'COMPLETED', by: null, at: null },
    ],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(states.map((s) => s.state))), ['completed', 'completed', 'skipped', 'completed', 'current', 'upcoming', 'upcoming', 'upcoming']);
  const cancelled = stages.stepStates({ stage: 'CANCELLED', summaries: [{ stage: 'CHECK_IN', state: 'COMPLETED', by: 'A', at: null }] });
  assert.deepEqual(JSON.parse(JSON.stringify(cancelled.map((s) => s.state))), ['completed', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
});

test('summary lines name the person and time, or say Not provided', () => {
  assert.equal(stages.summaryLine({ stage: 'CHECK_IN', state: 'COMPLETED', by: 'Chidi Eze', at: '2026-11-25T08:40:00Z' }), 'Check-in completed by Chidi Eze, 25 Nov 2026, 09:40.');
  assert.equal(stages.summaryLine({ stage: 'WARRANTY', state: 'SKIPPED', by: null, at: null }), 'Warranty skipped.');
  assert.equal(stages.summaryLine({ stage: 'DIAGNOSIS', state: 'COMPLETED', by: null, at: null }), 'Diagnosis completed. Not provided.');
});

test('owner line, toast and role labels never show raw role codes', () => {
  assert.equal(stages.ownerLine({ owner: { id: 'u', name: 'Musa Abdullahi', role: 'Technician' }, enteredAt: '2026-11-25T08:40:00Z' }), 'With: Musa Abdullahi (Technician) since 25 Nov 2026, 09:40');
  assert.equal(stages.ownerLine({ owner: { id: null, name: null, role: 'WorkshopManager' }, enteredAt: '2026-11-25T08:40:00Z' }), 'With: Workshop supervisor since 25 Nov 2026, 09:40');
  assert.equal(stages.ownerLine({ owner: null, enteredAt: '2026-11-25T08:40:00Z' }), null);
  assert.equal(stages.ownerRoleLabel('ServiceAdviser'), 'Service advisor');
  assert.equal(stages.ownerRoleLabel('SomethingNew'), 'Staff member');
  assert.equal(stages.handoffToast({ jobNumber: '2026000127', stage: 'DIAGNOSIS', owner: { id: 'u', name: 'Tunde Bakare', role: 'WorkshopManager' } }), 'Job 2026000127 sent to Tunde Bakare');
  assert.equal(stages.handoffToast({ jobNumber: '2026000127', stage: 'WARRANTY', owner: { id: null, name: null, role: 'WarrantyOfficer' } }), 'Job 2026000127 sent to warranty officer');
  assert.equal(stages.handoffToast({ jobNumber: '2026000127', stage: 'CANCELLED', owner: null }), 'Job 2026000127 cancelled');
});

test('every action and sub-step has plain wording', () => {
  for (const label of [...Object.values(stages.ACTION_LABELS), ...Object.values(stages.SUB_STEP_LABELS)]) {
    assert.match(label, /^[A-Z][a-z' -]+$/, label);
  }
  const split = stages.splitActions({ actions: [
    { action: 'PAUSE_FOR_PARTS', kind: 'secondary', enabled: true, reasons: [], requiresNote: false },
    { action: 'SEND_TO_QC', kind: 'primary', enabled: false, reasons: ['Assign a technician to this job first.'], requiresNote: false },
    { action: 'CANCEL', kind: 'danger', enabled: true, reasons: [], requiresNote: true },
  ] });
  assert.equal(split.primary.action, 'SEND_TO_QC');
  assert.deepEqual(JSON.parse(JSON.stringify(split.secondary.map((a) => a.action))), ['PAUSE_FOR_PARTS']);
  assert.deepEqual(JSON.parse(JSON.stringify(split.danger.map((a) => a.action))), ['CANCEL']);
});

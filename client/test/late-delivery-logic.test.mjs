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

const logic = load('features/late-deliveries/lib/late-delivery.logic.ts');

test('classifies like the server, in Lagos days', () => {
  assert.equal(logic.lateKindOf('2026-01-05T16:00:00Z', '2026-01-06T09:30:00Z').kind, 'DATE');
  assert.deepEqual({ ...logic.lateKindOf('2026-01-12T16:00:00Z', '2026-01-12T17:15:00Z') }, { kind: 'TIME', daysLate: 0, minutesLate: 75 });
  assert.equal(logic.lateKindOf('2026-01-14T16:00:00Z', '2026-01-14T16:00:00Z').kind, null);
  // 23:00 → 00:30 Lagos is the next day although still the same UTC day.
  assert.equal(logic.lateKindOf('2026-01-07T22:00:00Z', '2026-01-07T23:30:00Z').kind, 'DATE');
});

test('late-by text: days for date, hours and minutes for time', () => {
  assert.equal(logic.lateByText('DATE', 1, 900), '1 day');
  assert.equal(logic.lateByText('DATE', 3, 4000), '3 days');
  assert.equal(logic.lateByText('TIME', 0, 270), '4h 30m');
  assert.equal(logic.lateByText('TIME', 0, 45), '45m');
  assert.equal(logic.lateByText(null, 0, 0), 'On time');
});

test('reasons toggle in entry order and stop at six', () => {
  let selected = [];
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) selected = logic.toggleReason(selected, id);
  assert.deepEqual([...selected], ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.deepEqual([...logic.toggleReason(selected, 'c')], ['a', 'b', 'd', 'e', 'f']);
});

test('save needs a reason and a short remark; dirty compares with the saved values', () => {
  assert.match(logic.saveProblem([], ''), /at least one/);
  assert.equal(logic.saveProblem(['a'], 'ok'), null);
  assert.match(logic.saveProblem(['a'], 'x'.repeat(1001)), /at most 1000/);
  assert.equal(logic.isDirty(['a'], ' note ', { reasonIds: ['a'], remarks: 'note' }), false);
  assert.equal(logic.isDirty(['b', 'a'], '', { reasonIds: ['a', 'b'], remarks: null }), true);
});

test('month range covers the whole month', () => {
  assert.deepEqual({ ...logic.monthRange('2026-02-14') }, { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual({ ...logic.monthRange('2026-01-05') }, { from: '2026-01-01', to: '2026-01-31' });
});

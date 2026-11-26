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

const logic = load('features/warranty/lib/decision.logic.ts');
const lines = [
  { id: 'l1', claimedAmount: 48500, approvedAmount: null },
  { id: 'l2', claimedAmount: 115800, approvedAmount: null },
  { id: 'l3', claimedAmount: 0.3, approvedAmount: null },
];
const plain = (value) => JSON.parse(JSON.stringify(value));

test('amount fields start from the claimed amount or the earlier decision', () => {
  assert.deepEqual(plain(logic.initialAmounts([lines[0], { id: 'x', claimedAmount: 100, approvedAmount: 60 }])), { l1: '48500.00', x: '60.00' });
});

test('parses naira as typed from the portal', () => {
  assert.equal(logic.parseAmount('69,480.50'), 69480.5);
  assert.equal(logic.parseAmount('₦ 1,000'), 1000);
  assert.equal(logic.parseAmount(''), null);
  assert.equal(logic.parseAmount('12.345'), null);
  assert.equal(logic.parseAmount('-5'), null);
});

test('a partial approval keeps the typed amounts and derives the percentage', () => {
  const rows = logic.decisionRows(lines, 'PARTIALLY_APPROVE', { l1: '48500', l2: '69480', l3: '0.10' });
  assert.deepEqual(rows.map((r) => [r.approvedAmount, r.approvalPercent, r.error]), [[48500, 100, null], [69480, 60, null], [0.1, 33.33, null]]);
  const summary = logic.summarizeDecision(rows, 'PARTIALLY_APPROVE');
  assert.equal(summary.approvedTotal, 117980.1);
  assert.equal(summary.claimedTotal, 164300.3);
  assert.equal(summary.error, null);
  assert.deepEqual(plain(logic.lineApprovalsPayload(rows)), [{ lineId: 'l1', approvedAmount: 48500 }, { lineId: 'l2', approvedAmount: 69480 }, { lineId: 'l3', approvedAmount: 0.1 }]);
});

test('names the line and the fix when an amount is wrong', () => {
  const rows = logic.decisionRows(lines, 'PARTIALLY_APPROVE', { l1: 'abc', l2: '120000', l3: '0' });
  assert.match(rows[0].error, /^Line 1: enter the approved amount/);
  assert.match(rows[1].error, /^Line 2: the approved amount cannot be more than the claimed amount/);
});

test('full approval, rejection and partial guards', () => {
  assert.equal(logic.summarizeDecision(logic.decisionRows(lines, 'APPROVE', {}), 'APPROVE').approvedTotal, 164300.3);
  assert.equal(logic.summarizeDecision(logic.decisionRows(lines, 'REJECT', {}), 'REJECT').approvedTotal, 0);
  const full = logic.decisionRows(lines, 'PARTIALLY_APPROVE', logic.initialAmounts(lines));
  assert.match(logic.summarizeDecision(full, 'PARTIALLY_APPROVE').error, /Choose Approved/);
  const none = logic.decisionRows(lines, 'PARTIALLY_APPROVE', { l1: '0', l2: '0', l3: '0' });
  assert.match(logic.summarizeDecision(none, 'PARTIALLY_APPROVE').error, /Choose Rejected/);
});

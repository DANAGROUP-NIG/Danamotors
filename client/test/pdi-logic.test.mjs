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

const logic = load('features/pdi/lib/pdi.logic.ts');

test('PDI registration defaults to the last 6 characters of the VIN', () => {
  assert.equal(logic.pdiRegistrationFromVin('knadn512bm6123456'), '123456');
  assert.equal(logic.pdiRegistrationFromVin('KNA-DN512 BM6ABC12'), '6ABC12');
});

test('defect grid totals add in kobo, per line and per column', () => {
  assert.equal(logic.defectLineTotal({ spare: 0.1, oil: 0.2, labour: 0 }), 0.3);
  assert.equal(JSON.stringify(logic.defectGridTotals([{ spare: 100, oil: 20, labour: 30 }, { spare: 0.05, oil: 0, labour: 0.05 }])), JSON.stringify({ spare: 100.05, oil: 20, labour: 30.05, total: 150.1 }));
});

test('a defect line needs a master defect or a description', () => {
  assert.equal(logic.defectLineValid({ defectId: '', description: '  ' }), false);
  assert.equal(logic.defectLineValid({ defectId: 'd1', description: '' }), true);
  assert.equal(logic.defectLineValid({ defectId: '', description: 'Scratch' }), true);
});

test('returnable quantity ignores cancelled returns', () => {
  assert.equal(logic.returnable({ quantityIssued: 3, returns: [{ quantity: 1, status: 'Completed' }, { quantity: 2, status: 'CANCELLED' }] }), 2);
  assert.equal(logic.returnable({ quantityIssued: 1, returns: [{ quantity: 1, status: 'Completed' }] }), 0);
});

test('status stepper positions', () => {
  assert.equal(logic.stepIndex('OPEN'), 0);
  assert.equal(logic.stepIndex('WAITING_PARTS'), 1);
  assert.equal(logic.stepIndex('READY'), 3);
  assert.equal(logic.stepIndex('DELIVERED'), logic.PDI_STEPS.length);
});

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

const logic = load('features/campaigns/lib/manual-file.ts');

test('accepts PDF, PNG and JPEG up to 10 MB', () => {
  assert.equal(logic.manualFileError({ type: 'application/pdf', size: 1024 }), null);
  assert.equal(logic.manualFileError({ type: 'image/jpeg', size: logic.MAX_MANUAL_BYTES }), null);
});

test('names the problem with other files', () => {
  assert.match(logic.manualFileError({ type: 'application/msword', size: 10 }), /PDF, PNG or JPEG/);
  assert.match(logic.manualFileError({ type: 'application/pdf', size: 0 }), /empty/);
  assert.match(logic.manualFileError({ type: 'application/pdf', size: logic.MAX_MANUAL_BYTES + 1 }), /larger than 10 MB/);
});

test('suggests a title from the file name', () => {
  assert.equal(logic.titleFromFileName('SC-215_service_procedure.pdf'), 'SC-215 service procedure');
  assert.equal(logic.titleFromFileName('Bulletin.PDF'), 'Bulletin');
});

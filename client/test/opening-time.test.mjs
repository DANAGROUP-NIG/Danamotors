import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const module = { exports: {} };
const source = fs.readFileSync(new URL('../features/job-cards/components/opening/opening-time.ts', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module, exports: module.exports });
const { openingTimeParts, openingTimeValue } = module.exports;

test('time picker preserves every minute through 12-hour display and 24-hour submission', () => {
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute++) {
      const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      assert.equal(openingTimeValue(openingTimeParts(time)), time);
    }
  }
});

test('noon, midnight and changing AM/PM retain the correct hour and minute', () => {
  assert.equal(openingTimeValue({ hour: 12, minute: 9, period: 'AM' }), '00:09');
  assert.equal(openingTimeValue({ hour: 12, minute: 9, period: 'PM' }), '12:09');
  assert.equal(openingTimeValue({ ...openingTimeParts('07:09'), period: 'PM' }), '19:09');
  assert.equal(openingTimeValue(openingTimeParts('')), '00:00');
});

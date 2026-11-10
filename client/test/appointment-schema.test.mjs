import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const module = { exports: {} };
const source = fs.readFileSync(new URL('../features/appointments/schemas/appointment.schema.ts', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { require: createRequire(import.meta.url), module, exports: module.exports });

const { createAppointmentSchema, updateAppointmentSchema } = module.exports;
const appointment = {
  customerId: 'customer', vehicleId: 'vehicle', branchName: 'Synthetic', scheduledAt: '2026-11-11T09:00',
};

for (const [name, schema, fields] of [
  ['create', createAppointmentSchema, appointment],
  ['update', updateAppointmentSchema, {}],
]) {
  test(`${name} allows omitted or cleared duration and omits it from JSON`, () => {
    for (const durationMins of [undefined, '']) {
      const parsed = schema.parse({ ...fields, durationMins });
      assert.equal(parsed.durationMins, undefined);
      assert.equal(Object.hasOwn(JSON.parse(JSON.stringify(parsed)), 'durationMins'), false);
    }
  });

  test(`${name} accepts supplied whole minutes and rejects invalid duration`, () => {
    assert.equal(schema.parse({ ...fields, durationMins: '60' }).durationMins, 60);
    for (const durationMins of [0, -1, 1.5, 'invalid']) {
      assert.equal(schema.safeParse({ ...fields, durationMins }).success, false);
    }
  });
}

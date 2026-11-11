import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

function load(relative) {
  const module = { exports: {} };
  const source = fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { require: createRequire(import.meta.url), module, exports: module.exports });
  return module.exports;
}
const { openingTermsReachedEnd } = load('features/service-transactions/booking-opening-consent.logic.ts');
const { createJobCardSchema } = load('features/job-cards/schemas/job-card.schema.ts');

test('consent remains unavailable above the end and becomes available at the bottom, including fractional scrolling', () => {
  assert.equal(openingTermsReachedEnd({ scrollTop: 0, clientHeight: 200, scrollHeight: 600 }), false);
  assert.equal(openingTermsReachedEnd({ scrollTop: 300, clientHeight: 200, scrollHeight: 600 }), false);
  assert.equal(openingTermsReachedEnd({ scrollTop: 399.5, clientHeight: 200, scrollHeight: 600 }), true);
});
test('fully visible short terms count as reaching the end; an unmeasured panel does not', () => {
  assert.equal(openingTermsReachedEnd({ scrollTop: 0, clientHeight: 150, scrollHeight: 150 }), true);
  assert.equal(openingTermsReachedEnd({ scrollTop: 0, clientHeight: 0, scrollHeight: 0 }), false);
});
test('conversion form preserves accepted consent but rejects a missing or unchecked consent', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const body = { appointmentId: id, branchName: 'Test', customerId: id, vehicleId: id, serviceTypeId: id, bayId: id, serviceAdvisorId: id, teamId: id, mileage: 100, promisedDate: '2026-11-12', promisedTime: '15:00', tyres: [{}, {}, {}, {}, {}], complaints: [{ description: 'Inspect brakes', spare: 0, oil: 0, labour: 0 }] };
  assert.equal(createJobCardSchema.safeParse(body).success, false);
  const openingConsent = { accepted: true, termsHash: 'a'.repeat(64) };
  const result = createJobCardSchema.parse({ ...body, openingConsent });
  assert.equal(result.openingConsent.termsHash, openingConsent.termsHash);
  assert.equal(result.openingConsent.accepted, true);
  assert.equal(createJobCardSchema.safeParse({ ...body, openingConsent: { ...openingConsent, accepted: false } }).success, false);
  assert.equal(createJobCardSchema.safeParse({ ...body, appointmentId: undefined }).success, true);
});

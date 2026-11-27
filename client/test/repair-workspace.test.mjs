import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const dependency = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const component = "features/job-cards/components/";

function loader(stubs = {}) {
  const cache = new Map();
  function load(file) {
    const resolved = path.resolve(root, file);
    if (resolved in stubs) return stubs[resolved];
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const module = { exports: {} };
    cache.set(resolved, module);
    const source = ts.transpileModule(fs.readFileSync(resolved, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    function resolve(name) {
      if (name in stubs) return stubs[name];
      if (!name.startsWith(".") && !name.startsWith("@/"))
        return dependency(name);
      const local = name.startsWith("@/")
        ? path.join(root, name.slice(2))
        : path.resolve(path.dirname(resolved), name);
      const target = [local, local + ".ts", local + ".tsx"].find(
        (candidate) =>
          fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
      );
      if (!target) throw new Error("Missing test dependency " + name);
      return load(target);
    }
    vm.runInNewContext(
      source,
      { module, exports: module.exports, require: resolve },
      { filename: resolved },
    );
    return module.exports;
  }
  return load;
}
const plain = (value) => JSON.parse(JSON.stringify(value));

function operationalSummary(name, card, permissions, userId = 'tech') {
  const action = { isPending: false, isError: false, mutate() {}, reset() {} };
  const load = loader({
    '@/features/auth/hooks/use-auth': { useAuth: () => ({ user: { id: userId }, hasPermission: permission => permissions.includes(permission) }) },
    '../hooks/use-job-parts-actions': { useJobPartsActions: () => ({ receive: action, returnPart: action }) },
    './PartCollectionSignature': { PartCollectionSignature: () => React.createElement('p', null, 'Signature capture') },
  });
  const Component = load(component + name + '.tsx')[name];
  return renderToStaticMarkup(React.createElement(Component, { jobCard: card }));
}
const operationalIssue = { id: 'issue', quantity: 2, issuedAt: '2026-11-18T09:00:00Z', issuedBy: { firstName: 'Synthetic', lastName: 'Store' }, sparePart: { partNumber: 'PART-001', name: 'Synthetic filter' }, partSource: 'O', returns: [] };
const operationalJob = { id: 'job', branchId: 'branch', technicianId: 'tech', status: 'IN_PROGRESS', partIssuances: [operationalIssue], labourLines: [
  { id: 'old', description: 'Historical operation', hours: 1, rate: 100, amount: 100, labourItem: { description: 'Historical operation' }, technician: { firstName: 'Synthetic', lastName: 'Technician' } },
  { id: 'slip', description: 'Document operation', hours: 2, rate: 100, amount: 200, labourSlipId: 'slip', labourItem: { description: 'Document operation' }, mechanic: { name: 'Synthetic mechanic' } },
] };

test('parts history removes direct issuance entry while preserving assigned signed collection', () => {
  const html = operationalSummary('JobCardPartsSection', operationalJob, ['jobcard:read', 'jobprogress:update', 'partissuance:create']);
  assert.ok(html.includes('PART-001'));
  assert.ok(html.includes('Sign collection for PART-001'));
  assert.equal(html.includes('Issue part</button>'), false);
  assert.equal(html.includes('Search branch stock'), false);
  const unassigned = operationalSummary('JobCardPartsSection', operationalJob, ['jobcard:read', 'jobprogress:update'], 'other');
  assert.equal(unassigned.includes('Sign collection for'), false);
});

test('closed and cancelled-requisition history remains visible without collection actions', () => {
  const billed = operationalSummary('JobCardPartsSection', { ...operationalJob, status: 'BILLED' }, ['jobcard:read', 'jobprogress:update', 'partreturn:create']);
  assert.ok(billed.includes('PART-001'));
  assert.equal(billed.includes('Sign collection for'), false);
  assert.equal(billed.includes('<form'), false);
  const cancelled = operationalSummary('JobCardPartsSection', { ...operationalJob, partIssuances: [{ ...operationalIssue, requisitionLine: { requisitionId: 'req', requisition: { status: 'CANCELLED' } } }] }, ['jobcard:read', 'jobprogress:update', 'partreturn:create']);
  assert.ok(cancelled.includes('Cancelled requisition'));
  assert.equal(cancelled.includes('Sign collection for'), false);
  assert.equal(cancelled.includes('<form'), false);
});

test('legacy returns remain available but requisition-managed stock uses return slips', () => {
  const html = operationalSummary('JobCardPartsSection', operationalJob, ['jobcard:read', 'partreturn:create']);
  assert.ok(html.includes('Record historical return'));
  const managed = operationalSummary('JobCardPartsSection', { ...operationalJob, partIssuances: [{ ...operationalIssue, requisitionLine: { requisitionId: 'req', requisition: { status: 'ISSUED' } } }] }, ['jobcard:read', 'partreturn:create']);
  assert.equal(managed.includes('<form'), false);
  assert.ok(managed.includes('Returns tab'));
});

test('labour summary renders historical and slip work without duplicate edit forms or unpermitted money', () => {
  const html = operationalSummary('JobCardLabourSection', operationalJob, ['jobcard:read', 'jobcard:labour:update']);
  assert.ok(html.includes('Historical operation'));
  assert.ok(html.includes('Document operation'));
  assert.ok(html.includes('Synthetic mechanic'));
  assert.equal(html.includes('<form'), false);
  assert.equal(html.includes('<input'), false);
  assert.equal(html.includes('Recorded amount'), false);
  const financial = operationalSummary('JobCardLabourSection', operationalJob, ['jobcard:read', 'estimate:read']);
  assert.ok(financial.includes('₦'));
  assert.ok(financial.includes('200.00'));
});

test('operational summaries have empty and permission-denied states without leaking records', () => {
  for (const name of ['JobCardPartsSection', 'JobCardLabourSection']) {
    const denied = operationalSummary(name, operationalJob, []);
    assert.ok(denied.includes('does not have access'));
    assert.equal(denied.includes('Synthetic filter'), false);
    assert.equal(denied.includes('Historical operation'), false);
    const empty = operationalSummary(name, { ...operationalJob, partIssuances: [], labourLines: [] }, ['jobcard:read']);
    assert.ok(empty.includes(name === 'JobCardPartsSection' ? 'No parts issued' : 'No labour recorded'));
  }
});

test('parts action hook sends canonical collection and return payloads and refreshes the shared detail cache', async () => {
  const mutations = [], calls = [], invalidations = [];
  const load = loader({
    '@tanstack/react-query': { useQueryClient: () => ({ invalidateQueries: async query => { invalidations.push(query); } }), useMutation: options => { mutations.push(options); return options; } },
    '@/lib/api/apiClient': { apiPost: async (url, body) => { calls.push({ url, body }); } },
    'sonner': { toast: { success() {} } },
  });
  const hook = load('features/job-cards/hooks/use-job-parts-actions.ts').useJobPartsActions;
  hook('job', 'branch');
  await mutations[0].mutationFn({ id: 'issue', signatureImage: 'synthetic-image' });
  assert.deepEqual(plain(calls[0]), { url: '/workshop/parts/issue/receive', body: { confirmed: true, signatureImage: 'synthetic-image' } });
  await mutations[1].mutationFn({ id: 'issue', quantity: 1, reason: 'Unused' });
  assert.equal(calls[1].url, '/inventory/returns');
  assert.equal(calls[1].body.branchId, 'branch');
  assert.equal(Object.hasOwn(calls[1].body, 'returnedById'), false);
  await mutations[0].onSuccess();
  assert.ok(invalidations.some(query => JSON.stringify(query.queryKey) === JSON.stringify(['jobCards', 'detail', 'job'])));
  assert.ok(invalidations.some(query => JSON.stringify(query.queryKey) === JSON.stringify(['jobCards', 'list']) && query.refetchType === 'none'));
});
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
const fixture = {
  id: "test-job",
  status: "OPEN",
  customerId: "test-customer",
  branchId: "test-branch",
  customer: { firstName: "Test", lastName: "Customer" },
  serviceCharge: 2100,
  estimates: [
    {
      id: "test-estimate",
      version: 2,
      status: "Pending",
      currency: "NGN",
      amount: 85800,
      contentHash: "test-hash",
      description: "Spark plugs, oil change & fuel system flush",
      approvals: [],
      lines: [
        {
          id: "s",
          type: "SERVICE",
          description: "Running repair",
          quantity: 1,
          rate: 2100,
          amount: 2100,
        },
        {
          id: "l",
          type: "LABOUR",
          description: "Replace ignition coil & spark plugs",
          quantity: 0.8,
          rate: 12500,
          amount: 10000,
        },
        {
          id: "g",
          type: "LABOUR",
          description: "General labour",
          quantity: 1.5,
          rate: 10000,
          amount: 15000,
        },
        {
          id: "i",
          type: "INCLUDED_LABOUR",
          description: "Fuel system flush & injector cleaning",
          quantity: 1,
          rate: 0,
          amount: 0,
        },
        {
          id: "p",
          type: "PART",
          description: "Spark plug, iridium",
          quantity: 4,
          rate: 7800,
          amount: 31200,
          source: "SECRET-SOURCE",
        },
        {
          id: "o",
          type: "PART",
          description: "Engine oil 5W-30, 4 litres",
          quantity: 1,
          rate: 27500,
          amount: 27500,
        },
      ],
    },
  ],
};

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
const helpers = loader()(component + "repair-workspace-helpers.ts");
const plain = (value) => JSON.parse(JSON.stringify(value));

test("stepper maps canonical and legacy statuses without inventing a cancelled stage", () => {
  for (const [status, index] of [
    ["OPEN", 0],
    ["Pending", 0],
    ["In Progress", 1],
    ["On Hold", 1],
    ["QC", 2],
    ["Quality Check", 2],
    ["Completed", 3],
    ["Billed", 4],
    ["Closed", 5],
    ["DELIVERED", 5],
  ]) {
    const steps = helpers.getStepperState(status);
    assert.equal(steps[index].state, "current");
    assert.ok(
      steps.slice(0, index).every((step) => step.state === "completed"),
    );
    assert.ok(
      steps.slice(index + 1).every((step) => step.state === "upcoming"),
    );
  }
  assert.ok(
    helpers
      .getStepperState("CANCELLED")
      .every((step) => step.state === "upcoming"),
  );
});
test("view model uses backend total and only customer-facing line fields", () => {
  const estimate = structuredClone(fixture.estimates[0]);
  estimate.amount = 123.45;
  const view = helpers.toEstimateViewModel(estimate);
  assert.equal(view.total, 123.45);
  assert.equal(view.version, 2);
  assert.equal(
    helpers.toEstimateViewModel({
      ...estimate,
      description: "Workshop estimate ? revision 3",
    }).description,
    "Workshop estimate, revision 3",
  );
  assert.equal(
    helpers.toEstimateViewModel({
      ...estimate,
      description: "Does the engine still knock?",
    }).description,
    "Does the engine still knock?",
  );
  assert.deepEqual(plain(view.lines[0]), {
    id: "s",
    title: "Running repair",
    secondary: "Service charge",
    quantity: 1,
    rate: 2100,
    amount: 2100,
  });
  assert.equal(view.lines[3].secondary, "Included in service charge");
  assert.equal(JSON.stringify(view).includes("SECRET-SOURCE"), false);
  estimate.approvals = [{ signatureState: "invalid" }];
  assert.equal(helpers.toEstimateViewModel(estimate).status, "revision");
  estimate.approvals = [];
  estimate.status = "Declined";
  assert.equal(helpers.toEstimateViewModel(estimate).status, "declined");
});
test("money splits retain backend precision and render zero as naira zero", () => {
  assert.deepEqual(plain(helpers.splitMoney(85800, "NGN")), {
    whole: "\u20a685,800",
    decimals: ".00",
  });
  assert.equal(helpers.splitMoney(123.45, "NGN").decimals, ".45");
  assert.equal(helpers.formatEstimateMoney(0, "NGN", true), "\u20a60");
  assert.ok(helpers.splitMoney(-12.34, "NGN").whole.startsWith("-\u20a612"));
  assert.ok(helpers.splitMoney(10, "USD").whole.includes("10"));
});

export function renderWorkspaceFixture({
  card = fixture,
  permissions = ["estimate:print", "estimate:sign", "estimate:revise"],
  loading = false,
  error = null,
} = {}) {
  const load = loader({
    [path.join(root, "features/job-cards/hooks/use-job-card.ts")]: {
      useJobCard: () => ({
        data: card,
        isLoading: loading,
        error,
        refetch: () => {},
      }),
    },
    "@/features/auth/hooks/use-auth": {
      useAuth: () => ({
        hasPermission: (permission) => permissions.includes(permission),
      }),
    },
    "@tanstack/react-query": {
      useQueryClient: () => ({ invalidateQueries: async () => {} }),
      useMutation: () => ({ isPending: false, error: null, mutate: () => {} }),
    },
    "@/lib/api/apiClient": { apiPost: async () => {} },
    "@/components/DocumentTermsBlock": {
      DocumentTermsBlock: ({ documentType }) =>
        React.createElement("div", null, "Document terms: " + documentType),
    },
    [path.join(root, component + "EstimateSignatureDialog.tsx")]: {
      EstimateSignatureDialog: () => null,
    },
    [path.join(root, component + "EstimatePartPicker.tsx")]: {
      EstimatePartPicker: () => null,
    },
    [path.join(root, component + "WorkshopPicker.tsx")]: {
      WorkshopPicker: () => null,
    },
    "next/image": {
      default: ({ src, alt, width, height, className }) =>
        React.createElement("img", { src, alt, width, height, className }),
    },
  });
  const Page = load(component + "RepairWorkspacePage.tsx").RepairWorkspacePage;
  return renderToStaticMarkup(
    React.createElement(Page, { id: card?.id ?? "test" }),
  );
}

test("saved estimates show the server-calculated advisory amount without a mandatory percentage", () => {
  const card = structuredClone(fixture);
  Object.assign(card.estimates[0], {
    upfrontPaymentPercent: 33.33,
    upfrontAmount: 28597.14,
  });
  const html = renderWorkspaceFixture({ card });
  assert.ok(html.includes("Suggested advance (33.33%)"));
  assert.ok(html.includes("\u20a628,597.14"));
  assert.ok(
    html.includes(
      "Any positive eligible advance meets the payment requirement.",
    ),
  );
  Object.assign(card.estimates[0], {
    upfrontPaymentPercent: 0,
    upfrontAmount: 0,
  });
  assert.ok(
    renderWorkspaceFixture({ card }).includes("Suggested advance (0%)"),
  );
  assert.equal(
    helpers.toEstimateViewModel({ ...card.estimates[0], upfrontAmount: NaN })
      .suggestedAdvance,
    null,
  );
});

test("workspace renders latest backend data, semantic stepper/table and allowed actions", () => {
  const html = renderWorkspaceFixture();
  for (const label of [
    "Repair workspace",
    "85,800",
    "Awaiting approval",
    "Get customer signature",
    "Revise estimate",
    "Print estimate",
  ])
    assert.ok(html.includes(label));
  assert.ok(html.includes('aria-current="step"'));
  assert.ok(html.includes("<table"));
  assert.ok(html.includes("overflow-x-auto"));
  assert.equal(html.includes("SECRET-SOURCE"), false);
  assert.ok(html.includes("Document terms: JOB_ESTIMATE"));
  assert.equal((html.match(/<table/g) || []).length, 1);
  assert.equal(html.includes("Record customer approval"), false);
  const denied = renderWorkspaceFixture({ permissions: [] });
  for (const label of [
    "Get customer signature",
    "Revise estimate",
    "Print estimate",
  ])
    assert.equal(denied.includes(label), false);
});
test("workspace handles empty, inaccessible, loading, failed, declined and legacy states", () => {
  const card = structuredClone(fixture);
  card.estimates = [];
  assert.ok(
    renderWorkspaceFixture({ card, permissions: ["estimate:create"] }).includes(
      "Create estimate",
    ),
  );
  assert.equal(
    renderWorkspaceFixture({ card, permissions: [] }).includes(
      "Create estimate",
    ),
    false,
  );
  delete card.estimates;
  assert.ok(
    renderWorkspaceFixture({ card }).includes(
      "not available with your permissions",
    ),
  );
  assert.ok(
    renderWorkspaceFixture({ loading: true }).includes('aria-busy="true"'),
  );
  assert.ok(
    renderWorkspaceFixture({ error: new Error("test") }).includes("Retry"),
  );
  const declined = structuredClone(fixture);
  declined.estimates[0].status = "Declined";
  declined.estimates[0].approvals = [
    { comments: "Customer declined the price", approved: false },
  ];
  assert.ok(
    renderWorkspaceFixture({ card: declined }).includes(
      "Customer declined the price",
    ),
  );
  const approved = structuredClone(fixture);
  approved.estimates[0].status = "Approved";
  approved.estimates[0].approvals = [
    { approved: true, signatureState: "legacy" },
  ];
  assert.ok(
    renderWorkspaceFixture({ card: approved }).includes(
      "Approved before signatures were introduced",
    ),
  );
  assert.equal(
    renderWorkspaceFixture({ card: approved }).includes(
      "Get customer signature",
    ),
    false,
  );
});

test("previous signed revisions retain accessible signature evidence", () => {
  const card = structuredClone(fixture);
  card.estimates.push({
    ...structuredClone(card.estimates[0]),
    id: "old",
    version: 1,
    status: "SUPERSEDED",
    approvals: [
      {
        id: "approval",
        approved: true,
        signatureState: "valid",
        signature: {
          imageReference: "data:image/png;base64,TEST",
          signerName: "Earlier signer",
          signedAt: "2026-10-20T10:00:00Z",
          estimateVersion: 1,
          totalSigned: 85800,
        },
      },
    ],
  });
  const html = renderWorkspaceFixture({ card });
  assert.ok(html.includes("Previous revisions"));
  assert.ok(html.includes("Earlier signer"));
  assert.ok(html.includes("View signature"));
});

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
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

/** Transpiles TypeScript and TSX on the fly and resolves "@/" and relative imports, with optional stubs. */
function loader(stubs = {}) {
  const cache = new Map();
  function load(file) {
    const resolved = path.resolve(root, file);
    if (resolved in stubs) return stubs[resolved];
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const module = { exports: {} };
    cache.set(resolved, module);
    const source = ts.transpileModule(fs.readFileSync(resolved, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    function resolve(name) {
      if (name in stubs) return stubs[name];
      if (!name.startsWith(".") && !name.startsWith("@/")) return dependency(name);
      const local = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(resolved), name);
      const target = [local, local + ".ts", local + ".tsx"].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      if (!target) throw new Error("Missing test dependency " + name);
      return load(target);
    }
    vm.runInNewContext(source, { module, exports: module.exports, require: resolve, crypto: globalThis.crypto }, { filename: resolved });
    return module.exports;
  }
  return load;
}

const logic = loader()("features/job-cards/lib/repair.logic.ts");
/** Objects made inside the loader belong to another realm; compare their plain data. */
const plain = (value) => JSON.parse(JSON.stringify(value));

test("work line buttons: Start, Continue after waiting, Done, and the reason when blocked", () => {
  assert.deepEqual(plain(logic.lineButton({ status: "NOT_STARTED" }, { paused: false, canWork: true })), { action: "START", label: "Start", disabledReason: null });
  assert.deepEqual(plain(logic.lineButton({ status: "WAITING_PARTS" }, { paused: false, canWork: true })), { action: "START", label: "Continue", disabledReason: null });
  assert.deepEqual(plain(logic.lineButton({ status: "IN_PROGRESS" }, { paused: false, canWork: true })), { action: "DONE", label: "Done", disabledReason: null });
  assert.equal(logic.lineButton({ status: "NOT_STARTED" }, { paused: true, canWork: true }).disabledReason, "The job is paused for parts. Resume the job first.");
  assert.equal(logic.lineButton({ status: "IN_PROGRESS" }, { paused: false, canWork: false }).disabledReason, "Only the assigned technician can update this work.");
  assert.equal(logic.lineButton({ status: "DONE" }, { paused: false, canWork: true }), null);
});

test("time worked and parts wording", () => {
  assert.equal(logic.timeWorkedText(30), "Under 1 min");
  assert.equal(logic.timeWorkedText(50 * 60), "50 min");
  assert.equal(logic.timeWorkedText(80 * 60), "1 h 20 min");
  assert.equal(logic.timeWorkedText(2 * 3600), "2 h");
  assert.equal(logic.partsSummary({ ready: 4, outstanding: 5, total: 6 }), "4 of 5 ready to collect at store");
  assert.equal(logic.partsSummary({ ready: 0, outstanding: 1, total: 1 }), "1 part is not ready at the store yet.");
  assert.equal(logic.partsSummary({ ready: 0, outstanding: 0, total: 2 }), "All parts collected.");
  assert.equal(logic.partsSummary({ ready: 0, outstanding: 0, total: 0 }), "No parts were requested for this job.");
  assert.equal(logic.collectionConfirmation(["Ibrahim Sule", "Ibrahim Sule"]), "Your signature confirms you received these parts from Ibrahim Sule.");
  assert.equal(logic.collectionConfirmation(["Ibrahim Sule", "Ada Obi"]), "Your signature confirms you received these parts from Ibrahim Sule and Ada Obi.");
  assert.equal(logic.collectionConfirmation([null]), "Your signature confirms you received these parts from the store.");
});

test("collection and new finding forms name the field and the fix", () => {
  assert.deepEqual(plain(logic.collectProblems([], null)), { parts: "Tick at least one part you are collecting", signature: "Sign in the box to confirm you received the parts" });
  assert.deepEqual(plain(logic.collectProblems(["a"], "data:image/png;base64,x")), {});
  const part = logic.findingFormProblems({ description: "", items: [] }, "PART");
  assert.equal(part.description, "Say why the part is needed, in at least 3 characters");
  assert.equal(part.items, "Choose the part you need");
  const finding = logic.findingFormProblems({ description: "Rear wiper blade torn", items: [{ kind: "PART", referenceId: "p", description: "Wiper", quantity: "0" }] }, "FINDING");
  assert.equal(finding.quantities[0], "Enter a quantity above 0, with at most 2 decimal places");
  assert.equal(logic.hasFindingProblems(finding), true);
  assert.equal(logic.findingFormProblems({ description: "Torn", items: [] }, "FINDING").items, "Add the work or part this finding needs");
  assert.equal(logic.hasFindingProblems(logic.findingFormProblems({ description: "Torn", items: [{ kind: "PART", referenceId: "p", description: "Wiper", quantity: "1" }] }, "FINDING")), false);
});

test("the advisor's banner and the supplementary view show only the new work", () => {
  const finding = (state, raisedBy, description) => ({ id: description, state, raisedBy, description, items: [], kind: "FINDING", raisedAt: "2026-11-27T10:00:00Z", estimateId: null, estimateVersion: null });
  assert.deepEqual(plain(logic.newFindingBanner([finding("WAITING_ESTIMATE", "Musa Abdullahi", "Rear wiper blade torn.")])), { text: "New finding from Musa Abdullahi: Rear wiper blade torn.", waiting: 1 });
  assert.equal(logic.newFindingBanner([finding("APPROVED", "Musa Abdullahi", "x")]), null);
  const line = (id, carriedOver, amount, customerDecision = null) => ({ id, carriedOver, amount, payer: "CUSTOMER", customerDecision });
  const step = { estimate: { supplementary: true, vatRate: "7.50", lines: [line("old", true, "45000.00", "APPROVED"), line("new", false, "8500.00")], totals: {} } };
  const view = logic.supplementaryView(step);
  assert.deepEqual(plain(view.estimate.lines.map((row) => row.id)), ["new"]);
  assert.equal(view.estimate.totals.customerSubtotal, "8500.00");
  assert.equal(view.estimate.totals.vat, "637.50");
  assert.equal(view.estimate.totals.customerTotal, "9137.50");
  const ordinary = { estimate: { supplementary: false, lines: [] } };
  assert.equal(logic.supplementaryView(ordinary), ordinary);
});

test("every badge mapping has words, never a raw code", () => {
  for (const mapping of [logic.WORK_STATUS_BADGE, logic.PART_STATUS_BADGE, logic.FINDING_STATE_BADGE])
    for (const [code, badge] of Object.entries(mapping)) {
      assert.notEqual(badge.label, code);
      assert.doesNotMatch(badge.label, /_|[A-Z]{3,}/);
    }
});

test("the technician view: blocked Send for quality check shows its reason, pending findings are locked, no prices", () => {
  const mutation = { isPending: false, mutateAsync: async () => ({}), variables: undefined };
  const stub = (name) => () => React.createElement("div", { "data-stub": name });
  const load = loader({
    "@/features/auth/hooks/use-auth": { useAuth: () => ({ hasPermission: () => false }) },
    "../../hooks/use-job-repair": { useMoveWorkLine: () => mutation },
    "./CollectPartsSheet": { CollectPartsSheet: stub("collect") },
    "./NewFindingSheet": { NewFindingSheet: stub("finding"), emptyFinding: () => ({ description: "", items: [] }) },
    "./PauseJobDialog": { PauseJobDialog: stub("pause") },
    "../diagnosis/ItemPicker": { ItemPicker: stub("picker") },
    "../workspace/WorkshopSections": { AssignTechnicianSection: stub("assign") },
  });
  const { TechnicianRepair } = load("features/job-cards/components/repair/TechnicianRepair.tsx");
  const step = {
    jobCardId: "job",
    jobNumber: "2026000127",
    stage: "REPAIR",
    status: "IN_PROGRESS",
    paused: false,
    serverNow: "2026-11-27T13:00:00Z",
    technician: "Musa Abdullahi",
    serviceAdvisor: "Chidi Eze",
    access: { canWork: true, canCollect: true, canPrepareSupplementary: false },
    workLines: [
      { id: "l1", kind: "SERVICE", description: "Periodic service (50,000 km)", payer: "CUSTOMER", supplementary: false, status: "DONE", hours: "1.00", technician: "Musa Abdullahi", startedAt: "2026-11-27T12:00:00Z", doneAt: "2026-11-27T13:10:00Z", secondsWorked: 4200 },
      { id: "l2", kind: "LABOUR", description: "Replace front brake pads", payer: "CUSTOMER", supplementary: false, status: "IN_PROGRESS", hours: "1.00", technician: "Musa Abdullahi", startedAt: "2026-11-27T12:40:00Z", doneAt: null, secondsWorked: 3000 },
      { id: "l3", kind: "LABOUR", description: "Replace AC compressor", payer: "WARRANTY", supplementary: false, status: "WAITING_PARTS", hours: "2.00", technician: "Musa Abdullahi", startedAt: null, doneAt: null, secondsWorked: 0 },
    ],
    qualityCheckProblems: ["Finish all work first: 2 items left."],
    findings: [{ id: "f1", description: "Rear wiper blade torn.", raisedBy: "Musa Abdullahi", raisedAt: "2026-11-27T12:00:00Z", kind: "PART", items: [{ id: "i", kind: "PART", description: "Rear wiper blade", quantity: "1.00" }], state: "WAITING_APPROVAL", estimateId: "e2", estimateVersion: 2 }],
    parts: {
      rows: [
        { sparePartId: "p1", description: "Front brake pads set", requested: 1, requestedAt: null, issued: 1, issuedAt: "2026-11-27T11:25:00Z", issuedBy: "Ibrahim Sule", collected: 0, collectedAt: null, collectedBy: null, status: "READY" },
        { sparePartId: "p2", description: "AC compressor", requested: 1, requestedAt: null, issued: 0, issuedAt: null, issuedBy: null, collected: 0, collectedAt: null, collectedBy: null, status: "REQUESTED" },
      ],
      ready: 1,
      outstanding: 2,
      total: 2,
      collectable: [{ issuanceId: "x", description: "Front brake pads set", quantity: 1, issuedBy: "Ibrahim Sule" }],
    },
    labour: [],
    supplementary: { estimateId: "e2", version: 2, state: "PRESENTED" },
    supplementaryPending: true,
    returnedFromQc: null,
  };
  const primary = { action: "SEND_TO_QC", kind: "primary", enabled: false, reasons: ["Finish all work first: 2 items left."], requiresNote: false };
  const pause = { action: "PAUSE_FOR_PARTS", kind: "secondary", enabled: true, reasons: [], requiresNote: false };
  const html = renderToStaticMarkup(
    React.createElement(TechnicianRepair, {
      job: { id: "job", jobNumber: "2026000127" },
      step,
      readOnly: false,
      onOpenTab: () => undefined,
      bar: { primary, secondary: [pause], danger: [], pending: null, onAction() {}, onDangerAction() {}, onNoteAction() {} },
    }),
  );
  assert.match(html, /Send for quality check/);
  assert.match(html, /Finish all work first: 2 items left\./);
  assert.match(html, /Done 14:10/);
  assert.match(html, /1 of 2 ready to collect at store/);
  assert.match(html, /Collect and sign/);
  assert.match(html, /AC compressor: requested from the store, not ready yet/);
  assert.match(html, /Waiting for customer/);
  assert.match(html, /Do not start this work until the customer approves it/);
  assert.match(html, /Warranty/);
  assert.match(html, /Need a part/);
  assert.match(html, /Pause job/);
  assert.doesNotMatch(html, /₦|NGN|undefined|null|NaN/);
});

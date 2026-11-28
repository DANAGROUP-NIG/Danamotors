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

const logic = loader()("features/job-cards/lib/quality-check.logic.ts");
const plain = (value) => JSON.parse(JSON.stringify(value));

const step = {
  jobCardId: "job",
  jobNumber: "2026000127",
  stage: "QUALITY_CHECK",
  state: "PENDING",
  statement: "Vehicle checked and certified as roadworthy in all respects",
  generalChecks: [
    { code: "NO_WARNING_LIGHTS", label: "No warning lights on dashboard" },
    { code: "FLUID_LEVELS", label: "Fluid levels correct" },
    { code: "WHEEL_NUTS", label: "Wheel nuts torqued" },
    { code: "INTERIOR_CLEAN", label: "Vehicle interior clean" },
  ],
  startKm: 48262,
  workLines: [
    { id: "l1", description: "Periodic service (50,000 km)", kind: "SERVICE", supplementary: false, status: "DONE", doneAt: "2026-11-27T13:10:00Z", reopened: false, technician: "Musa Abdullahi" },
    { id: "l2", description: "Replace front brake pads", kind: "LABOUR", supplementary: false, status: "DONE", doneAt: "2026-11-27T13:40:00Z", reopened: true, technician: "Musa Abdullahi" },
  ],
  history: [
    {
      id: "i1", result: "FAILED", at: "2026-11-27T14:00:00Z", current: false, inspector: "Tunde Bakare",
      notes: "Brake still noisy at low speed. Recheck front left caliper slider.", failedLines: ["Replace front brake pads"],
      lines: [], general: [], roadTest: { startKm: 48262, endKm: 48270, notes: null }, acOutletTempC: null, certified: null,
    },
  ],
  access: { canRecord: true, reason: null },
};
const filled = () => ({
  lines: { l1: "PASS", l2: "PASS" },
  general: { NO_WARNING_LIGHTS: true, FLUID_LEVELS: true, WHEEL_NUTS: true, INTERIOR_CLEAN: true },
  acOutletTempC: "6",
  startKm: "48,262",
  endKm: "48270",
  roadTestNotes: "",
  signature: "data:image/png;base64,AAAA",
});

test("km and temperature parsing and the messages under the fields", () => {
  assert.equal(logic.parseKm("48,262"), 48262);
  assert.equal(logic.parseKm(" "), null);
  assert.equal(logic.parseKm("48.5"), "invalid");
  assert.equal(logic.parseTemp("6.5"), 6.5);
  assert.equal(logic.parseTemp("45"), "invalid");
  assert.deepEqual(plain(logic.qcFieldErrors({ startKm: "48270", endKm: "48262", acOutletTempC: "" })), { endKm: "End km must be the same as or higher than start km." });
  assert.deepEqual(plain(logic.qcFieldErrors({ startKm: "abc", endKm: "", acOutletTempC: "x" })), {
    startKm: "Enter the km as a whole number, for example 48262.",
    acOutletTempC: "Enter the temperature in °C between 0 and 40, or leave it empty.",
  });
});

test("Pass quality check: the same reasons as the server, in screen order", () => {
  assert.deepEqual(plain(logic.passBlockers(filled(), step)), []);
  const empty = logic.initialQcForm(step);
  assert.equal(empty.startKm, "48262");
  assert.deepEqual(plain(logic.passBlockers(empty, step)), [
    "Check every work item: 2 left.",
    "Confirm every general check: No warning lights on dashboard, Fluid levels correct, Wheel nuts torqued, Vehicle interior clean.",
    "Enter the road test start and end km.",
    "Sign the certification.",
  ]);
  assert.deepEqual(plain(logic.passBlockers({ ...filled(), lines: { l1: "PASS", l2: "FAIL" }, endKm: "48000" }, step)), [
    "A work item is marked Fail. Use Fail and return to technician.",
    "End km must be the same as or higher than start km.",
  ]);
});

test("Fail and return: notes and failed work are required; the request carries only what was decided", () => {
  const form = { ...filled(), lines: { l1: "PASS", l2: "FAIL" }, signature: null };
  const fail = logic.initialFailForm(form, step);
  assert.deepEqual(plain(fail), { notes: "", failed: ["l2"] });
  assert.deepEqual(plain(logic.failProblems({ notes: "", failed: [] }, true, form)), {
    notes: "Write what the technician must fix.",
    lines: "Mark Fail on the work items that need rework.",
  });
  // Failing without a road test: the start km filled in from check-in is not a mistake and is not sent.
  assert.equal(logic.failProblems({ notes: "x", failed: ["l2"] }, true, { ...form, endKm: "" }).form, undefined);
  assert.equal(logic.qcPayload({ ...form, endKm: "" }, step, "FAIL", "req", { notes: "x", failed: ["l2"] }).roadTestStartKm, null);
  assert.equal(logic.failProblems({ notes: "x", failed: ["l2"] }, true, { ...form, startKm: "" }).form, "Enter both road test readings or clear them, then try again.");
  const body = logic.qcPayload(form, step, "FAIL", "req", { notes: " Brake still noisy. ", failed: ["l2"] });
  assert.deepEqual(plain(body.lines), [{ workLineId: "l1", result: "PASS" }, { workLineId: "l2", result: "FAIL" }]);
  assert.equal(body.notes, "Brake still noisy.");
  assert.equal(body.signatureImage, null);
  assert.equal(body.roadTestStartKm, 48262);
  const pass = logic.qcPayload(filled(), step, "PASS", "req");
  assert.equal(pass.acOutletTempC, 6);
  assert.equal(pass.signatureImage, "data:image/png;base64,AAAA");
  assert.equal(pass.general.every((check) => check.passed), true);
});

test("current QC result, road test text and readable labels", () => {
  assert.equal(logic.currentQcResult([{ result: "FAILED", supersededAt: "x" }, { result: "PASSED", supersededAt: null }]), "PASSED");
  assert.equal(logic.currentQcResult([]), null);
  assert.equal(logic.roadTestText({ startKm: 48262, endKm: 48270 }), "48,262 km to 48,270 km (8 km)");
  for (const label of [...Object.values(logic.QC_STATE_LABEL), ...Object.values(logic.QC_RESULT_BADGE).map((badge) => badge.label)])
    assert.doesNotMatch(label, /_|[A-Z]{3,}|\u2013|\u2014/);
});

test("the supervisor's form: approved work with Pass and Fail, general checks, road test, certification and history", () => {
  const mutation = { isPending: false, mutateAsync: async () => ({}) };
  const stub = (name) => () => React.createElement("div", { "data-stub": name });
  const load = loader({
    "@/features/auth/hooks/use-auth": { useAuth: () => ({ user: { firstName: "Tunde", lastName: "Bakare" }, hasPermission: () => true }) },
    "../../hooks/use-job-quality-check": { useRecordQualityCheck: () => mutation },
    "./FailReturnDialog": { FailReturnDialog: stub("fail") },
    "../SignaturePad": { SignaturePad: stub("signature") },
  });
  const { QualityCheckForm } = load("features/job-cards/components/quality-check/QualityCheckForm.tsx");
  const html = renderToStaticMarkup(
    React.createElement(QualityCheckForm, {
      job: { id: "job", jobNumber: "2026000127" },
      step,
      bar: { primary: null, secondary: [], danger: [], pending: null, onAction() {}, onDangerAction() {}, onNoteAction() {} },
    }),
  );
  for (const text of ["Approved work", "General checks", "Road test", "Certification", "Supervisor&#x27;s signature", "Pass quality check", "Fail and return to technician", "Redone after a failed check", "Earlier checks", "Recheck front left caliper slider", "Signing as Tunde Bakare", "AC outlet temperature", "48,262 km to 48,270 km (8 km)"])
    assert.ok(html.includes(text), text);
  assert.match(html, /Check every work item: 2 left\./);
  assert.match(html, /<button[^>]*disabled=""[^>]*>.*Pass quality check/);
  assert.match(html, /value="48262"/);
  assert.doesNotMatch(html, /undefined|null|NaN|PASSED|FAILED/);
});

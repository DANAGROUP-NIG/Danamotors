import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

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
    vm.runInNewContext(source, { module, exports: module.exports, require: resolve }, { filename: resolved });
    return module.exports;
  }
  return load;
}

const load = loader();
const logic = load("features/job-cards/lib/diagnosis.logic.ts");
const stage = load("features/job-cards/lib/job-stage.logic.ts");
const frame = load("features/job-cards/lib/job-frame.logic.ts");
const plain = (value) => JSON.parse(JSON.stringify(value));

const routing = (overrides = {}) => ({ coverageActive: false, openCampaigns: 0, warrantyCase: false, flaggedFindings: 0, route: "ESTIMATE", ...overrides });

test("routing card says where the job goes and why", () => {
  assert.deepEqual(plain(logic.routingView(routing({ flaggedFindings: 1, route: "WARRANTY" }))), {
    route: "WARRANTY",
    lines: ["1 finding is flagged as possible warranty.", "This job goes to the warranty officer next."],
    note: "Jobs with customer-pay items only go straight to the service advisor.",
  });
  const many = logic.routingView(routing({ flaggedFindings: 2, coverageActive: true, openCampaigns: 2, warrantyCase: true, route: "WARRANTY" }));
  assert.deepEqual(plain(many.lines), [
    "2 findings are flagged as possible warranty.",
    "The vehicle was under warranty when the job opened.",
    "There are 2 open campaigns for this vehicle.",
    "A warranty case is already open for this job.",
    "This job goes to the warranty officer next.",
  ]);
  const plainRoute = logic.routingView(routing());
  assert.equal(plainRoute.route, "ESTIMATE");
  assert.match(plainRoute.lines.at(-1), /service advisor next\. The warranty step is skipped with the reason Not under warranty\.$/);
  assert.equal(plainRoute.note, null);
});

test("allocation: badges, load, order, bays and the button", () => {
  assert.deepEqual(plain([0, 2, 3, 5].map(logic.availabilityBadge)), [
    { label: "Available", tone: "emerald" },
    { label: "Available", tone: "emerald" },
    { label: "Busy", tone: "amber" },
    { label: "Busy", tone: "amber" },
  ]);
  assert.deepEqual([0, 1, 5, 9].map(logic.loadPercent), [0, 20, 100, 100]);
  assert.equal(logic.jobsInHandText(1), "1 job in hand");
  const tech = (firstName, jobsInHand) => ({ id: firstName, firstName, lastName: "A", jobsInHand, employee: null });
  assert.deepEqual(plain(logic.sortTechnicians([tech("Sani", 4), tech("Segun", 2), tech("Musa", 0), tech("Emeka", 3), tech("Idris", 0)]).map((row) => row.firstName)), [
    "Idris", "Musa", "Segun", "Emeka", "Sani",
  ]);
  assert.equal(logic.teamTag({ employee: { team: { description: " Brakes and AC " } } }), "Brakes and AC");
  assert.equal(logic.teamTag({ employee: null }), null);
  assert.equal(logic.bayLabel({ id: "b", code: "A2", description: "Bay A2", occupiedBy: null }), "Bay A2 (free)");
  assert.equal(logic.bayLabel({ id: "b", code: "A1", description: "", occupiedBy: "2026000031" }), "A1 (occupied by job 2026000031)");
  assert.equal(logic.assignButtonLabel("Musa Abdullahi"), "Assign and send to Musa Abdullahi");
  assert.equal(logic.assignButtonLabel(null), "Assign technician");
});

test("allocation and return note validation name the field and the fix", () => {
  const errors = (schema, value) => (schema.safeParse(value).success ? [] : schema.safeParse(value).error.issues.map((issue) => issue.message));
  assert.deepEqual(errors(logic.allocationSchema, { technicianId: "", bayId: "", note: "" }), ["Choose a technician from the list.", "Choose a bay for the vehicle."]);
  assert.deepEqual(errors(logic.allocationSchema, { technicianId: "t", bayId: "b", note: "x".repeat(501) }), ["Keep the note to the technician under 500 characters."]);
  assert.deepEqual(errors(logic.returnNoteSchema, { note: "   " }), ["Write what the technician should check again."]);
  assert.deepEqual(errors(logic.returnNoteSchema, { note: "Check the refrigerant pressure" }), []);
});

test("findings: cards per request, extras, payload and summaries", () => {
  const diagnosis = {
    requests: [
      { id: "r1", number: 1, description: "Noise from front left wheel when braking" },
      { id: "r2", number: 2, description: "AC not cooling well" },
    ],
    findings: [
      { id: "f2", complaintId: "r2", causeAndDefect: "Compressor clutch not engaging", possibleWarranty: true, version: 3, items: [], photos: [] },
      { id: "x1", complaintId: null, causeAndDefect: "Rear wiper blade torn", possibleWarranty: false, version: 1, items: [], photos: [] },
    ],
  };
  assert.deepEqual(logic.requestCards(diagnosis).map((card) => [card.request.number, card.finding?.id ?? null]), [[1, null], [2, "f2"]]);
  assert.deepEqual(logic.extraFindings(diagnosis).map((f) => f.id), ["x1"]);
  assert.deepEqual(logic.reviewRows(diagnosis).map((row) => [row.request?.number ?? null, row.finding?.id ?? null]), [[1, null], [2, "f2"], [null, "x1"]]);
  const draft = { causeAndDefect: "Pads worn", possibleWarranty: false, items: [{ kind: "PART", referenceId: "p", description: "Front brake pads set", quantity: 1 }] };
  assert.deepEqual(plain(logic.findingPayload("r1", draft, 0)), {
    complaintId: "r1",
    causeAndDefect: "Pads worn",
    possibleWarranty: false,
    items: [{ kind: "PART", referenceId: "p", quantity: 1 }],
    expectedVersion: 0,
  });
  assert.equal(logic.findingSummary({ causeAndDefect: "  " }), "No finding written yet");
  assert.equal(logic.findingSummary({ causeAndDefect: " Pads worn " }), "Pads worn");
});

test("items: no prices, quantities in plain numbers, steppers and duplicates", () => {
  assert.equal(logic.itemLine({ kind: "LABOUR", description: "Replace front brake pads", quantity: 1 }), "Replace front brake pads");
  assert.equal(logic.itemLine({ kind: "OIL", description: "Engine oil 5W-30", quantity: 4.5 }), "Engine oil 5W-30 (qty 4.5)");
  assert.equal(logic.formatQuantity(2), "2");
  assert.equal(logic.stepQuantity("PART", 1, -1), 1);
  assert.equal(logic.stepQuantity("PART", 1, 1), 2);
  assert.equal(logic.stepQuantity("OIL", 4, 1), 4.5);
  assert.equal(logic.stepQuantity("OIL", 0.5, -1), 0.5);
  assert.deepEqual(plain(logic.parseQuantity("4.5")), { ok: true, quantity: 4.5 });
  assert.deepEqual(plain(logic.parseQuantity("0")), { ok: false, message: "Enter a quantity above 0." });
  assert.deepEqual(plain(logic.parseQuantity("1.234")), { ok: false, message: "Enter the quantity as a number with up to 2 decimal places." });
  assert.deepEqual(plain(logic.parseQuantity("abc")), { ok: false, message: "Enter the quantity as a number with up to 2 decimal places." });
  const part = { kind: "PART", referenceId: "p", description: "Pads", quantity: 1 };
  const work = { kind: "LABOUR", referenceId: "p", description: "Fit pads", quantity: 1 };
  assert.deepEqual(plain(logic.addItem([part], part)), [{ ...part, quantity: 2 }]);
  assert.deepEqual(plain(logic.addItem([part], work)), [part, work]);
  assert.deepEqual(plain(logic.addItem([part, work], work)), [part, work]);
});

test("technician lines: engineer, returned banner and dictation", () => {
  assert.equal(logic.engineerLine(["Kelechi Nwosu"]), "Kelechi Nwosu (Service engineer) reviews your findings next.");
  assert.equal(logic.engineerLine([]), "The service engineer reviews your findings next.");
  assert.equal(logic.returnedBanner({ by: "Kelechi Nwosu", note: "x", at: "t" }, "26 Nov 2026, 10:00"), "Returned by Kelechi Nwosu, 26 Nov 2026, 10:00.");
  assert.equal(logic.speechRecognitionAvailable({ webkitSpeechRecognition: function Engine() {} }), true);
  assert.equal(logic.speechRecognitionAvailable({}), false);
  assert.equal(logic.speechRecognitionAvailable(undefined), false);
  assert.equal(logic.appendDictation("Pads worn", " disc fine "), "Pads worn disc fine");
  assert.equal(logic.appendDictation("", "Pads worn"), "Pads worn");
  assert.equal(logic.appendDictation("Pads worn", "  "), "Pads worn");
});

test("stage wording: engineer actions, the review sub-step and the skipped warranty reason", () => {
  assert.equal(stage.ACTION_LABELS.SEND_TO_ENGINEER, "Send to service engineer");
  assert.equal(stage.ACTION_LABELS.SEND_TO_WARRANTY, "Confirm and send to warranty officer");
  assert.equal(stage.ACTION_LABELS.SEND_TO_ADVISOR, "Confirm and send to service advisor");
  assert.equal(stage.ACTION_LABELS.RETURN_TO_TECHNICIAN, "Return to technician");
  assert.equal(stage.SUB_STEP_LABELS.ENGINEER_REVIEW, "Service engineer is reviewing the findings");
  assert.equal(stage.summaryLine({ stage: "WARRANTY", state: "SKIPPED", by: "Kelechi Nwosu", at: null, reason: "Not under warranty" }), "Warranty skipped. Not under warranty.");
  assert.equal(stage.ownerRoleLabel("Engineer"), "Service engineer");
  assert.equal(
    frame.activityLine({ action: "ASSIGNED", fromStage: "DIAGNOSIS", toStage: "DIAGNOSIS" }),
    "Technician and bay assigned (Diagnosis)",
  );
  assert.equal(
    frame.activityLine({ action: "RETURN_TO_TECHNICIAN", fromStage: "DIAGNOSIS", toStage: "DIAGNOSIS" }),
    "Return to technician (Diagnosis)",
  );
});

test("finished diagnosis summary lists the findings and who confirmed them", () => {
  const job = {
    technician: { firstName: "Musa", lastName: "Abdullahi" },
    bay: { description: "Bay A2" },
    findings: [
      { causeAndDefect: "Front pads worn to 2 mm.", possibleWarranty: false },
      { causeAndDefect: "Compressor clutch not engaging.", possibleWarranty: true },
      { causeAndDefect: " ", possibleWarranty: false },
    ],
    diagnosis: { confirmedAt: "2026-11-26T09:40:00Z", route: "WARRANTY", confirmedBy: { firstName: "Kelechi", lastName: "Nwosu" } },
  };
  const rows = Object.fromEntries(frame.stageDetails("DIAGNOSIS", job).map((row) => [row.label, row.value]));
  assert.equal(rows.Technician, "Musa Abdullahi");
  assert.equal(rows.Findings, "Front pads worn to 2 mm. Compressor clutch not engaging.");
  assert.equal(rows["Possible warranty"], "1 finding");
  assert.match(rows["Confirmed by"], /^Kelechi Nwosu, 26 Nov 2026, 10:40$/);
  const empty = Object.fromEntries(frame.stageDetails("DIAGNOSIS", {}).map((row) => [row.label, row.value]));
  assert.deepEqual([empty.Findings, empty["Possible warranty"], empty["Confirmed by"]], ["Not provided", "Not provided", "Not provided"]);
});

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
    vm.runInNewContext(source, { module, exports: module.exports, require: resolve }, { filename: resolved });
    return module.exports;
  }
  return load;
}

const load = loader();
const frame = load("features/job-cards/lib/job-frame.logic.ts");
const format = load("lib/format.ts");
const cancelSchema = load("features/job-cards/schemas/cancel-job.schema.ts");
const workshopSchemas = load("features/job-cards/schemas/workshop-actions.schema.ts");
const plain = (value) => JSON.parse(JSON.stringify(value));

const now = new Date("2026-11-26T10:00:00Z");

test("countdown is plain until 4 hours remain, amber inside 4 hours and red once passed", () => {
  assert.deepEqual(plain(frame.promiseCountdown("2026-11-28T10:00:00Z", "REPAIR", now)), { tone: "normal", text: "in 2 days" });
  assert.deepEqual(plain(frame.promiseCountdown("2026-11-26T14:00:01Z", "REPAIR", now)), { tone: "normal", text: "in 4 h" });
  assert.deepEqual(plain(frame.promiseCountdown("2026-11-26T13:59:00Z", "REPAIR", now)), { tone: "soon", text: "in 3 h" });
  assert.deepEqual(plain(frame.promiseCountdown("2026-11-26T10:20:00Z", "REPAIR", now)), { tone: "soon", text: "in 20 min" });
  assert.deepEqual(plain(frame.promiseCountdown("2026-11-26T08:00:00Z", "REPAIR", now)), { tone: "overdue", text: "Overdue by 2 h" });
  assert.deepEqual(plain(frame.promiseCountdown("2026-11-23T10:00:00Z", "BILLING", now)), { tone: "overdue", text: "Overdue by 3 days" });
  assert.deepEqual(plain(frame.promiseCountdown("2026-11-26T09:59:40Z", "REPAIR", now)), { tone: "overdue", text: "Due now" });
  for (const stage of ["CLOSED", "CANCELLED"]) assert.equal(frame.promiseCountdown("2026-11-26T08:00:00Z", stage, now), null);
  for (const missing of [null, undefined, "", "not a date"]) assert.equal(frame.promiseCountdown(missing, "REPAIR", now), null);
});

const summaries = [
  { stage: "CHECK_IN", state: "COMPLETED", by: "Chidi Eze", at: "2026-11-25T08:40:00Z" },
  { stage: "DIAGNOSIS", state: "COMPLETED", by: null, at: null },
  { stage: "WARRANTY", state: "SKIPPED", by: null, at: null },
  { stage: "ESTIMATE", state: "COMPLETED", by: "Chidi Eze", at: "2026-11-25T11:05:00Z" },
];

test("stepper shows each step's state, who finished it and when, and skipped steps", () => {
  const steps = frame.stepperView({ stage: "REPAIR", summaries });
  assert.deepEqual(
    plain(steps.map((step) => [step.number, step.label, step.state, step.caption, step.opensSummary])),
    [
      [1, "Check-in", "completed", "Chidi Eze, 25 Nov 2026, 09:40", true],
      [2, "Diagnosis", "completed", "Not provided", true],
      [3, "Warranty", "skipped", "Skipped", false],
      [4, "Estimate", "completed", "Chidi Eze, 25 Nov 2026, 12:05", true],
      [5, "Repair", "current", null, false],
      [6, "Quality check", "upcoming", null, false],
      [7, "Billing", "upcoming", null, false],
      [8, "Delivery", "upcoming", null, false],
    ],
  );
  assert.equal(frame.stepProgress({ stage: "REPAIR", summaries }), 50);
  assert.equal(frame.stepProgress({ stage: "CHECK_IN", summaries: [] }), 0);
  assert.equal(frame.stepProgress({ stage: "CLOSED", summaries }), 100);
  const cancelled = frame.stepperView({ stage: "CANCELLED", summaries: summaries.slice(0, 1) });
  assert.deepEqual(plain(cancelled.map((step) => step.state)), ["completed", ...Array(7).fill("upcoming")]);
});

const legacyJob = {
  id: "job",
  jobNumber: "2026000127",
  status: "IN_PROGRESS",
  mileage: null,
  serviceAdvisor: null,
  complaints: [],
  estimates: [],
  invoices: [],
  partIssuances: [],
  labourLines: [],
};

test("finished steps with no recorded data read Not provided instead of looking broken", () => {
  const items = frame.summaryItems({ summaries }, legacyJob);
  assert.equal(items[1].line, "Diagnosis completed. Not provided.");
  assert.equal(items[2].line, "Warranty skipped.");
  assert.deepEqual(plain(items[2].details), []);
  assert.deepEqual(plain(items[0].details), [
    { label: "Received by", value: "Not provided" },
    { label: "Mileage", value: "Not provided" },
    { label: "Service type", value: "Not provided" },
    { label: "Promised delivery", value: "Not provided" },
    { label: "Customer requests", value: "Not provided" },
    { label: "Instructions to technician", value: "Not provided" },
    { label: "Walk-around", value: "Not provided" },
    { label: "Customer consent", value: "Not provided" },
  ]);
  assert.deepEqual(plain(frame.stageDetails("ESTIMATE", legacyJob)), [{ label: "Estimate", value: "Not provided" }]);
  for (const stage of ["CHECK_IN", "DIAGNOSIS", "WARRANTY", "ESTIMATE", "REPAIR", "QUALITY_CHECK", "BILLING", "DELIVERY"]) {
    const text = JSON.stringify(frame.stageDetails(stage, legacyJob));
    for (const bad of ["undefined", "null", "NaN", "_"]) assert.equal(text.includes(bad), false, `${stage} shows ${bad}`);
  }
});

test("finished steps show the recorded facts in plain words", () => {
  const job = {
    ...legacyJob,
    mileage: 48250,
    serviceAdvisor: { firstName: "Chidi", lastName: "Eze" },
    serviceType: { description: "Periodic service" },
    promisedAt: "2026-11-28T15:00:00Z",
    complaints: [{ description: "Noise from front left wheel when braking" }, { description: "AC not cooling well" }],
    openingSignatureCurrent: true,
    checkIn: {
      fuelLevel: "HALF",
      checklist: { HUB_CAPS: "MISSING", AC_WORKING: "NOT_WORKING", CLOCK: "PRESENT" },
      checklistNote: null,
      serviceBookSeen: true,
      serviceBookStamps: 3,
      noValuables: true,
      belongingsNote: "Umbrella in boot",
      instructionsToTechnician: "Check the front left brake.",
      completedAt: "2026-11-25T08:40:00Z",
    },
    damageMarks: [{ id: "m", type: "SCRATCH", x: "50.00", y: "95.00" }],
    qcStatus: "PASSED",
    estimates: [{ id: "e", version: 2, status: "Approved", amount: 152112.5, currency: "NGN", description: "Estimate", approvals: [], lines: [] }],
  };
  const checkIn = Object.fromEntries(frame.stageDetails("CHECK_IN", job).map((row) => [row.label, row.value]));
  assert.equal(checkIn["Received by"], "Chidi Eze");
  assert.equal(checkIn.Mileage, "48,250 km");
  assert.equal(checkIn["Promised delivery"], "28 Nov 2026, 16:00");
  assert.equal(checkIn["Customer requests"], "Noise from front left wheel when braking; AC not cooling well");
  assert.equal(checkIn["Customer consent"], "Signed by the customer");
  assert.equal(checkIn["Instructions to technician"], "Check the front left brake.");
  assert.equal(checkIn["Fuel level"], "Half (1/2)");
  assert.equal(checkIn["Damage noted"], "Scratch on rear bumper");
  assert.equal(checkIn.Checklist, "1 missing, 1 not working");
  assert.equal(checkIn.Belongings, "No valuables. Items left: Umbrella in boot");
  assert.deepEqual(plain(frame.stageDetails("ESTIMATE", job)), [
    { label: "Estimate", value: "Revision 2" },
    { label: "Customer decision", value: "Approved" },
    { label: "Estimate total", value: "₦152,112.50" },
  ]);
  assert.equal(frame.stageDetails("QUALITY_CHECK", job)[0].value, "Passed");
});

test("alerts keep at most 3 and offer a link only where the person can act", () => {
  const alerts = [
    { code: "PROMISE_PASSED", tone: "danger", message: "The promised delivery time has passed." },
    { code: "NO_TECHNICIAN", tone: "warning", message: "No technician is assigned to this job." },
    { code: "WAITING_PARTS", tone: "warning", message: "Work is paused while the job waits for parts." },
    { code: "CAMPAIGN_ANSWERS", tone: "warning", message: "Campaign work needs an answer." },
  ];
  const views = frame.alertViews(alerts, { canAssign: true, canSeeParts: true });
  assert.equal(views.length, 3);
  assert.deepEqual(plain(views.map((view) => view.link)), [null, { label: "Assign a technician", anchor: "assign-technician" }, { label: "View parts", anchor: "job-parts" }]);
  assert.deepEqual(plain(frame.alertViews(alerts.slice(1), { canAssign: false, canSeeParts: false }).map((view) => view.link)), [
    null,
    null,
    { label: "Open campaigns", tab: "warranty" },
  ]);
});

test("the waiting banner names the owner and their role", () => {
  const base = { readOnly: true, stage: "REPAIR", jobType: "SERVICE", owner: { id: "t", name: "Musa Abdullahi", role: "Technician" } };
  assert.equal(frame.waitingMessage(base), "Waiting for Musa Abdullahi (Technician). You can view this step but only the technician can update it.");
  assert.equal(
    frame.waitingMessage({ ...base, stage: "DIAGNOSIS", owner: { id: null, name: null, role: "WorkshopManager" } }),
    "Waiting for the workshop supervisor. You can view this step but only the workshop supervisor can update it.",
  );
  assert.equal(frame.waitingMessage({ ...base, readOnly: false }), null);
  assert.equal(frame.waitingMessage({ ...base, stage: "CLOSED" }), null);
  assert.equal(frame.waitingMessage({ ...base, stage: "CANCELLED" }), null);
  assert.equal(frame.waitingMessage({ ...base, jobType: "PDI" }), "This is a PDI job card. Update it from the PDI menu.");
});

test("load problems split into no access, not found and everything else", () => {
  assert.equal(frame.loadProblem({ response: { status: 403 } }), "denied");
  assert.equal(frame.loadProblem({ response: { status: 404 } }), "not-found");
  assert.equal(frame.loadProblem({ response: { status: 400 } }), "not-found");
  assert.equal(frame.loadProblem({ response: { status: 500 } }), "error");
  assert.equal(frame.loadProblem(new Error("Network Error")), "error");
  assert.equal(frame.loadProblem(null), "error");
});

test("activity, toasts, vehicle, customer and bill wording never show codes", () => {
  const entry = { id: "a", at: "2026-11-25T08:40:00Z", fromStage: "CHECK_IN", toStage: "DIAGNOSIS", action: "SEND_TO_SUPERVISOR", by: "Chidi Eze", ownerName: null, ownerRole: "WorkshopManager", note: null };
  assert.equal(frame.activityLine(entry), "Moved from Check-in to Diagnosis");
  assert.equal(frame.activityOwner(entry), "Workshop supervisor");
  assert.equal(frame.activityOwner({ ...entry, ownerName: "Tunde Bakare" }), "Tunde Bakare (Workshop supervisor)");
  assert.equal(frame.activityOwner({ ...entry, ownerName: null, ownerRole: null }), null);
  assert.equal(frame.activityLine({ ...entry, fromStage: null, toStage: "CHECK_IN", action: "OPENED" }), "Job opened at Check-in");
  assert.equal(frame.activityLine({ ...entry, fromStage: "REPAIR", toStage: "REPAIR", action: "PAUSE_FOR_PARTS" }), "Pause for parts (Repair)");
  assert.equal(frame.activityLine({ ...entry, fromStage: "REPAIR", toStage: "REPAIR", action: "ASSIGNED" }), "Step owner changed (Repair)");
  assert.equal(frame.activityLine({ ...entry, toStage: "CANCELLED", action: "CANCEL" }), "Job cancelled");

  const ws = { jobNumber: "2026000127", stage: "DIAGNOSIS", owner: { id: "u", name: "Tunde Bakare", role: "WorkshopManager" } };
  assert.equal(frame.actionToast("SEND_TO_SUPERVISOR", ws), "Job 2026000127 sent to Tunde Bakare");
  assert.equal(frame.actionToast("PAUSE_FOR_PARTS", ws), "Job 2026000127 paused for parts");
  assert.equal(frame.actionToast("RESUME_REPAIR", ws), "Work resumed on job 2026000127");
  assert.equal(frame.actionToast("MARK_READY", ws), "Job 2026000127 marked ready");
  assert.equal(frame.actionToast("CANCEL", { ...ws, stage: "CANCELLED" }), "Job 2026000127 cancelled");

  assert.equal(frame.vehicleTitle({ make: "Kia", model: "Sportage", year: 2023, color: "White" }), "Kia Sportage 2023, white");
  assert.equal(frame.vehicleTitle({ make: "Kia", model: "Sportage", year: null, color: null }), "Kia Sportage");
  assert.equal(frame.vehicleTitle(null), "Not provided");
  assert.equal(frame.customerName({ firstName: "Adaeze", lastName: "Okafor" }), "Adaeze Okafor");
  assert.equal(frame.customerName({ firstName: "", lastName: "", companyName: "Lakeside Logistics" }), "Lakeside Logistics");
  assert.equal(frame.customerName(undefined), "Not provided");

  assert.deepEqual(plain(frame.invoiceStatusBadge("Paid")), { label: "Paid", tone: "emerald" });
  assert.deepEqual(plain(frame.invoiceStatusBadge("PARTIALLY_PAID")), { label: "Part paid", tone: "amber" });
  assert.deepEqual(plain(frame.invoiceStatusBadge("VOID")), { label: "Cancelled", tone: "gray" });
  assert.deepEqual(plain(frame.invoiceStatusBadge("ON_HOLD")), { label: "On hold", tone: "gray" });
  assert.deepEqual(plain(frame.invoiceStatusBadge(null)), { label: "Status not recorded", tone: "gray" });
  assert.equal(frame.jobStatusWords("WAITING_PARTS"), "Waiting for parts");
  assert.equal(frame.jobStatusWords("SOMETHING_NEW"), "Status not recorded");
  assert.equal(format.formatKm(48250), "48,250 km");
  assert.equal(format.formatKm(null), "Not provided");
});

test("forms name the field and the fix", () => {
  const cancel = cancelSchema.cancelJobSchema;
  assert.equal(cancel.safeParse({ reason: "   " }).error.issues[0].message, "Enter the reason for cancelling this job.");
  assert.equal(cancel.safeParse({ reason: "x".repeat(2001) }).error.issues[0].message, "Keep the reason to 2,000 characters or fewer.");
  assert.equal(cancel.parse({ reason: "  Customer took the vehicle elsewhere " }).reason, "Customer took the vehicle elsewhere");

  const findings = workshopSchemas.findingsSchema;
  const base = { serviceCharge: "2100", engineerId: "", observations: "", workDone: "" };
  assert.equal(findings.safeParse(base).success, true);
  assert.equal(findings.safeParse({ ...base, serviceCharge: "2100.50" }).success, true);
  for (const bad of ["", "-1", "12.345", "abc"])
    assert.equal(findings.safeParse({ ...base, serviceCharge: bad }).error.issues[0].message, "Enter the service charge in naira, 0 or more, with up to two decimal places.");

  const onTime = workshopSchemas.deliverySchema(false);
  const late = workshopSchemas.deliverySchema(true);
  const delivery = { deliveryAdvisorId: "a", lateReasonIds: [], lateRemarks: "", remarks: "" };
  assert.equal(onTime.safeParse(delivery).success, true);
  assert.equal(late.safeParse(delivery).error.issues[0].message, "The promised time has passed. Choose at least one late-delivery reason.");
  assert.equal(late.safeParse({ ...delivery, lateReasonIds: ["1"] }).success, true);
  assert.equal(late.safeParse({ ...delivery, lateReasonIds: ["1", "2", "3", "4", "5", "6", "7"] }).error.issues[0].message, "Choose up to six late-delivery reasons.");
  assert.equal(onTime.safeParse({ ...delivery, deliveryAdvisorId: "" }).error.issues[0].message, "Choose the delivery advisor who hands the vehicle over.");
  assert.equal(workshopSchemas.creditApprovalSchema.safeParse({ remarks: " " }).error.issues[0].message, "Enter why delivery on credit is approved.");
});

const ui = loader({
  "framer-motion": { motion: { div: (props) => React.createElement("div", props) }, AnimatePresence: ({ children }) => children ?? null },
});
const { StageActionBar } = ui("features/job-cards/components/workspace/StageActionBar.tsx");
const { JobStepper } = ui("features/job-cards/components/workspace/JobStepper.tsx");
const { JobLoadProblem, CancelledPanel } = ui("features/job-cards/components/workspace/JobPageStates.tsx");
const bar = (props) =>
  renderToStaticMarkup(React.createElement(StageActionBar, { primary: null, secondary: [], danger: [], pending: null, onAction() {}, onDangerAction() {}, ...props }));
const view = (action, enabled, reasons = [], kind = "primary") => ({ action, kind, enabled, reasons, requiresNote: action === "CANCEL" });

test("a blocked handoff shows its reason beside the button, not only in a tooltip", () => {
  const html = bar({ primary: view("SEND_TO_SUPERVISOR", false, ["Add at least one customer request.", "Get the customer's signature first."]) });
  const reason = html.match(/<p id="([^"]+)"[^>]*>([^<]*)<\/p>/);
  assert.ok(reason, "reason paragraph rendered");
  assert.equal(reason[2], "Add at least one customer request. Get the customer&#x27;s signature first.");
  const button = html.match(/<button[^>]*aria-describedby="([^"]+)"[^>]*>/);
  assert.ok(button, "button points at the reason");
  assert.equal(button[1], reason[1]);
  assert.ok(button[0].includes("disabled"));
  assert.ok(html.includes("Send to workshop supervisor"));
});

test("an enabled handoff has no reason, and the bar is absent when there is nothing to do", () => {
  const html = bar({ primary: view("SEND_TO_QC", true) });
  assert.equal(html.includes("aria-describedby"), false);
  assert.ok(html.includes("Send to quality check"));
  assert.equal(bar({}), "");
  assert.equal(bar({ secondary: [view("RETURN_TO_REPAIR", false, ["Record a failed quality check first."], "secondary")] }), "");
  const more = bar({ danger: [view("CANCEL", true, [], "danger")] });
  assert.ok(more.includes("More"));
  assert.ok(bar({ primary: view("SEND_TO_QC", true), pending: "SEND_TO_QC" }).includes("Sending"));
  assert.ok(bar({ onSaveDraft() {} }).includes("Save draft"));
});

test("the stepper is an ordered list with the current step marked and finished steps as buttons", () => {
  const steps = frame.stepperView({ stage: "REPAIR", summaries });
  const html = renderToStaticMarkup(React.createElement(JobStepper, { steps, phoneLabel: "Step 5 of 8: Repair", progress: 50, cancelled: false, onOpenSummary() {} }));
  assert.ok(html.includes("<ol"));
  assert.equal((html.match(/aria-current="step"/g) || []).length, 1);
  assert.equal((html.match(/<button/g) || []).length, 4);
  assert.ok(html.includes("Step 5 of 8: Repair"));
  assert.ok(html.includes('aria-valuenow="50"'));
});

test("page states explain what happened and what to do next", () => {
  const render = (kind, jobNumber) => renderToStaticMarkup(React.createElement(JobLoadProblem, { kind, jobNumber, retrying: false, onRetry() {} }));
  assert.ok(render("error", "2026000127").includes("Could not load job 2026000127"));
  assert.ok(render("error").includes("Could not load this job card"));
  assert.ok(render("error").includes("Try again"));
  assert.ok(render("denied").includes("Only staff who work at that branch"));
  assert.equal(render("denied").includes("Try again"), false);
  assert.ok(render("not-found").includes("Job card not found"));
  const cancelled = renderToStaticMarkup(
    React.createElement(CancelledPanel, { cancellation: { by: "Funmi Oladele", at: "2026-11-25T10:00:00Z", reason: "Customer took the vehicle to another workshop." }, onViewActivity() {} }),
  );
  assert.ok(cancelled.includes("Cancelled by Funmi Oladele, 25 Nov 2026, 11:00."));
  assert.ok(cancelled.includes("Reason: Customer took the vehicle to another workshop."));
  const unknown = renderToStaticMarkup(React.createElement(CancelledPanel, { cancellation: null, onViewActivity() {} }));
  assert.ok(unknown.includes("Cancelled by Not provided, Not provided."));
});

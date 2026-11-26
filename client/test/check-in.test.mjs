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
      if (target in stubs) return stubs[target];
      return load(target);
    }
    // Same realm as the test, so deepEqual compares plain objects and arrays as equal.
    const run = new vm.Script(`(function (module, exports, require) {${source}\n})`, { filename: resolved }).runInThisContext();
    run(module, module.exports, resolve);
    return module.exports;
  }
  return load;
}

const logic = loader()("features/job-cards/lib/check-in.logic.ts");
const items = [
  { code: "SERVICE_BOOK", label: "Service book" },
  { code: "HUB_CAPS", label: "Hub caps" },
  { code: "AC_WORKING", label: "AC working" },
];

test("checklist chips cycle through the three states and the rest can be marked present", () => {
  assert.equal(logic.nextChecklistState(undefined), "PRESENT");
  assert.equal(logic.nextChecklistState("PRESENT"), "MISSING");
  assert.equal(logic.nextChecklistState("MISSING"), "NOT_WORKING");
  assert.equal(logic.nextChecklistState("NOT_WORKING"), "PRESENT");
  assert.deepEqual(logic.markRestPresent({ HUB_CAPS: "MISSING" }, items), { HUB_CAPS: "MISSING", SERVICE_BOOK: "PRESENT", AC_WORKING: "PRESENT" });
  assert.deepEqual(logic.checklistCounts({ HUB_CAPS: "MISSING" }, items), { PRESENT: 0, MISSING: 1, NOT_WORKING: 0, UNSET: 2 });
  // Every state has a word as well as a colour.
  for (const view of Object.values(logic.CHECKLIST_STATE_VIEW)) assert.ok(view.label.length > 3);
});

test("damage is described in plain words from the diagram position", () => {
  assert.equal(logic.damageArea(50, 95), "rear bumper");
  assert.equal(logic.damageArea(80, 42), "front right door");
  assert.equal(logic.damageArea(15, 60), "rear left door");
  assert.equal(logic.damageArea(50, 3), "front bumper");
  assert.equal(logic.damageArea(50, 20), "bonnet");
  assert.equal(
    logic.damageSentence([
      { type: "SCRATCH", x: 50, y: 95 },
      { type: "DENT", x: 80, y: 42 },
    ]),
    "Scratch on rear bumper, dent on front right door",
  );
  assert.equal(logic.damageSentence([]), "No damage noted");
});

test("taps and arrow keys stay on the diagram", () => {
  assert.deepEqual(logic.tapPosition(150, 300, { left: 100, top: 100, width: 200, height: 400 }), { x: 25, y: 50 });
  assert.deepEqual(logic.tapPosition(-50, 900, { left: 0, top: 0, width: 200, height: 400 }), { x: 0, y: 100 });
  assert.deepEqual(logic.nudge({ x: 1, y: 50 }, "ArrowLeft"), { x: 0, y: 50 });
  assert.deepEqual(logic.nudge({ x: 50, y: 99 }, "ArrowDown"), { x: 50, y: 100 });
  assert.equal(logic.nudge({ x: 50, y: 50 }, "Enter"), null);
});

test("fuel, belongings and the saved indicator read as plain words", () => {
  assert.equal(logic.fuelLabel("HALF"), "Half (1/2)");
  assert.equal(logic.fuelLabel("FULL"), "Full");
  assert.equal(logic.fuelLabel(null), "Not provided");
  assert.equal(logic.belongingsText({ noValuables: true, belongingsNote: "Umbrella in boot" }), "No valuables. Items left: Umbrella in boot");
  assert.equal(logic.saveStateText({ kind: "saved", at: "2026-11-26T09:42:00Z" }), "Saved 10:42");
  assert.equal(logic.saveStateText({ kind: "error", message: "Network Error" }), "Not saved. Network Error");
  assert.equal(logic.itemsInState({ HUB_CAPS: "MISSING", AC_WORKING: "NOT_WORKING" }, items, "NOT_WORKING"), "AC working");
  assert.equal(logic.itemsInState({}, items, "MISSING"), "None");
});

test("check-in steps show which are done and the first open step", () => {
  const views = logic.checkInStepViews({ details: [], walkAround: ["Record the fuel level on Walk-around."], consent: ["x"] }, "WALK_AROUND");
  assert.deepEqual(
    views.map((view) => [view.label, view.done, view.current]),
    [
      ["Details", true, false],
      ["Walk-around", false, true],
      ["Customer consent", false, false],
    ],
  );
  assert.equal(views[0].accessibleLabel, "Step 1 of 3: Details, complete");
  assert.equal(logic.firstOpenStep({ step: "SEND_TO_WORKSHOP" }), "CUSTOMER_CONSENT");
});

test("details use Lagos time and keep request amounts without showing them", () => {
  assert.deepEqual(logic.lagosParts("2026-11-28T15:00:00Z"), { date: "2026-11-28", time: "16:00" });
  assert.equal(logic.lagosDateTime("2026-11-28", "16:00"), "2026-11-28T16:00:00+01:00");
  const values = logic.detailsDefaults(
    { customerId: "c", mileage: 48250, serviceTypeId: "s", promisedAt: "2026-11-28T15:00:00Z", complaints: [{ description: "AC not cooling well", spare: 25 }] },
    { record: { instructionsToTechnician: null }, previousReading: { km: 43100, at: null } },
  );
  assert.equal(values.previousMileage, 43100);
  const payload = logic.detailsPayload({ ...values, instructionsToTechnician: "  " });
  assert.equal(payload.promisedAt, "2026-11-28T16:00:00+01:00");
  assert.equal(payload.instructionsToTechnician, null);
  assert.deepEqual(payload.complaints, [{ description: "AC not cooling well", complaintCodeId: null, spare: 25, oil: 0, labour: 0 }]);
  assert.equal(logic.detailsErrorField("body.promisedAt"), "promisedTime");
  assert.equal(logic.detailsErrorField("body.complaints.0.description"), "complaints");
  assert.equal(
    logic.mileageProblem(43000, 43100, false),
    "Mileage cannot be lower than the last recorded 43,100 km. Check the reading, or tick Odometer replaced and give a reason.",
  );
  assert.equal(logic.mileageProblem(43000, 43100, true), null);
  assert.equal(logic.previousReadingText({ km: 43100, at: "2026-08-12T09:00:00Z" }), "Last recorded 43,100 km on 12 Aug 2026");
});

test("check-in notes say whether the visit is a repeat and flag warranty", () => {
  const notes = logic.detailsAlerts({ isRepeat: false, warrantyStatusAtCreation: "ACTIVE", campaigns: [] }, { openedAt: "2026-08-12T09:00:00Z", service: "Periodic service" });
  assert.deepEqual(
    notes.map((note) => note.message),
    ["Not a repeat visit. Last visit 12 Aug 2026, periodic service.", "This vehicle is under warranty. Warranty items will need the warranty officer's review."],
  );
  assert.equal(logic.detailsAlerts({ isRepeat: true, previousJob: { jobNumber: "2026000101" } }, null)[0].message, "Repeat visit. This job repeats job 2026000101.");
});

test("the consent form names each missing answer", () => {
  const ready = { accepted: true, signer: "OWNER", name: "", phone: "", relationship: "", signature: "data:image/png;base64,AA" };
  assert.deepEqual(logic.consentFormProblems(ready), {});
  assert.deepEqual(Object.keys(logic.consentFormProblems({ ...ready, accepted: false, signature: null })), ["accepted", "signature"]);
  assert.equal(logic.consentFormProblems({ ...ready, accepted: false }).accepted, "Tick the box to accept the terms and conditions.");
  const representative = logic.consentFormProblems({ ...ready, signer: "REPRESENTATIVE", phone: "12" });
  assert.deepEqual(Object.keys(representative), ["name", "phone", "relationship"]);
  assert.deepEqual(logic.fitPhoto(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(logic.fitPhoto(800, 600), { width: 800, height: 600 });
});

const terms = ["The vehicle is driven and tested at the customer's risk.", "Delays outside our control may extend the delivery date."];
const document = {
  version: 2,
  termsVersion: "a".repeat(64),
  statement: "I approve opening this job card for the vehicle and requests shown and accept the job card terms below.",
  terms,
  footer: null,
  scope: {
    jobCardId: "job",
    jobNumber: "2026000127",
    branchId: "branch",
    branchName: "Isolo",
    customerId: "customer",
    customerName: "Adaeze Okafor",
    vehicleId: "vehicle",
    registration: "KJA-482TX",
    vin: "KNAPU81BDP7123456",
    mileage: 48250,
    openedAt: "2026-11-25T08:15:00Z",
    promisedAt: "2026-11-28T15:00:00Z",
    service: "Periodic service",
    description: null,
    requests: [{ id: "r1", complaintCodeId: null, defectCode: null, description: "AC not cooling well" }],
    checkIn: {
      fuelLevel: "HALF",
      checklist: [
        { code: "HUB_CAPS", label: "Hub caps", state: "MISSING" },
        { code: "AC_WORKING", label: "AC working", state: "NOT_WORKING" },
      ],
      checklistNote: null,
      serviceBookSeen: true,
      serviceBookStamps: 3,
      noValuables: true,
      belongingsNote: "Umbrella in boot",
      damageMarks: [{ id: "m", type: "SCRATCH", x: 50, y: 95, note: null, photoId: null }],
      photos: [],
    },
  },
};
const signature = { id: "sig", revision: 1, signerName: "Adaeze Okafor", relationship: null, signerPhone: null, signedAt: "2026-11-25T08:40:00Z" };

function consentStep({ state = "required", gates = { details: [], walkAround: [], consent: ["x"] }, editable = true, permissions = ["jobcard:read", "estimate:sign", "estimate:print"], data, isError = false } = {}) {
  const value = data ?? { document, expectedHash: "b".repeat(64), state, signature: state === "signed" ? signature : null };
  const load = loader({
    "@/features/auth/hooks/use-auth": { useAuth: () => ({ hasPermission: (name) => permissions.includes(name) }) },
    [path.join(root, "features/job-cards/hooks/use-job-opening-consent.ts")]: {
      useJobOpeningConsent: () => ({ data: isError ? undefined : value, isLoading: false, isError, refetch() {} }),
      useSignJobOpening: () => ({ isPending: false, mutate() {} }),
    },
    [path.join(root, "features/job-cards/components/SignaturePad.tsx")]: {
      SignaturePad: ({ label }) => React.createElement("canvas", { "aria-label": label }),
    },
    "next/link": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) },
  });
  const { ConsentStep } = load("features/job-cards/components/check-in/ConsentStep.tsx");
  return renderToStaticMarkup(React.createElement(ConsentStep, { jobCardId: "job", checkIn: { gates, consentState: state }, editable, onGoTo() {} }));
}

test("the customer sees the walk-around in plain words, the numbered terms and no prices or staff notes", () => {
  const html = consentStep();
  assert.ok(html.includes("Please confirm your vehicle details"));
  assert.ok(html.includes("48,250 km"));
  assert.ok(html.includes("Half (1/2)"));
  assert.ok(html.includes("Scratch on rear bumper"));
  assert.ok(html.includes("Hub caps"));
  assert.ok(html.includes("28 Nov 2026, 16:00"));
  assert.match(html, /<ol class="list-decimal[^"]*">(<li[^>]*>[^<]+<\/li>){2}<\/ol>/);
  assert.ok(html.includes("I have read and accept the terms and conditions."));
  assert.ok(html.includes("Sign and accept"));
  assert.equal(/₦|NGN|undefined|null|NaN|SCRATCH|NOT_WORKING|THREE_QUARTER/.test(html), false);
});

test("consent covers signed, unfinished, stale, read-only, no permission, no terms and load error", () => {
  const signed = consentStep({ state: "signed" });
  assert.ok(signed.includes("Signed by Adaeze Okafor, 25 Nov 2026, 09:40"));
  assert.ok(signed.includes("View signed copy") && signed.includes("Print"));
  assert.ok(signed.includes("Signed on screen"));
  const unfinished = consentStep({ gates: { details: [], walkAround: ["Record the fuel level on Walk-around."], consent: ["x"] } });
  assert.ok(unfinished.includes("Record the fuel level on Walk-around.") && unfinished.includes("Go to Walk-around"));
  assert.ok(consentStep({ state: "stale" }).includes("The details changed after the customer signed."));
  assert.ok(consentStep({ editable: false }).includes("The customer has not signed yet."));
  assert.ok(consentStep({ permissions: ["jobcard:read"] }).includes("Your account cannot collect customer signatures."));
  const noTerms = consentStep({ data: { document: { ...document, terms: [] }, expectedHash: "c".repeat(64), state: "required", signature: null } });
  assert.ok(noTerms.includes("No job card terms are set up for this branch."));
  assert.match(noTerms, /<button[^>]*disabled=""[^>]*>Sign and accept/);
  assert.ok(consentStep({ isError: true }).includes("The customer consent could not be loaded."));
});

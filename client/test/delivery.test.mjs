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


const logic = loader()("features/job-cards/lib/delivery.logic.ts");
const plain = (value) => JSON.parse(JSON.stringify(value));

const step = {
  jobCardId: "job",
  jobNumber: "2026000127",
  stage: "DELIVERY",
  status: "BILLED",
  promisedAt: "2026-11-28T15:00:00.000Z",
  late: false,
  workDone: [
    { text: "Periodic service (50,000 km)", note: null },
    { text: "Replace rear wiper blade", note: "Added with your approval" },
  ],
  declined: ["Air filter element"],
  belongings: [
    { code: "SERVICE_BOOK", label: "Service book" },
    { code: "TOOL_KIT", label: "Tool kit" },
    { code: "BELONGINGS_NOTE", label: "Umbrella in boot" },
  ],
  owner: { name: "Adaeze Okafor", phone: "08035550142" },
  checkInSigner: null,
  releaseApproval: null,
  phoneApprovals: [],
  paymentProblem: null,
  invoiceId: null,
  delivered: null,
  access: { canDeliver: true, canSignEstimate: false, canApproveRelease: false, canRequestRelease: true },
};
const ready = { collector: "OWNER", returned: ["SERVICE_BOOK", "TOOL_KIT", "BELONGINGS_NOTE"], lateReasonIds: [], lateRemarks: "", signature: "data:image/png;base64,AAA" };

test("collector options: owner, the check-in signer when someone else signed, and someone else", () => {
  assert.deepEqual(plain(logic.collectorOptions(step).map((option) => [option.type, option.label, option.badge])), [
    ["OWNER", "Adaeze Okafor (owner)", "Matches job card signer"],
    ["OTHER", "Someone else", null],
  ]);
  const withRep = { ...step, checkInSigner: { name: "Kunle Adeyemi", phone: "08099900181" } };
  assert.deepEqual(plain(logic.collectorOptions(withRep)[1]), {
    type: "CHECK_IN_SIGNER",
    label: "Kunle Adeyemi (signed at check-in)",
    person: { name: "Kunle Adeyemi", phone: "08099900181" },
    badge: "Matches job card signer",
  });
  assert.equal(logic.collectorPerson(step, "OTHER"), null);
  const approved = { ...step, releaseApproval: { id: "a", collectorName: "Bola Ade", collectorPhone: "08039998888", reason: "Driver", approvedAt: "2026-11-28T14:00:00.000Z", approvedBy: "Mark Folorusho", approvedByRole: "ServiceManager" } };
  assert.deepEqual(plain(logic.collectorPerson(approved, "OTHER")), { name: "Bola Ade", phone: "08039998888" });
  assert.equal(logic.approverRoleLabel("WorkshopManager"), "Workshop manager");
});

test("delivery problems, in screen order, mirror the server", () => {
  assert.deepEqual(plain(logic.deliveryProblems(step, ready)), []);
  const empty = logic.emptyDeliveryForm();
  assert.deepEqual(plain(logic.deliveryProblems({ ...step, late: true, paymentProblem: "Balance of ₦48,350.00 not yet paid.", phoneApprovals: [{}] }, empty)), [
    "Balance of ₦48,350.00 not yet paid.",
    "The customer must first sign the estimate they approved on the phone.",
    "Tick Returned for every belonging: 3 are not ticked yet.",
    "Choose who is collecting the vehicle.",
    "The promised time has passed. Choose 1 to 6 reasons for late delivery.",
    "The customer must sign to take delivery.",
  ]);
  assert.deepEqual(plain(logic.deliveryProblems(step, { ...ready, returned: ["TOOL_KIT", "SERVICE_BOOK"] })), ["Tick Returned for every belonging: 1 is not ticked yet."]);
  assert.deepEqual(plain(logic.deliveryProblems(step, { ...ready, collector: "OTHER" })), [logic.RELEASE_RULE]);
  assert.match(logic.RELEASE_RULE, /^Terms clause 7: /);
  assert.equal(logic.lateReasonProblem(["a", "a"]), "Reasons for late delivery: A reason can be selected only once.");
  assert.equal(logic.lateReasonProblem(["1", "2", "3", "4", "5", "6", "7"]), "Reasons for late delivery: At most 6 reasons are allowed.");
  assert.equal(logic.blockedSummary(["One.", "Two.", "Three."]), "One. 2 more things to do before delivery.");
  assert.equal(logic.blockedSummary(["One."]), undefined);
});

test("payload sends late reasons only when late", () => {
  const form = { ...ready, lateReasonIds: ["r1"], lateRemarks: "  Pads late. " };
  assert.deepEqual(plain(logic.deliveryPayload(step, form, "req")), {
    requestId: "req", collectorType: "OWNER", returnedCodes: ready.returned, lateReasonIds: [], accepted: true, signatureImage: ready.signature,
  });
  assert.deepEqual(plain(logic.deliveryPayload({ ...step, late: true }, form, "req")).lateRemarks, "Pads late.");
});

test("delivered wording in Lagos time, with the follow-up date", () => {
  const delivered = { at: "2026-11-28T14:20:00.000Z", collector: { type: "OWNER", name: "Adaeze Okafor", phone: null, signedAt: "2026-11-28T14:20:00.000Z" } };
  assert.equal(logic.deliveredTitle(delivered), "Delivered to Adaeze Okafor, 28 Nov 2026, 15:20");
  assert.equal(logic.deliveredTitle({ ...delivered, collector: null }), "Delivered 28 Nov 2026, 15:20");
  assert.equal(logic.followUpLine("2026-11-30T08:00:00.000Z"), "Follow-up call scheduled for 30 Nov 2026.");
  assert.equal(logic.followUpLine(null), "Follow-up call date: Not provided.");
  assert.equal(
    logic.phoneApprovalLine({ version: 2, approverName: "Adaeze Okafor", approverPhone: "08035550142", approvedAt: "2026-11-27T09:15:00.000Z" }),
    "Revision 2, approved on the phone by Adaeze Okafor (08035550142), 27 Nov 2026, 10:15",
  );
});

test("release approval form names the field and the fix", () => {
  const result = logic.releaseApprovalSchema.safeParse({ collectorName: "B", collectorPhone: "123", reason: "ok" });
  assert.deepEqual(plain(result.error.issues.map((issue) => [issue.path[0], issue.message])), [
    ["collectorName", "Enter the full name of the person collecting."],
    ["reason", "Write why the vehicle can be released to this person (at least 10 characters)."],
    ["collectorPhone", "Enter a Nigerian mobile number, for example 0803 555 0142."],
  ]);
  assert.equal(logic.releaseApprovalSchema.safeParse({ collectorName: "Bola Ade", collectorPhone: "0803 999 8888", reason: "Owner sent her driver." }).success, true);
});

test("cards render the belongings, the clause 7 warning and the late reasons without raw codes", () => {
  const cards = loader()("features/job-cards/components/delivery/DeliveryCards.tsx");
  const html = [
    renderToStaticMarkup(React.createElement(cards.WorkDoneCard, { lines: step.workDone })),
    renderToStaticMarkup(React.createElement(cards.DeclinedCard, { items: [] })),
    renderToStaticMarkup(React.createElement(cards.BelongingsCard, { step, returned: ["TOOL_KIT"], editable: true, disabled: false, onChange() {} })),
    renderToStaticMarkup(
      React.createElement(cards.CollectorCard, {
        step, value: "OTHER", editable: true, disabled: false, onChange() {}, onApprove() {},
        request: { name: "", onName() {}, onSend() {}, pending: false, error: null },
      }),
    ),
    renderToStaticMarkup(
      React.createElement(cards.LateReasonsCard, {
        promisedAt: step.promisedAt, reasons: { state: "ready", options: [{ id: "r1", description: "Spare unavailable" }], retry() {} },
        selected: [], remarks: "", disabled: false, showError: true, onChange() {}, onRemarks() {},
      }),
    ),
  ].join("");
  for (const text of [
    "Replace rear wiper blade", "(added with your approval)", "The customer did not decline any recommended work.", "Umbrella in boot", "Tick all returned",
    "Terms clause 7", "Ask a manager to approve", "Delivered after the promised time of 28 Nov 2026, 16:00.", "Spare unavailable",
    "Choose at least one reason for late delivery.",
  ])
    assert.ok(html.includes(text), text);
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 4);
  for (const bad of ["BELONGINGS_NOTE", "CHECK_IN_SIGNER", "undefined", "null", "NaN", "—", "–"]) assert.ok(!html.replace(/id="[^"]*"/g, "").includes(`>${bad}`) && !html.includes(` ${bad} `), bad);
});

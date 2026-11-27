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

const logic = loader()("features/job-cards/lib/billing.logic.ts");
const plain = (value) => JSON.parse(JSON.stringify(value));

const base = {
  jobCardId: "job",
  stage: "BILLING",
  status: "BILLED",
  readyAt: "2026-11-27T14:10:00.000Z",
  customerPhone: "0803 555 0142",
  notices: [
    { id: "n2", channel: "SMS", phone: "0803 555 0142", note: null, at: "2026-11-27T14:10:00.000Z", by: "Chidi Eze" },
    { id: "n1", channel: "PHONE_CALL", phone: "0803 555 0142", note: "Collecting tomorrow.", at: "2026-11-26T09:00:00.000Z", by: "Chidi Eze" },
  ],
  storage: { notifiedAt: "2026-11-27T14:10:00.000Z", freeUntil: "2026-11-29T14:10:00.000Z", freeHours: 48, dailyRate: "2000.00", days: 0, proposedAmount: "0.00", running: false },
  washed: { at: "2026-11-27T15:00:00.000Z", by: "Chidi Eze" },
  comparison: {
    rows: [
      { group: "PARTS", estimated: "57000.00", actual: "65500.00", difference: "8500.00" },
      { group: "OIL", estimated: "38000.00", actual: "38000.00", difference: "0.00" },
      { group: "LABOUR", estimated: "40000.00", actual: "40000.00", difference: "0.00" },
      { group: "SERVICE_CHARGE", estimated: "6500.00", actual: "6500.00", difference: "0.00" },
      { group: "TOTAL", estimated: "141500.00", actual: "150000.00", difference: "8500.00" },
    ],
    problem: null,
  },
  warrantyClaim: { amount: "528000.00", officer: "Ngozi Adeyemi" },
  invoice: { id: "inv", number: "2026000201", issuedAt: "2026-11-27T15:30:00.000Z", total: "148350.00", advancePaid: "100000.00", paymentsReceived: "0.00", balanceDue: "48350.00", jobs: [{ id: "job", jobNumber: "2026000127" }] },
  paymentStatus: "UNPAID",
  draft: null,
  otherVehicleJobs: [],
  cancelledBill: null,
  credit: null,
  nothingToPay: false,
  deliveryProblem: "Balance of ₦48,350.00 not yet paid.",
  access: { canMarkReady: false, canNotify: true, canMarkWashed: true, canCreateInvoice: false, canRecordPayment: true, canApproveCredit: false },
};

test("notice and storage lines in Lagos time, with ₦", () => {
  assert.equal(logic.noticeLine(base.notices[0]), "SMS sent to 0803 555 0142 on 27 Nov 2026, 15:10");
  assert.equal(logic.noticeLine({ channel: "PHONE_CALL", phone: null, at: "2026-11-26T09:00:00.000Z" }), "Phone call to the customer on 26 Nov 2026, 10:00");
  assert.equal(logic.storageLine({ notifiedAt: null, freeHours: 48, dailyRate: "2000.00" }), "Storage charge of ₦2,000.00 per day starts 48 hours after the customer is told the vehicle is ready (terms clause 3).");
  assert.equal(logic.storageLine({ ...base.storage, running: true }), "Storage charge of ₦2,000.00 per day starts after 29 Nov 2026, 15:10 (terms clause 3).");
  assert.equal(
    logic.storageLine({ ...base.storage, days: 2, proposedAmount: "4000.00", running: true }),
    "Storage charge of ₦2,000.00 per day starts after 29 Nov 2026, 15:10 (terms clause 3). 2 days so far: ₦4,000.00 will be proposed on the invoice.",
  );
  assert.equal(logic.storageLine({ ...base.storage, days: 1, proposedAmount: "2000.00" }).endsWith("Counted to the invoice: 1 day, ₦2,000.00."), true);
  assert.equal(logic.storageLine(null), null);
});

test("differences carry their sign in the text, and money is never shown through floats", () => {
  assert.equal(logic.differenceText("8500.00"), "+₦8,500.00");
  assert.equal(logic.differenceText("-45000.00"), "-₦45,000.00");
  assert.equal(logic.differenceText("0.00"), "₦0.00");
  assert.equal(logic.differenceTone("8500.00"), "over");
  assert.equal(logic.differenceTone("-1.00"), "under");
  assert.equal(logic.differenceTone("0.00"), "same");
});

test("credit line, payment badges and the reasons on disabled buttons", () => {
  assert.equal(logic.creditLine({ by: "Funmi Oladele", role: "ServiceManager", at: "2026-11-27T14:30:00.000Z" }), "Credit approved by Funmi Oladele (Service manager), 27 Nov 2026, 15:30.");
  assert.deepEqual(plain(logic.PAYMENT_BADGE.UNPAID), { label: "Unpaid", tone: "amber" });
  assert.deepEqual(plain(logic.PAYMENT_BADGE.PAID), { label: "Paid", tone: "emerald" });
  const notReady = { ...base, status: "QC", invoice: null, paymentStatus: "NOT_INVOICED" };
  assert.equal(logic.invoiceBlockedReason(notReady), "Mark the vehicle ready before creating the invoice.");
  assert.equal(logic.invoiceBlockedReason({ ...notReady, status: "READY", draft: { total: null, advancePaid: "0.00", balanceDue: null, blockers: ["Record a passed quality check on the job card before billing"], storage: null } }), "Record a passed quality check on the job card before billing");
  assert.equal(logic.invoiceBlockedReason({ ...notReady, status: "READY", draft: { total: "1.00", advancePaid: "0.00", balanceDue: "1.00", blockers: [], storage: null } }), "Only billing staff can create the invoice.");
  assert.equal(logic.paymentBlockedReason({ ...notReady, status: "READY" }), "Create the invoice first.");
  assert.equal(logic.paymentBlockedReason({ ...base, invoice: { ...base.invoice, balanceDue: "0.00" } }), "The invoice is paid in full.");
  assert.equal(logic.paymentBlockedReason(base), null);
});

test("the notice and storage forms name the field and the fix", () => {
  assert.equal(logic.readyNoticeSchema.safeParse({ note: "" }).error.issues[0].message, "Choose how you told the customer: phone call or SMS.");
  assert.equal(logic.readyNoticeSchema.safeParse({ channel: "SMS", note: "x".repeat(501) }).error.issues[0].message, "Keep the note to 500 characters or fewer.");
  assert.equal(logic.storageDecisionSchema.safeParse({ reason: "" }).error.issues[0].message, "Accept the storage charge, or remove it with a reason.");
  assert.equal(logic.storageDecisionSchema.safeParse({ decision: "REMOVE", reason: " " }).error.issues[0].message, "Give the reason for removing the storage charge.");
  assert.equal(logic.storageDecisionSchema.safeParse({ decision: "ACCEPT", reason: "" }).success, true);
});

test("the Billing cards: notice, storage, washed, estimated and actual, invoice, warranty note", () => {
  const load = loader({ "next/link": { __esModule: true, default: (props) => React.createElement("a", { href: props.href, className: props.className }, props.children) } });
  const cards = load("features/job-cards/components/billing/BillingCards.tsx");
  const html = [
    renderToStaticMarkup(React.createElement(cards.CustomerNoticeCard, { step: base, readOnly: false, washPending: undefined, onSendAgain() {}, onWashed() {} })),
    renderToStaticMarkup(React.createElement(cards.ComparisonCard, { step: base })),
    renderToStaticMarkup(React.createElement(cards.InvoiceCard, { step: base, readOnly: false, onCreateInvoice() {}, onRecordPayment() {}, onApproveCredit() {} })),
  ].join("");
  for (const text of [
    "Customer notified", "SMS sent to 0803 555 0142 on 27 Nov 2026, 15:10", "Send again", "Earlier notices (1)", "starts after 29 Nov 2026, 15:10 (terms clause 3)",
    "Vehicle washed", "Estimated and actual", "Service charge", "₦141,500.00", "₦150,000.00", "+₦8,500.00", "Invoice 2026000201",
    "Customer total", "₦148,350.00", "Advance paid", "₦100,000.00", "Balance due", "₦48,350.00", "Unpaid", "Record payment", "View invoice",
    "Warranty claim of ₦528,000.00 will be sent by Ngozi Adeyemi.",
  ])
    assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /undefined|null|NaN|PHONE_CALL|SERVICE_CHARGE|NOT_INVOICED|UNPAID/);
  assert.doesNotMatch(html, /[–—]/);

  const credit = renderToStaticMarkup(
    React.createElement(cards.InvoiceCard, { step: { ...base, credit: { by: "Funmi Oladele", role: "ServiceManager", at: "2026-11-27T14:30:00.000Z" } }, readOnly: true }),
  );
  assert.ok(credit.includes("Credit approved by Funmi Oladele (Service manager), 27 Nov 2026, 15:30."));
  const ready = renderToStaticMarkup(
    React.createElement(cards.InvoiceCard, {
      step: { ...base, status: "QC", invoice: null, paymentStatus: "NOT_INVOICED", access: { ...base.access, canCreateInvoice: false } },
      readOnly: false,
      onCreateInvoice() {},
      onRecordPayment() {},
    }),
  );
  assert.match(ready, /<button[^>]*disabled=""[^>]*>.*Create invoice/);
  assert.ok(ready.includes("Mark the vehicle ready before creating the invoice."));
  assert.ok(ready.includes("The invoice amounts appear here once the vehicle is marked ready."));
  assert.doesNotMatch(ready, /Not provided/);
  assert.ok(ready.includes("Not invoiced"));
});

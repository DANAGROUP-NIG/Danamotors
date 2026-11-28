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

const load = loader();
const logic = load("features/job-cards/lib/job-print.logic.ts");
const plain = (value) => JSON.parse(JSON.stringify(value));
const NOT_PROVIDED = "Not provided";

const full = {
  company: { name: "Dana Motors Limited" },
  branch: { name: "Isolo", address: "12 Industrial Avenue, Isolo, Lagos", phone: null },
  job: {
    id: "job",
    number: "2026000127",
    openedAt: "2026-11-25T08:15:00.000Z",
    mileage: 48270,
    warranty: true,
    advisor: "Chidi Eze",
    promisedAt: "2026-11-28T15:00:00.000Z",
    deliveredAt: "2026-11-28T14:20:00.000Z",
    gatePassNumber: "GP-2026-001234",
  },
  customer: { name: "Ọlá Ògúnlẹ̀yẹ̀", phone: "0803 555 0142", address: "14 Admiralty Way, Lekki, Lagos" },
  vehicle: { make: "Kia", model: "Sportage", year: 2023, colour: "White", registration: "KJA 482 TX", vin: "KNAPU81BDP7234567", engineNumber: "G4NAK123456", soldBy: "Dana Motors Ltd", soldOn: "2023-03-15T00:00:00.000Z" },
  requests: ["General service (50,000 km)."],
  instructions: { advisor: ["Carry out 50,000 km periodic service."], supervisor: [] },
  damageMarks: [],
  fuelLevel: "HALF",
  checklist: [{ number: 1, code: "SERVICE_BOOK", label: "Service book", state: "PRESENT" }],
  checklistNote: null,
  findings: [{ text: "Brake noise due to worn front brake pads.", source: "Request 2" }],
  findingsConfirmed: { by: "Kelechi Nwosu", at: "2026-11-25T11:00:00.000Z" },
  roadworthy: { by: "Tunde Bakare", at: "2026-11-27T10:00:00.000Z" },
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
  signatures: [
    { key: "SERVICE_ADVISOR", title: "Service advisor", statement: null, name: "Chidi Eze", capacity: null, date: "2026-11-25T08:40:00.000Z", image: null, note: null },
    { key: "CUSTOMER_DELIVERY", title: "Customer delivery", statement: "I have taken delivery of the vehicle and I am satisfied with the repairs.", name: "  ", capacity: null, date: null, image: null, note: null },
  ],
  previousVisits: [{ jobNumber: "2026000981", date: "2026-06-10T09:00:00.000Z", mileage: 40000, work: "40,000 km service" }],
  terms: [{ number: 1, text: "Authorisation to carry out work." }],
  termsFooter: null,
  printedAt: "2026-11-28T14:25:00.000Z",
};

/** The same job with nothing recorded beyond the job number. */
const empty = {
  ...full,
  branch: { name: "Isolo", address: null, phone: null },
  job: { ...full.job, mileage: null, advisor: null, promisedAt: null, deliveredAt: null, gatePassNumber: null },
  customer: null,
  vehicle: null,
  fuelLevel: null,
  comparison: { rows: null, problem: "Nothing to compare yet." },
  signatures: [],
  previousVisits: [],
  findingsConfirmed: null,
};

test("the top boxes, customer and vehicle print the stored values with Lagos dates and km", () => {
  assert.deepEqual(plain(logic.headlineRows(full).map((row) => row.value)), ["2026000127", "Chidi Eze", "48,270 km", "25 Nov 2026"]);
  assert.equal(logic.customerRows(full)[0].value, "Ọlá Ògúnlẹ̀yẹ̀");
  assert.deepEqual(plain(logic.vehicleRows(full)), [
    { label: "Model", value: "Kia Sportage 2023" },
    { label: "Reg. no.", value: "KJA 482 TX" },
    { label: "VIN", value: "KNAPU81BDP7234567" },
    { label: "Engine no.", value: "G4NAK123456" },
    { label: "Sold by", value: "Dana Motors Ltd" },
    { label: "Sold on", value: "15 Mar 2023" },
  ]);
});

test("missing values print the shared fallback, never null, undefined or NaN", () => {
  const values = [
    ...logic.headlineRows(empty),
    ...logic.customerRows(empty),
    ...logic.vehicleRows(empty),
  ].map((row) => row.value);
  // Only the job number and the opened date are recorded on the empty job.
  assert.deepEqual(values.filter((value) => value !== NOT_PROVIDED), ["2026000127", "25 Nov 2026"]);
  assert.equal(logic.fuelView(null).label, NOT_PROVIDED);
  assert.equal(logic.fuelView(null).angle, null);
  for (const row of logic.comparisonRows(empty)) {
    assert.equal(row.estimated, NOT_PROVIDED);
    assert.equal(row.actual, NOT_PROVIDED);
  }
  assert.deepEqual(plain(logic.visitLines(empty)), [
    { label: "Last visit", text: "No earlier visit recorded" },
    { label: "Second last visit", text: "No earlier visit recorded" },
  ]);
  assert.equal(logic.modelText({ make: " ", model: null, year: null }), NOT_PROVIDED);
  const printed = JSON.stringify([logic.headlineRows(empty), logic.vehicleRows(empty), logic.comparisonRows(empty), logic.signedLine("Confirmed by", { by: null, at: "2026-11-25T11:00:00.000Z" })]);
  assert.doesNotMatch(printed, /undefined|null|NaN|\?/);
});

test("estimated and actual: promised against delivered, then naira amounts with the total last", () => {
  assert.deepEqual(plain(logic.comparisonRows(full)), [
    { label: "Delivery date", estimated: "28 Nov 2026", actual: "28 Nov 2026", total: false },
    { label: "Delivery time", estimated: "16:00", actual: "15:20", total: false },
    { label: "Parts", estimated: "₦57,000.00", actual: "₦65,500.00", total: false },
    { label: "Oil", estimated: "₦38,000.00", actual: "₦38,000.00", total: false },
    { label: "Labour", estimated: "₦40,000.00", actual: "₦40,000.00", total: false },
    { label: "Service charges", estimated: "₦6,500.00", actual: "₦6,500.00", total: false },
    { label: "Total", estimated: "₦141,500.00", actual: "₦150,000.00", total: true },
  ]);
});

test("fuel gauge, checklist marks, signatures, visits and the footer lines", () => {
  assert.deepEqual(plain(logic.fuelView("HALF")), { label: "Half (1/2)", angle: 0 });
  assert.deepEqual(plain(logic.fuelView("FULL")), { label: "Full", angle: 90 });
  assert.deepEqual(plain(logic.checklistMark("PRESENT")), { ticked: true, word: null });
  assert.deepEqual(plain(logic.checklistMark("MISSING")), { ticked: false, word: "Missing" });
  assert.deepEqual(plain(logic.checklistMark("NOT_WORKING")), { ticked: false, word: "Not working" });
  assert.deepEqual(plain(logic.checklistMark(null)), { ticked: false, word: null });
  const [advisor, delivery] = logic.signatureViews(full);
  assert.equal(advisor.date, "25 Nov 2026");
  assert.equal(advisor.name, "Chidi Eze");
  // Nothing captured: blank lines, not a fallback word, so staff can sign by hand.
  assert.equal(delivery.name, null);
  assert.equal(delivery.date, null);
  assert.deepEqual(plain(logic.visitLines(full)), [
    { label: "Last visit", text: "10 Jun 2026, job 2026000981, 40,000 km, 40,000 km service" },
    { label: "Second last visit", text: "No earlier visit recorded" },
  ]);
  assert.equal(logic.signedLine("Confirmed by", full.findingsConfirmed), "Confirmed by Kelechi Nwosu, 25 Nov 2026.");
  assert.equal(logic.signedLine("Certified roadworthy by", null), null);
  assert.equal(logic.branchLine(full.branch), "Isolo, 12 Industrial Avenue, Isolo, Lagos");
  assert.equal(logic.printedLine(full.printedAt), "Printed 28 Nov 2026, 15:25, Lagos time");
});

test("gate pass rows, with the VIN when there is no plate and fallbacks for the rest", () => {
  const pass = {
    company: { name: "Dana Motors Limited" },
    branch: { name: "Isolo" },
    jobNumber: "2026000127",
    gatePassNumber: "GP-2026-001234",
    registration: "KJA 482 TX",
    vin: "KNAPU81BDP7234567",
    vehicle: { make: "Kia", model: "Sportage", year: 2023, colour: "White" },
    customer: "Ọlá Ògúnlẹ̀yẹ̀",
    collectedBy: "Ọlá Ògúnlẹ̀yẹ̀",
    deliveredBy: "Chidi Eze",
    deliveredAt: "2026-11-28T14:20:00.000Z",
    printedAt: "2026-11-28T14:25:00.000Z",
  };
  assert.deepEqual(plain(logic.gatePassRows(pass).map((row) => row.value)), [
    "2026000127", "GP-2026-001234", "KJA 482 TX", "Kia Sportage 2023", "Ọlá Ògúnlẹ̀yẹ̀", "Ọlá Ògúnlẹ̀yẹ̀", "Chidi Eze", "28 Nov 2026, 15:20",
  ]);
  const bare = { ...pass, registration: null, vehicle: null, customer: null, collectedBy: null, deliveredBy: null, deliveredAt: null };
  assert.deepEqual(plain(logic.gatePassRows(bare).map((row) => row.value)), [
    "2026000127", "GP-2026-001234", "KNAPU81BDP7234567", NOT_PROVIDED, NOT_PROVIDED, NOT_PROVIDED, NOT_PROVIDED, NOT_PROVIDED,
  ]);
});

test("the printed job card and slip render every section, with fallbacks and blank lines instead of raw values", () => {
  const image = { __esModule: true, default: (props) => React.createElement("img", { src: props.src, alt: props.alt }) };
  const view = loader({ "next/image": image });
  const { JobCardPrint } = view("features/job-cards/components/print/JobCardPrint.tsx");
  const { GatePassSlip } = view("features/job-cards/components/print/GatePassSlip.tsx");
  const visible = (html) => html.replace(/<[^>]+>/g, " ");

  const filled = renderToStaticMarkup(React.createElement(JobCardPrint, { data: full }));
  for (const text of ["Job card", "Customer details", "Vehicle details", "Customer requests", "Instructions to technician", "Body and paint damage", "Fuel level", "Service checklist", "Cause and nature of defect", "Estimated and actual", "Vehicle history", "Terms and conditions", "Ọlá Ògúnlẹ̀yẹ̀", "₦141,500.00", "Half (1/2)"])
    assert.ok(visible(filled).includes(text), `missing ${text}`);

  const bare = { ...empty, signatures: full.signatures.map((box) => ({ ...box, name: null, date: null, image: null })), terms: [] };
  const html = renderToStaticMarkup(React.createElement(JobCardPrint, { data: bare }));
  const text = visible(html);
  assert.match(text, /Not provided/);
  assert.match(text, /No job card terms are set for this branch\./);
  assert.match(html, /aria-label="Date not recorded"/);
  assert.doesNotMatch(text, /\b(undefined|null|NaN)\b|[–—]|\s\?\s/);

  const slip = renderToStaticMarkup(
    React.createElement(GatePassSlip, {
      data: { company: { name: "Dana Motors Limited" }, branch: { name: "Isolo" }, jobNumber: "2026000127", gatePassNumber: "GP-2026-001234", registration: null, vin: null, vehicle: null, customer: null, collectedBy: null, deliveredBy: null, deliveredAt: null, printedAt: full.printedAt },
    }),
  );
  assert.match(visible(slip), /Security signature:/);
  assert.doesNotMatch(visible(slip), /\b(undefined|null|NaN)\b/);
});

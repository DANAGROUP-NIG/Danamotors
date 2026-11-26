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
const logic = load("features/job-cards/lib/warranty-check.logic.ts");
const checkIn = load("features/job-cards/lib/check-in.logic.ts");
const frame = load("features/job-cards/lib/job-frame.logic.ts");
const plain = (value) => JSON.parse(JSON.stringify(value));

const span = (days, months, extraDays) => ({ days, months, extraDays });
const coverage = (overrides = {}) => ({
  status: "ACTIVE", source: "MODEL", startDate: "2023-03-14", expiresOn: "2028-03-12", warrantyDays: 1825, kmLimit: 100000,
  mileage: 48250, remainingDays: 500, remainingKm: 51750, daysUsedPercent: 74, kmUsedPercent: 48, reasonText: [], atOpening: "ACTIVE",
  ...overrides,
});

test("gaps read in months and weeks, as on the design", () => {
  assert.equal(logic.formatSpan(span(138, 4, 15)), "4 months 2 weeks");
  assert.equal(logic.formatSpan(span(92, 3, 0)), "3 months");
  assert.equal(logic.formatSpan(span(95, 3, 3)), "3 months 3 days");
  assert.equal(logic.formatSpan(span(20, 0, 20)), "20 days");
  assert.equal(logic.formatSpan(span(1, 0, 1)), "1 day");
});

test("coverage card: sold and expiry line, time and distance bars", () => {
  const view = logic.coverageView(coverage(), "2026-11-26");
  assert.equal(view.soldLine, "Sold 14 Mar 2023. Expires 12 Mar 2028.");
  assert.deepEqual(plain(view.badge), { label: "Active", tone: "emerald" });
  assert.deepEqual(plain(view.time), { label: "Time used: 3 years 8 months of 5 years", percent: 74 });
  assert.deepEqual(plain(view.distance), { label: "Distance: 48,250 of 100,000 km", percent: 48 });
  const missing = logic.coverageView(coverage({ status: "UNKNOWN", startDate: null, expiresOn: null, daysUsedPercent: null }), "2026-11-26");
  assert.equal(missing.soldLine, "No sale date is recorded for this vehicle.");
  assert.equal(missing.time, null);
  assert.deepEqual(plain(missing.badge), { label: "Cannot confirm", tone: "amber" });
});

test("service history badge, rule and year headings", () => {
  assert.deepEqual(plain(logic.verdictBadge({ kind: "IRREGULAR", missedCount: 1, years: [2], where: [] })), { label: "1 missed service", tone: "amber" });
  assert.deepEqual(plain(logic.verdictBadge({ kind: "IRREGULAR", missedCount: 3, years: [1, 2], where: [] })), { label: "3 missed services", tone: "amber" });
  assert.deepEqual(plain(logic.verdictBadge({ kind: "REGULAR" })), { label: "Regular", tone: "emerald" });
  assert.deepEqual(plain(logic.verdictBadge({ kind: "INSUFFICIENT_DATA", missing: ["NO_SALE_DATE"] })), { label: "Cannot check", tone: "gray" });
  const rule = { intervalMonths: 3, intervalKm: 5000, servicesPerYear: 4, graceKm: 0, graceDays: 0 };
  assert.equal(logic.ruleSentence(rule), "Service at least every 3 months or 5,000 km, whichever comes first.");
  assert.equal(logic.ruleSentence({ ...rule, graceDays: 7, graceKm: 500 }), "Service at least every 3 months or 5,000 km, whichever comes first. Grace: 7 days and 500 km.");
  assert.deepEqual(plain(logic.yearHeading({ year: 2, start: "2024-03-14", end: "2025-03-13", current: false, missedCount: 1, periods: [] })), {
    title: "Year 2",
    range: "Mar 2024 to Mar 2025",
  });
  assert.equal(logic.yearHeading({ year: 4, start: "2026-03-14", end: "2027-03-13", current: true, missedCount: 0, periods: [] }).title, "Year 4 (current)");
  assert.equal(logic.periodLabel(2, 4), "Q2");
  assert.equal(logic.periodLabel(2, 2), "P2");
});

test("period blocks say the date, km and status in words", () => {
  const service = { id: "s", date: "2024-11-29", mileage: 30100, source: "JOB", label: "2026000101", sinceLast: span(92, 3, 1), kmSinceLast: 6300 };
  const missed = { year: 2, period: 2, dueOn: "2024-07-11", reason: "TIME", fromDate: "2024-04-11", fromSale: false, toDate: "2024-11-29", gap: span(232, 7, 18), kmGap: 6300 };
  const onTime = { period: 3, start: "2024-09-14", end: "2024-12-13", status: "ON_TIME", services: [service], missed: [], dueOn: null };
  assert.deepEqual(plain(logic.periodLines(onTime)), { date: "29 Nov 2024", detail: "6,300 km since last service" });
  const gap = { period: 2, start: "2024-06-14", end: "2024-09-13", status: "MISSED", services: [], missed: [missed], dueOn: null };
  assert.deepEqual(plain(logic.periodLines(gap)), { date: null, detail: "7 months 2 weeks and 6,300 km since the last service" });
  assert.equal(logic.periodAria(2, gap, 4), "Year 2, quarter 2: Missed. 7 months 2 weeks and 6,300 km since the last service");
  const open = { ...missed, toDate: null, fromSale: true };
  assert.equal(logic.missedDetail(open), "No service for 7 months 2 weeks and 6,300 km since the sale, by this visit");
  const outside = { ...onTime, services: [{ ...service, source: "OUTSIDE", label: "Kia Ikeja" }] };
  assert.equal(logic.periodLines(outside).detail, "6,300 km since last service, at Kia Ikeja");
  const upcoming = { period: 4, start: "2026-12-14", end: "2027-03-13", status: "UPCOMING", services: [], missed: [], dueOn: "2027-01-10" };
  assert.deepEqual(plain(logic.periodLines(upcoming)), { date: "Due 10 Jan 2027", detail: null });
  assert.deepEqual(plain(logic.PERIOD_STATUS.NOT_DUE), { label: "No service due", tone: "gray" });
});

test("a payer that cannot be chosen says why", () => {
  const check = { coverage: coverage(), warrantyCase: null, campaigns: [] };
  assert.equal(logic.payerBlock("WARRANTY", { kind: "PART", partWarrantyApplicable: false }, check), "This part cannot be claimed under warranty.");
  assert.equal(logic.payerBlock("WARRANTY", { kind: "LABOUR", partWarrantyApplicable: null }, check), null);
  assert.equal(
    logic.payerBlock("WARRANTY", { kind: "PART", partWarrantyApplicable: true }, { ...check, coverage: coverage({ atOpening: "EXPIRED_DATE" }) }),
    "Not in warranty when the job opened. Open a warranty case from the Warranty menu first, or choose goodwill.",
  );
  assert.equal(logic.payerBlock("WARRANTY", { kind: "PART", partWarrantyApplicable: true }, { ...check, coverage: coverage({ atOpening: "UNKNOWN" }), warrantyCase: { id: "c" } }), null);
  assert.equal(logic.payerBlock("CAMPAIGN", { kind: "LABOUR", partWarrantyApplicable: null }, check), "No campaign is linked to this job.");
  assert.equal(logic.payerBlock("CAMPAIGN", { kind: "LABOUR", partWarrantyApplicable: null }, { ...check, campaigns: [{ id: "c1" }] }), null);
  assert.equal(logic.payerBlock("GOODWILL", { kind: "PART", partWarrantyApplicable: false }, check), null);
  assert.equal(logic.defaultCampaign([{ id: "c1" }]), "c1");
  assert.equal(logic.defaultCampaign([{ id: "c1" }, { id: "c2" }]), null);
  assert.equal(logic.decidedCount([{ payer: "CUSTOMER" }, { payer: null }]).label, "1 of 2 decided");
  assert.equal(logic.handoffNote("Chidi Eze"), "Chidi Eze will prepare the estimate.");
  assert.equal(logic.handoffNote(null), "The service advisor will prepare the estimate.");
});

test("outside record form names each field and the fix", () => {
  const empty = { serviceDate: "", mileage: "", dealerName: "", note: "", image: null };
  assert.deepEqual(plain(logic.outsideRecordProblems(empty, "2026-11-26", "2025-04-05")), {
    serviceDate: "Enter the service date",
    mileage: "Enter the km reading from the service book",
    dealerName: "Enter the dealer that did the service",
    image: "Add a photo of the stamped service book page",
  });
  const good = { serviceDate: "2026-08-20", mileage: "23,800", dealerName: "Kia Ikeja", note: "", image: "data:image/jpeg;base64,AA" };
  assert.deepEqual(plain(logic.outsideRecordProblems(good, "2026-11-26", "2025-04-05")), {});
  assert.equal(logic.outsideRecordProblems({ ...good, serviceDate: "2026-11-27" }, "2026-11-26", null).serviceDate, "The service date cannot be in the future");
  assert.equal(logic.outsideRecordProblems({ ...good, serviceDate: "2025-01-01" }, "2026-11-26", "2025-04-05").serviceDate, "The service date is before the vehicle was sold");
  assert.equal(logic.outsideRecordProblems({ ...good, mileage: "23.5" }, "2026-11-26", null).mileage, "Enter the km reading as a whole number");
  assert.equal(logic.lagosToday(new Date("2026-11-26T23:30:00Z")), "2026-11-27");
});

test("check-in warns about missed services on a vehicle in warranty", () => {
  const irregular = { verdict: "IRREGULAR", sentence: "Service history has 1 missed service in warranty year 2." };
  const notes = checkIn.detailsAlerts({ isRepeat: false, warrantyStatusAtCreation: "ACTIVE", campaigns: [] }, null, irregular);
  assert.equal(notes[1].message, "Service history has 1 missed service in warranty year 2. Warranty items will need the warranty officer's review.");
  const regular = checkIn.detailsAlerts({ isRepeat: false, warrantyStatusAtCreation: "ACTIVE", campaigns: [] }, null, { verdict: "REGULAR", sentence: "Service history is regular. No missed services." });
  assert.equal(regular[1].message, "This vehicle is under warranty. Warranty items will need the warranty officer's review.");
  assert.equal(logic.serviceHistoryAlert(irregular, false), null);
});

test("a skipped warranty check still opens its read-only view from the stepper", () => {
  const steps = frame.stepperView({
    stage: "ESTIMATE",
    summaries: [
      { stage: "CHECK_IN", state: "COMPLETED", by: "Chidi Eze", at: "2026-11-25T09:40:00Z", reason: null },
      { stage: "DIAGNOSIS", state: "COMPLETED", by: "Kelechi Nwosu", at: "2026-11-25T11:00:00Z", reason: null },
      { stage: "WARRANTY", state: "SKIPPED", by: "Kelechi Nwosu", at: "2026-11-25T11:00:00Z", reason: "Not under warranty" },
    ],
  });
  const warranty = steps.find((step) => step.stage === "WARRANTY");
  assert.equal(warranty.state, "skipped");
  assert.equal(warranty.opensSummary, true);
  assert.equal(warranty.caption, "Skipped");
});

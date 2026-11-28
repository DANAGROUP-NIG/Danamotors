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
    vm.runInNewContext(source, { module, exports: module.exports, require: resolve, crypto: globalThis.crypto, URLSearchParams, Intl }, { filename: resolved });
    return module.exports;
  }
  return load;
}



const load = loader({ "next/link": { __esModule: true, default: (props) => React.createElement("a", { ...props, href: props.href }, props.children) } });
const logic = load("features/job-cards/lib/board.logic.ts");
const format = load("lib/format.ts");
const plain = (value) => JSON.parse(JSON.stringify(value));
const params = (query) => new URLSearchParams(query);
const now = new Date("2026-11-27T14:00:00.000Z"); // 15:00 in Lagos
const branch = "6f1c2d4e-1111-4a2b-9c3d-000000000001";
const advisor = "6f1c2d4e-1111-4a2b-9c3d-000000000002";

test("timing tone: normal within the target, amber over it, red over twice it, never without a target", () => {
  assert.equal(logic.timingTone(30, 30), "normal");
  assert.equal(logic.timingTone(31, 30), "amber");
  assert.equal(logic.timingTone(60, 30), "amber");
  assert.equal(logic.timingTone(61, 30), "red");
  assert.equal(logic.timingTone(900, null), "normal");
  assert.equal(logic.timingStateText("amber", 120), "Over target");
  assert.equal(logic.timingStateText("red", 120), "Far over target");
  assert.equal(logic.timingStateText("normal", 120), "Within target");
  assert.equal(logic.timingStateText("normal", null), null);
});

test("durations, targets and the promised time in Lagos", () => {
  assert.equal(logic.durationText(35), "35 min");
  assert.equal(logic.durationText(130), "2 h 10 min");
  assert.equal(logic.durationText(120), "2 h");
  assert.equal(logic.durationText(1500), "1 day 1 h");
  assert.equal(logic.durationText(2880), "2 days");
  assert.equal(logic.targetText(30), "Target 30 min");
  assert.equal(logic.targetText(null), null);
  assert.equal(logic.minutesSince("2026-11-27T11:50:00.000Z", now), 130);
  assert.equal(logic.minutesSince("2026-11-27T15:00:00.000Z", now), 0);
  assert.equal(logic.promisedText("2026-11-27T15:00:00.000Z", now), "Promised: Today, 16:00");
  assert.equal(logic.promisedText("2026-11-28T08:30:00.000Z", now), "Promised: Tomorrow, 09:30");
  assert.equal(logic.promisedText("2026-11-26T16:00:00.000Z", now), "Promised: Yesterday, 17:00");
  assert.equal(logic.promisedText("2026-11-30T09:00:00.000Z", now), "Promised: 30 Nov 2026, 10:00");
  assert.equal(logic.promisedText(null, now), "Promised: Not provided");
  assert.equal(logic.isOverdue("IN_REPAIR", "2026-11-27T13:59:00.000Z", now), true);
  assert.equal(logic.isOverdue("READY", "2026-11-27T13:59:00.000Z", now), false);
  assert.equal(logic.isOverdue("IN_REPAIR", null, now), false);
  assert.equal(format.lagosDayKey(new Date("2026-11-27T23:30:00.000Z")), "2026-11-28");
});

test("owner wording and initials", () => {
  assert.equal(logic.shortName("Musa Abdullahi"), "Musa A.");
  assert.equal(logic.initials("Musa Abdullahi"), "MA");
  assert.equal(logic.ownerName({ name: "Musa Abdullahi", role: "Technician" }), "Musa A.");
  assert.equal(logic.ownerName({ name: null, role: "WarrantyOfficer" }), "Warranty officer");
  assert.equal(logic.ownerName(null), "Not assigned");
  assert.equal(logic.listOwnerText({ stage: "REPAIR", stageOwner: { id: "u", firstName: "Musa", lastName: "Abdullahi" }, stageOwnerRole: "Technician" }), "Musa Abdullahi");
  assert.equal(logic.listOwnerText({ stage: "WARRANTY", stageOwner: null, stageOwnerRole: "WarrantyOfficer" }), "Warranty officer");
  assert.equal(logic.listOwnerText({ stage: "CLOSED", stageOwner: null, stageOwnerRole: null }), "No one, job delivered");
  assert.equal(logic.listOwnerText({ stage: "REPAIR", stageOwner: null, stageOwnerRole: null }), "Not provided");
});

test("filters in the address bar: valid values kept, others dropped, view defaults by role", () => {
  assert.equal(logic.defaultView("WorkshopManager"), "board");
  assert.equal(logic.defaultView("ServiceManager"), "board");
  assert.equal(logic.defaultView("ServiceAdviser"), "table");
  assert.equal(logic.defaultView(undefined), "table");
  const read = logic.readBoardFilters(params(`branch=${branch}&advisor=${advisor}&technician=musa&date=2026-11-27&column=WAITING_PARTS`), "board");
  assert.deepEqual(plain(read), { view: "board", branchId: branch, advisorId: advisor, date: "2026-11-27", column: "WAITING_PARTS" });
  assert.equal(logic.readBoardFilters(params("view=table&column=OPEN"), "board").view, "table");
  assert.equal(logic.readBoardFilters(params("view=table&column=OPEN"), "board").column, undefined);
  assert.equal(logic.boardSearch(read), `view=board&branch=${branch}&advisor=${advisor}&date=2026-11-27&column=WAITING_PARTS`);
  assert.equal(logic.boardSearch({ view: "table" }), "view=table");
  assert.equal(logic.boardApiQuery(read, branch), `branchId=${branch}&advisorId=${advisor}&date=2026-11-27`);
});

test("Show all in table limits the job list to that column", () => {
  assert.deepEqual(plain(logic.columnListFilter("CHECK_IN")), { stage: "CHECK_IN" });
  assert.deepEqual(plain(logic.columnListFilter("AWAITING_APPROVAL")), { stage: "ESTIMATE" });
  assert.deepEqual(plain(logic.columnListFilter("IN_REPAIR")), { stage: "REPAIR", status: "IN_PROGRESS" });
  assert.deepEqual(plain(logic.columnListFilter("WAITING_PARTS")), { stage: "REPAIR", status: "WAITING_PARTS" });
  assert.deepEqual(plain(logic.columnListFilter("READY")), { stage: "BILLING,DELIVERY" });
  assert.equal(logic.cappedText(50, 63), "Showing 50 of 63, longest waiting first.");
  assert.equal(logic.cappedText(12, 12), null);
});

test("a card is one link with the timing in words, the tags and no raw codes", () => {
  const { BoardCard } = load("features/job-cards/components/board/BoardCard.tsx");
  const card = {
    id: "job-1", jobNumber: "2026000071", stage: "DIAGNOSIS", status: "OPEN", plate: "KJA 482 TX", model: "Kia Sportage",
    customer: "Adaeze Okafor", owner: { name: "Musa Abdullahi", role: "Technician" }, enteredAt: "2026-11-27T11:50:00.000Z",
    promisedAt: "2026-11-27T13:00:00.000Z", warranty: true, repeat: "CONFIRMED",
  };
  const html = renderToStaticMarkup(React.createElement(BoardCard, { card, column: "DIAGNOSIS", targetMinutes: 60, now }));
  for (const text of ["KJA 482 TX", "Kia Sportage", "Adaeze Okafor", "With: Musa A.", ">MA<", "2 h 10 min", "far over target", "Promised: Today, 14:00", "Promised time passed", "Warranty", "Repeat", 'href="/job-cards/job-1"'])
    assert.ok(html.includes(text), text);
  assert.match(html, /aria-label="Job 2026000071, KJA 482 TX, Kia Sportage, Adaeze Okafor, Diagnosis, with Musa A\., 2 h 10 min in this step, far over target, Promised: Today, 14:00, promised time passed"/);
  const bare = renderToStaticMarkup(
    React.createElement(BoardCard, { card: { ...card, plate: null, model: null, customer: null, owner: null, promisedAt: null, warranty: false, repeat: "NOT_REPEAT" }, column: "IN_REPAIR", targetMinutes: null, now }),
  );
  for (const text of ["Not provided", "Model not provided", "Customer not provided", "With: Not assigned", "Promised: Not provided"]) assert.ok(bare.includes(text), text);
  for (const html2 of [html, bare])
    for (const bad of ["DIAGNOSIS<", "IN_REPAIR", "NOT_REPEAT", "undefined", "null", "NaN", "—", "–", ">?<"]) assert.ok(!html2.replace(/aria-label="[^"]*"/g, "").includes(bad), bad);
  assert.ok(!bare.includes("Not a repeat"));
  assert.ok(!bare.includes("over target"));
});

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
const logic = load("features/job-cards/lib/estimate.logic.ts");
const plain = (value) => JSON.parse(JSON.stringify(value));
const fixtures = JSON.parse(fs.readFileSync(path.resolve(root, "../server/src/modules/service/estimate-totals.fixtures.json"), "utf8"));

for (const row of fixtures.cases) {
  test(`totals match the server: ${row.name}`, () => {
    assert.deepEqual(plain(logic.estimateTotals(row.lines, row.vatRate)), row.expected);
    const payable = row.lines.some((line) => "customerDecision" in line) ? row.expected.approvedTotal : row.expected.customerTotal;
    assert.equal(logic.suggestedAdvance(payable, row.advance.percent), row.advance.amount);
  });
}

const line = (id, payer, amount, extra = {}) => ({ id, type: "PART", kind: "PART", includedInService: false, referenceId: id, description: `Item ${id}`, quantity: "1.00", rate: amount, amount, payer, customerDecision: null, findingItemId: null, complaintId: null, ...extra });

test("the live total drops by the declined item and its VAT", () => {
  const lines = [line("a", "CUSTOMER", "129500.00"), line("b", "CUSTOMER", "12000.00"), line("w", "WARRANTY", "528000.00")];
  const decisions = logic.initialDecisions(lines);
  assert.deepEqual(plain(decisions), { a: "APPROVED", b: "APPROVED" });
  assert.equal(logic.liveApproval(lines, decisions, "7.50").total, "152112.50");
  const live = logic.liveApproval(lines, { ...decisions, b: "DECLINED" }, "7.50");
  assert.equal(live.total, "139212.50");
  assert.equal(live.approvedCount, 1);
  assert.equal(live.allDeclined, false);
  const none = [line("a", "CUSTOMER", "100.00")];
  assert.equal(logic.liveApproval(none, { a: "DECLINED" }, "7.50").allDeclined, true);
});

test("money strings convert without float drift", () => {
  assert.equal(logic.toKobo("0.10") + logic.toKobo("0.20"), 30);
  assert.equal(logic.fromKobo(30), "0.30");
  assert.equal(logic.toKobo("1061728396.15"), 106172839615);
  assert.equal(logic.draftAmount({ quantity: "4.5", rate: "8444.45" }), "38000.03");
  assert.equal(logic.draftAmount({ quantity: "0", rate: "10.00" }), null);
});

test("sections by payer and the customer's groups by request", () => {
  const lines = [line("a", "CUSTOMER", "10.00", { complaintId: "r1" }), line("w", "WARRANTY", "5.00"), line("x", "CUSTOMER", "1.00")];
  assert.deepEqual(plain(logic.payerSections(lines).map((section) => [section.title, section.lines.length])), [
    ["Customer pays", 2],
    ["Warranty (not charged to customer)", 1],
  ]);
  assert.deepEqual(plain(logic.payerSections([]).map((section) => section.title)), ["Customer pays"]);
  const groups = logic.customerGroups(lines, [{ id: "r1", number: 1, description: "Brake noise" }]);
  assert.deepEqual(plain(groups.map((group) => [group.title, group.lines.length])), [["Brake noise", 1], ["Other recommended work", 1]]);
  assert.equal(logic.noChargeNote(lines), "Covered by warranty: Item w. No charge to you.");
  assert.equal(logic.noChargeNote([lines[0]]), null);
  const service = line("s", "CUSTOMER", "0.00", { kind: "SERVICE", type: "SERVICE" });
  assert.deepEqual(plain(logic.customerGroups([service, ...lines], []).map((group) => group.title)), ["Service", "Other recommended work"]);
});

test("the step tab follows the estimate", () => {
  assert.equal(logic.currentTab({ estimate: null }), "PREPARE");
  assert.equal(logic.currentTab({ estimate: { presentedAt: null, approval: null } }), "PREPARE");
  assert.equal(logic.currentTab({ estimate: { presentedAt: "2026-11-25T10:00:00Z", approval: null } }), "APPROVAL");
  assert.equal(logic.currentTab({ estimate: { presentedAt: null, approval: {} } }), "ADVANCE");
  assert.equal(logic.estimateTitle({ version: 1, approval: null, presentedAt: null, outcome: null }), "Estimate, revision 1, draft");
  assert.equal(logic.estimateTitle({ version: 2, approval: {}, presentedAt: "x", outcome: "PARTIAL" }), "Estimate, revision 2, partly approved");
});

test("form checks name the field and the fix", () => {
  assert.equal(logic.quantityProblem(""), "Enter the quantity");
  assert.equal(logic.quantityProblem("1.005"), "Enter the quantity as a number with at most 2 decimal places");
  assert.equal(logic.quantityProblem("0"), "Quantity must be more than 0");
  assert.equal(logic.percentProblem("101"), "The advance percentage must be between 0 and 100");
  assert.equal(logic.percentProblem("abc"), "Enter the advance percentage as a number, for example 60");
  assert.equal(logic.phoneProblem("0803 555 0142"), null);
  assert.equal(logic.phoneProblem("12345"), "Enter a Nigerian mobile number, for example 0803 555 0142");
  const now = new Date("2026-11-25T11:00:00+01:00");
  const problems = logic.phoneFormProblems({ approverName: " ", approverPhone: "", approvedAt: "2026-11-25T12:00", approvedLineIds: [], note: "" }, now, "2026-11-25T09:00:00+01:00");
  assert.deepEqual(plain(problems), {
    approverName: "Enter who approved on the phone",
    approverPhone: "Enter the phone number",
    approvedAt: "The date and time of the call cannot be in the future",
  });
  assert.equal(
    logic.phoneFormProblems({ approverName: "A", approverPhone: "08035550142", approvedAt: "2026-11-25T08:00", approvedLineIds: [], note: "" }, now, "2026-11-25T09:00:00+01:00").approvedAt,
    "The call must be after the estimate was prepared",
  );
  assert.equal(logic.dateToLagosLocal(new Date("2026-11-25T09:36:00Z")), "2026-11-25T10:36");
  assert.deepEqual(plain(logic.signFormProblems({ signer: "REPRESENTATIVE", name: "", phone: "", signature: null, accepted: false })), {
    name: "Enter the representative's name",
    phone: "Enter the representative's phone number",
    signature: "Ask the customer to sign in the box",
    accepted: "The customer must accept the estimate terms",
  });
  assert.equal(logic.waiverReasonProblem("no"), "Write the reason for the waiver (at least 5 characters)");
});

test("the release reason names the cashier", () => {
  assert.equal(logic.advanceMissingReason(["Bisi Lawal"]), "Ask the cashier to record the advance. Cashier on duty: Bisi Lawal.");
  assert.equal(logic.advanceMissingReason([]), "Ask the cashier to record the advance. Nobody in this branch can record receipts yet.");
});

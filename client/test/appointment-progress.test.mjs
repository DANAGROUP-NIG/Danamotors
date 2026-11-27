import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(file, resolve) {
  const exports = {};
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });
  new Function("exports", "require", outputText)(exports, resolve);
  return exports;
}

const jobStatuses = load("../features/job-cards/types/job-card-status.ts");
const { getAppointmentProgress } = load(
  "../features/appointments/lib/appointment-progress.ts",
  () => jobStatuses,
);

const job = (status, stage) => ({
  status,
  serviceWorkflow: stage ? { stage } : null,
});
const progress = (...jobCards) =>
  getAppointmentProgress({
    status: "Checked In",
    jobCards,
  });

test("tracks linked job stages through delivery, including quality check rework", () => {
  assert.equal(progress(), "Inspection");
  assert.equal(progress(job("OPEN", "TECHNICIAN_ASSIGNED")), "Inspection");
  assert.equal(progress(job("OPEN", "ESTIMATE_PREPARED")), "Awaiting Approval");
  assert.equal(progress(job("OPEN", "PARTS_REQUESTED")), "In Repair");
  assert.equal(progress(job("QC", "AWAITING_QC")), "Quality Check");
  assert.equal(progress(job("QC", "REWORK")), "In Repair");
  assert.equal(progress(job("READY", "READY_FOR_BILLING")), "Ready");
  assert.equal(progress(job("BILLED", "BILLED")), "Ready");
  assert.equal(progress(job("DELIVERED", "BILLED")), "Completed");
});

test("supports legacy statuses and waits for all non-cancelled linked work", () => {
  assert.equal(progress(job("Quality Check")), "Quality Check");
  assert.equal(progress(job("Closed"), job("In Progress")), "In Repair");
  assert.equal(progress(job("Closed"), job("Cancelled")), "Completed");
  assert.equal(progress(job("Cancelled")), "Linked jobs cancelled");
  assert.equal(
    getAppointmentProgress({
      status: "No Show",
      jobCards: [job("Closed")],
    }),
    "No Show",
  );
});

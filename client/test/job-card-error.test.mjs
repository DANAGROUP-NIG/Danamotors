import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const module = { exports: {} };
const source = fs.readFileSync(
  new URL("../features/job-cards/schemas/job-card-error.ts", import.meta.url),
  "utf8",
);
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText,
  { module, exports: module.exports },
);
const { jobCardErrorField } = module.exports;

test("maps wrapped and direct API paths to job-opening fields", () => {
  for (const [path, expected] of [
    ["body.complaints.0.description", "complaints.0.description"],
    ["complaints.1.spare", "complaints.1.spare"],
    ["body.promisedAt", "promisedDate"],
    ["promisedAt", "promisedDate"],
    ["body.serviceTypeId", "serviceTypeId"],
    ["vehicleId", "vehicleId"],
  ])
    assert.equal(jobCardErrorField(path), expected);
});

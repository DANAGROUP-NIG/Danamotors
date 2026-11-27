import {
  QC_GENERAL_CHECKS,
  inspectionChecks,
  inspectionContentHash,
  passProblems,
  qcStateOf,
  qualityCheckBody,
  qualityCheckFieldProblems,
  readChecks,
  roadTestProblem,
  type QualityCheckInput,
} from "./job-quality-check.logic";

const LINES = [
  { id: "service", description: "Periodic service (50,000 km)" },
  { id: "pads", description: "Replace front brake pads" },
  { id: "ac", description: "Replace AC compressor" },
];
const PNG = "data:image/png;base64,iVBORw0KGgo=";
const allGeneral = QC_GENERAL_CHECKS.map((check) => ({ code: check.code, passed: true }));

const input = (overrides: Partial<QualityCheckInput> = {}): QualityCheckInput => ({
  requestId: "6f1c2c1e-4f5b-4f0e-9a51-0d4c4b0e8a11",
  outcome: "PASS",
  lines: LINES.map((line) => ({ workLineId: line.id, result: "PASS" as const })),
  general: allGeneral,
  acOutletTempC: 6,
  roadTestStartKm: 48_262,
  roadTestEndKm: 48_270,
  roadTestNotes: null,
  notes: null,
  signatureImage: PNG,
  ...overrides,
});

describe("QC state from the current inspection", () => {
  it("uses the current inspection, else not required for the estimation charge only, else pending", () => {
    expect(qcStateOf({ result: "PASSED" }, false)).toBe("PASSED");
    expect(qcStateOf({ result: "FAILED" }, true)).toBe("FAILED");
    expect(qcStateOf(null, true)).toBe("NOT_REQUIRED");
    expect(qcStateOf(undefined, false)).toBe("PENDING");
  });
});

describe("road test km", () => {
  it("needs both readings for a pass and end at least start", () => {
    expect(roadTestProblem(null, null, true)).toEqual({ field: "roadTestStartKm", message: "Enter the road test start and end km." });
    expect(roadTestProblem(48_262, null, true)).toEqual({ field: "roadTestEndKm", message: "Enter the road test start and end km." });
    expect(roadTestProblem(null, null, false)).toBeNull();
    expect(roadTestProblem(48_270, 48_262, false)).toEqual({ field: "roadTestEndKm", message: "End km must be the same as or higher than start km." });
    expect(roadTestProblem(48_262, 48_262, true)).toBeNull();
  });

  it("rejects negative, fractional and non-number km in the request body", () => {
    const parse = (value: unknown) => qualityCheckBody.safeParse({ ...input(), roadTestEndKm: value });
    expect(parse(-1).error?.issues[0].message).toBe("Road test end km cannot be negative.");
    expect(parse(12.5).error?.issues[0].message).toBe("Road test end km must be a whole number.");
    expect(parse("48270").error?.issues[0].message).toBe("Road test end km must be a number.");
    expect(qualityCheckBody.safeParse({ ...input(), acOutletTempC: 55 }).error?.issues[0].message).toBe(
      "AC outlet temperature must be between 0 and 40 °C.",
    );
    expect(qualityCheckBody.safeParse({ ...input(), requestId: "x" }).error?.issues[0].path).toEqual(["requestId"]);
    expect(qualityCheckBody.safeParse(input()).success).toBe(true);
  });
});

describe("pass gate", () => {
  it("passes with every line passed, every general check, km and a signature", () => {
    expect(passProblems(input(), LINES)).toEqual([]);
  });

  it("names everything still missing, in screen order", () => {
    expect(
      passProblems(
        input({
          lines: [{ workLineId: "pads", result: "FAIL" }],
          general: allGeneral.map((check) => (check.code === "FLUID_LEVELS" ? { ...check, passed: false } : check)).slice(0, 3),
          roadTestEndKm: null,
          signatureImage: null,
        }),
        LINES,
      ),
    ).toEqual([
      "Check every work item: 2 left.",
      "A work item is marked Fail. Use Fail and return to technician.",
      "Confirm every general check: Fluid levels correct, Vehicle interior clean.",
      "Enter the road test start and end km.",
      "Sign the certification.",
    ]);
  });

  it("allows a job with no work list (released before phase 6)", () => {
    expect(passProblems(input({ lines: [] }), [])).toEqual([]);
  });
});

describe("field problems", () => {
  it("refuses lines that are not on the job or checked twice", () => {
    expect(qualityCheckFieldProblems(input({ lines: [{ workLineId: "other", result: "PASS" }] }), LINES)[0]).toEqual({
      field: "lines",
      message: "A work item is not on this job. Reload the job and try again.",
    });
    expect(
      qualityCheckFieldProblems(input({ lines: [{ workLineId: "pads", result: "PASS" }, { workLineId: "pads", result: "FAIL" }] }), LINES)[0].message,
    ).toBe("A work item was checked twice. Reload the job and try again.");
  });

  it("a fail needs notes and at least one failed line; km are optional but checked", () => {
    const fail = input({ outcome: "FAIL", signatureImage: null, roadTestStartKm: null, roadTestEndKm: null });
    expect(qualityCheckFieldProblems(fail, LINES)).toEqual([
      { field: "notes", message: "Write what the technician must fix." },
      { field: "lines", message: "Mark Fail on the work items that need rework." },
    ]);
    const ready = { ...fail, notes: "Brake still noisy at low speed.", lines: [{ workLineId: "pads", result: "FAIL" as const }] };
    expect(qualityCheckFieldProblems(ready, LINES)).toEqual([]);
    expect(qualityCheckFieldProblems({ ...ready, roadTestStartKm: 100, roadTestEndKm: 90 }, LINES)).toEqual([
      { field: "roadTestEndKm", message: "End km must be the same as or higher than start km." },
    ]);
  });

  it("a pass reports only invalid km as a field problem; missing km is a pass gate", () => {
    expect(qualityCheckFieldProblems(input({ roadTestEndKm: null }), LINES)).toEqual([]);
    expect(qualityCheckFieldProblems(input({ roadTestEndKm: 48_000 }), LINES)[0].field).toBe("roadTestEndKm");
  });
});

describe("what the inspection stores", () => {
  it("keeps each checked line with its description and every general check", () => {
    const checks = inspectionChecks(input({ lines: [{ workLineId: "pads", result: "FAIL" }], general: [{ code: "WHEEL_NUTS", passed: true }] }), LINES);
    expect(checks.lines).toEqual([{ workLineId: "pads", description: "Replace front brake pads", result: "FAIL" }]);
    expect(checks.general.map((check) => [check.code, check.passed])).toEqual([
      ["NO_WARNING_LIGHTS", false],
      ["FLUID_LEVELS", false],
      ["WHEEL_NUTS", true],
      ["INTERIOR_CLEAN", false],
    ]);
  });

  it("reads converted rows ({}) and junk safely", () => {
    expect(readChecks({})).toEqual({ lines: [], general: [] });
    expect(readChecks("junk")).toEqual({ lines: [], general: [] });
  });

  it("binds the signature to the inspection and signer", () => {
    const inspection = { id: "i1", jobCardId: "j1", result: "PASSED", checks: inspectionChecks(input(), LINES), roadTestStartKm: 1, roadTestEndKm: 9, acOutletTempC: "6.0" };
    const at = new Date("2026-11-27T14:00:00Z");
    const hash = inspectionContentHash(inspection, "sup", at, PNG);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(inspectionContentHash(inspection, "sup", at, PNG)).toBe(hash);
    expect(inspectionContentHash(inspection, "other", at, PNG)).not.toBe(hash);
    expect(inspectionContentHash({ ...inspection, roadTestEndKm: 10 }, "sup", at, PNG)).not.toBe(hash);
  });
});

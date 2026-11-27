import { createHash } from "crypto";
import { z } from "zod";

/**
 * Quality check (job card revamp phase 7). The supervisor checks each approved work line, does the
 * general checks and the road test, signs the roadworthy certification, then passes or fails the job.
 * Everything here is pure so the server and the screens agree on the rules.
 */

/** The job's QC result, derived from its current inspection (JobCard.qcStatus is gone). */
export type QcState = "PENDING" | "PASSED" | "FAILED" | "NOT_REQUIRED";

/**
 * The current inspection decides. Without one, a job billed for the estimation charge only (the
 * customer declined all work, so there was no repair) needs no check; any other job is pending.
 */
export function qcStateOf(current: { result: "PASSED" | "FAILED" } | null | undefined, estimationChargeAdded: boolean): QcState {
  if (current) return current.result;
  return estimationChargeAdded ? "NOT_REQUIRED" : "PENDING";
}

/** The general checks on every quality check, in screen order. The AC outlet temperature is a number field beside them. */
export const QC_GENERAL_CHECKS = [
  { code: "NO_WARNING_LIGHTS", label: "No warning lights on dashboard" },
  { code: "FLUID_LEVELS", label: "Fluid levels correct" },
  { code: "WHEEL_NUTS", label: "Wheel nuts torqued" },
  { code: "INTERIOR_CLEAN", label: "Vehicle interior clean" },
] as const;
export type QcGeneralCode = (typeof QC_GENERAL_CHECKS)[number]["code"];
const GENERAL_CODES = QC_GENERAL_CHECKS.map((check) => check.code) as [QcGeneralCode, ...QcGeneralCode[]];

export const CERTIFICATION_STATEMENT = "Vehicle checked and certified as roadworthy in all respects";

const MAX_KM = 9_999_999;
const km = (label: string) =>
  z
    .number({ invalid_type_error: `${label} must be a number.` })
    .int(`${label} must be a whole number.`)
    .min(0, `${label} cannot be negative.`)
    .max(MAX_KM, `${label} must be ${MAX_KM.toLocaleString("en-NG")} or less.`)
    .nullable();

export const qualityCheckBody = z.object({
  requestId: z.string().uuid("Send a request ID (a UUID) so a double submit records once."),
  outcome: z.enum(["PASS", "FAIL"], { errorMap: () => ({ message: "Choose Pass or Fail for the quality check." }) }),
  lines: z
    .array(z.object({ workLineId: z.string().min(1, "Each work item needs its ID."), result: z.enum(["PASS", "FAIL"]) }))
    .max(200, "A quality check can cover at most 200 work items."),
  general: z
    .array(z.object({ code: z.enum(GENERAL_CODES, { errorMap: () => ({ message: "Unknown general check." }) }), passed: z.boolean() }))
    .max(GENERAL_CODES.length),
  acOutletTempC: z
    .number({ invalid_type_error: "AC outlet temperature must be a number." })
    // TODO(confirm): 0 to 40 °C is a typing guard, not a pass limit; the supervisor judges the cooling.
    .min(0, "AC outlet temperature must be between 0 and 40 °C.")
    .max(40, "AC outlet temperature must be between 0 and 40 °C.")
    .nullable(),
  roadTestStartKm: km("Road test start km"),
  roadTestEndKm: km("Road test end km"),
  roadTestNotes: z.string().trim().max(2000, "Keep the road test notes to 2,000 characters or fewer.").nullable(),
  notes: z.string().trim().max(2000, "Keep the notes to 2,000 characters or fewer.").nullable(),
  signatureImage: z.string().max(88000, "The signature image is too large. Clear it and sign again.").nullable(),
});
export type QualityCheckInput = z.infer<typeof qualityCheckBody>;

export interface QcWorkLine {
  id: string;
  description: string;
}

export interface FieldProblem {
  field: string;
  message: string;
}

/** Road test km: end must be the same as or higher than start. Required for a pass. */
export function roadTestProblem(start: number | null, end: number | null, required: boolean): FieldProblem | null {
  if (start === null || end === null) {
    if (!required && start === null && end === null) return null;
    return { field: start === null ? "roadTestStartKm" : "roadTestEndKm", message: "Enter the road test start and end km." };
  }
  if (end < start) return { field: "roadTestEndKm", message: "End km must be the same as or higher than start km." };
  return null;
}

/** Field-level mistakes that make the request itself invalid (400, naming the field). */
export function qualityCheckFieldProblems(input: QualityCheckInput, workLines: QcWorkLine[]): FieldProblem[] {
  const problems: FieldProblem[] = [];
  const known = new Set(workLines.map((line) => line.id));
  const seen = new Set<string>();
  for (const line of input.lines) {
    if (!known.has(line.workLineId)) problems.push({ field: "lines", message: "A work item is not on this job. Reload the job and try again." });
    else if (seen.has(line.workLineId)) problems.push({ field: "lines", message: "A work item was checked twice. Reload the job and try again." });
    seen.add(line.workLineId);
  }
  const road = roadTestProblem(input.roadTestStartKm, input.roadTestEndKm, input.outcome === "PASS");
  if (road && (input.outcome === "FAIL" || road.message !== "Enter the road test start and end km.")) problems.push(road);
  // TODO(confirm): a fail needs at least one failed work line; a fault outside the approved work
  // (for example a warning light) is written in the note against the closest line.
  if (input.outcome === "FAIL") {
    if (!input.notes?.trim()) problems.push({ field: "notes", message: "Write what the technician must fix." });
    const failed = input.lines.filter((line) => line.result === "FAIL").length;
    if (workLines.length && !failed) problems.push({ field: "lines", message: "Mark Fail on the work items that need rework." });
  }
  return problems;
}

/**
 * Why Pass quality check cannot be pressed yet, in the order the screen shows them. Empty when it can.
 * TODO(confirm): every general check must be ticked to pass, and the road test km are required for a
 * pass (optional on a fail); the certification signature is needed only to pass.
 */
export function passProblems(input: Pick<QualityCheckInput, "lines" | "general" | "roadTestStartKm" | "roadTestEndKm" | "signatureImage">, workLines: QcWorkLine[]): string[] {
  const problems: string[] = [];
  const results = new Map(input.lines.map((line) => [line.workLineId, line.result]));
  const unchecked = workLines.filter((line) => !results.has(line.id)).length;
  if (unchecked) problems.push(`Check every work item: ${unchecked} left.`);
  if (workLines.some((line) => results.get(line.id) === "FAIL"))
    problems.push("A work item is marked Fail. Use Fail and return to technician.");
  const ticked = new Set(input.general.filter((check) => check.passed).map((check) => check.code));
  const missing = QC_GENERAL_CHECKS.filter((check) => !ticked.has(check.code)).map((check) => check.label);
  if (missing.length) problems.push(`Confirm every general check: ${missing.join(", ")}.`);
  const road = roadTestProblem(input.roadTestStartKm, input.roadTestEndKm, true);
  if (road) problems.push(road.message);
  if (!input.signatureImage) problems.push("Sign the certification.");
  return problems;
}

export interface QcChecks {
  lines: { workLineId: string; description: string; result: "PASS" | "FAIL" }[];
  general: { code: string; label: string; passed: boolean }[];
}

/** What the inspection stores: every line with its description as checked, and every general check. */
export function inspectionChecks(input: Pick<QualityCheckInput, "lines" | "general">, workLines: QcWorkLine[]): QcChecks {
  const results = new Map(input.lines.map((line) => [line.workLineId, line.result]));
  const general = new Map(input.general.map((check) => [check.code, check.passed]));
  return {
    lines: workLines
      .filter((line) => results.has(line.id))
      .map((line) => ({ workLineId: line.id, description: line.description, result: results.get(line.id) ?? "PASS" })),
    general: QC_GENERAL_CHECKS.map((check) => ({ code: check.code, label: check.label, passed: general.get(check.code) ?? false })),
  };
}

/** Reads a stored checks value defensively (rows converted from the old QC columns hold {}). */
export function readChecks(value: unknown): QcChecks {
  const parsed = z
    .object({
      lines: z.array(z.object({ workLineId: z.string(), description: z.string(), result: z.enum(["PASS", "FAIL"]) })).default([]),
      general: z.array(z.object({ code: z.string(), label: z.string(), passed: z.boolean() })).default([]),
    })
    .safeParse(value ?? {});
  return parsed.success ? parsed.data : { lines: [], general: [] };
}

/** Binds the certified inspection, the signer and the signature image together. */
export function inspectionContentHash(
  inspection: { id: string; jobCardId: string; result: string; checks: QcChecks; roadTestStartKm: number | null; roadTestEndKm: number | null; acOutletTempC: string | null },
  signerId: string,
  signedAt: Date,
  signatureImage: string,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        inspectionId: inspection.id,
        jobCardId: inspection.jobCardId,
        result: inspection.result,
        checks: inspection.checks,
        roadTestStartKm: inspection.roadTestStartKm,
        roadTestEndKm: inspection.roadTestEndKm,
        acOutletTempC: inspection.acOutletTempC,
        statement: CERTIFICATION_STATEMENT,
        signerId,
        signedAt: signedAt.toISOString(),
        signatureHash: createHash("sha256").update(signatureImage).digest("hex"),
      }),
    )
    .digest("hex");
}

import { formatKm } from "@/lib/format";
import type { StatusTone } from "@/components/ui/table-components/StatusBadge";
import type {
  InspectionResult,
  JobQualityCheckStep,
  QcGeneralCheck,
  QcLineResult,
  QcState,
  QualityCheckPayload,
} from "../types/job-quality-check.types";

/**
 * Quality check (job card revamp phase 7). The same pass and fail rules as the server
 * (job-quality-check.logic.ts), with the same wording, so the screen explains a disabled button
 * before the supervisor presses it.
 */

export const QC_RESULT_BADGE: Record<InspectionResult, { label: string; tone: StatusTone }> = {
  PASSED: { label: "Passed", tone: "emerald" },
  FAILED: { label: "Failed", tone: "red" },
};

export const QC_STATE_LABEL: Record<QcState, string> = {
  PENDING: "Not checked yet",
  PASSED: "Passed",
  FAILED: "Failed",
  NOT_REQUIRED: "Not needed, no work was done",
};

/** The job's QC result from the inspections on a job card response: the current (not superseded) one. */
export function currentQcResult(inspections: { result: InspectionResult; supersededAt: string | null }[] | undefined): InspectionResult | null {
  return inspections?.find((inspection) => !inspection.supersededAt)?.result ?? null;
}

export interface QcForm {
  lines: Record<string, QcLineResult>;
  general: Record<string, boolean>;
  acOutletTempC: string;
  startKm: string;
  endKm: string;
  roadTestNotes: string;
  signature: string | null;
}

/** Nothing marked yet; the start km is the check-in odometer when there is one. */
export function initialQcForm(step: Pick<JobQualityCheckStep, "startKm">): QcForm {
  return { lines: {}, general: {}, acOutletTempC: "", startKm: step.startKm === null ? "" : String(step.startKm), endKm: "", roadTestNotes: "", signature: null };
}

const MAX_KM = 9_999_999;

/** A km reading: digits, with optional commas or spaces. Empty is null. */
export function parseKm(text: string): number | null | "invalid" {
  const clean = text.replace(/[,\s]/g, "");
  if (!clean) return null;
  if (!/^\d+$/.test(clean)) return "invalid";
  const value = Number(clean);
  return value > MAX_KM ? "invalid" : value;
}

/** The AC outlet temperature in °C, one decimal place at most. Empty is null. */
export function parseTemp(text: string): number | null | "invalid" {
  const clean = text.trim();
  if (!clean) return null;
  if (!/^\d{1,2}(\.\d)?$/.test(clean)) return "invalid";
  const value = Number(clean);
  return value > 40 ? "invalid" : value;
}

export interface QcFieldErrors {
  startKm?: string;
  endKm?: string;
  acOutletTempC?: string;
}

/** Mistakes in what was typed, shown under the field. */
export function qcFieldErrors(form: Pick<QcForm, "startKm" | "endKm" | "acOutletTempC">): QcFieldErrors {
  const errors: QcFieldErrors = {};
  const start = parseKm(form.startKm);
  const end = parseKm(form.endKm);
  const kmText = "Enter the km as a whole number, for example 48262.";
  if (start === "invalid") errors.startKm = kmText;
  if (end === "invalid") errors.endKm = kmText;
  else if (typeof start === "number" && typeof end === "number" && end < start) errors.endKm = "End km must be the same as or higher than start km.";
  if (parseTemp(form.acOutletTempC) === "invalid") errors.acOutletTempC = "Enter the temperature in °C between 0 and 40, or leave it empty.";
  return errors;
}

/** Why Pass quality check is disabled, in screen order. Empty when it can be pressed. */
export function passBlockers(form: QcForm, step: Pick<JobQualityCheckStep, "workLines" | "generalChecks">): string[] {
  const reasons: string[] = [];
  const unchecked = step.workLines.filter((line) => !form.lines[line.id]).length;
  if (unchecked) reasons.push(`Check every work item: ${unchecked} left.`);
  if (step.workLines.some((line) => form.lines[line.id] === "FAIL")) reasons.push("A work item is marked Fail. Use Fail and return to technician.");
  const missing = step.generalChecks.filter((check) => !form.general[check.code]).map((check) => check.label);
  if (missing.length) reasons.push(`Confirm every general check: ${missing.join(", ")}.`);
  const start = parseKm(form.startKm);
  const end = parseKm(form.endKm);
  const fields = qcFieldErrors(form);
  if (start === null || end === null) reasons.push("Enter the road test start and end km.");
  else if (fields.startKm || fields.endKm) reasons.push(fields.endKm ?? fields.startKm ?? "");
  if (fields.acOutletTempC) reasons.push("Correct the AC outlet temperature.");
  if (!form.signature) reasons.push("Sign the certification.");
  return reasons;
}

export interface FailForm {
  notes: string;
  failed: string[];
}

/** The lines the supervisor marked Fail on the screen, ticked when the dialog opens. */
export function initialFailForm(form: QcForm, step: Pick<JobQualityCheckStep, "workLines">): FailForm {
  return { notes: "", failed: step.workLines.filter((line) => form.lines[line.id] === "FAIL").map((line) => line.id) };
}

export function failProblems(fail: FailForm, hasLines: boolean, form: Pick<QcForm, "startKm" | "endKm" | "acOutletTempC">): { notes?: string; lines?: string; form?: string } {
  const problems: { notes?: string; lines?: string; form?: string } = {};
  if (!fail.notes.trim()) problems.notes = "Write what the technician must fix.";
  if (hasLines && !fail.failed.length) problems.lines = "Mark Fail on the work items that need rework.";
  const fields = qcFieldErrors(form);
  // Start km is filled in from check-in, so a fail without a road test leaves only End km empty: that is
  // no road test, not a mistake. An end reading without a start reading still needs fixing.
  const endOnly = parseKm(form.startKm) === null && parseKm(form.endKm) !== null;
  if (fields.startKm || fields.endKm || fields.acOutletTempC || endOnly)
    problems.form = endOnly ? "Enter both road test readings or clear them, then try again." : "Correct the road test or AC temperature on the form, then try again.";
  return problems;
}

const number = (value: number | null | "invalid") => (typeof value === "number" ? value : null);

/** The request for a pass, or for a fail with the dialog's notes and failed lines. */
export function qcPayload(
  form: QcForm,
  step: Pick<JobQualityCheckStep, "workLines" | "generalChecks">,
  outcome: "PASS" | "FAIL",
  requestId: string,
  fail?: FailForm,
): QualityCheckPayload {
  const failed = new Set(fail?.failed ?? []);
  const lines = step.workLines.flatMap((line) => {
    if (outcome === "FAIL" && failed.has(line.id)) return [{ workLineId: line.id, result: "FAIL" as const }];
    // A fail sends the dialog's failed lines; a line marked Fail on the form but not ticked there is left out.
    const result = form.lines[line.id];
    if (!result || (outcome === "FAIL" && result === "FAIL")) return [];
    return [{ workLineId: line.id, result }];
  });
  return {
    requestId,
    outcome,
    lines,
    general: step.generalChecks.map((check: QcGeneralCheck) => ({ code: check.code, passed: !!form.general[check.code] })),
    acOutletTempC: number(parseTemp(form.acOutletTempC)),
    // No end reading means no road test was done: the start reading filled in from check-in is not sent.
    roadTestStartKm: parseKm(form.endKm) === null ? null : number(parseKm(form.startKm)),
    roadTestEndKm: number(parseKm(form.endKm)),
    roadTestNotes: form.roadTestNotes.trim() || null,
    notes: outcome === "FAIL" ? fail?.notes.trim() || null : null,
    signatureImage: outcome === "PASS" ? form.signature : null,
  };
}

/** The road test as one line, for example "48,262 km to 48,270 km (8 km)". */
export function roadTestText(roadTest: { startKm: number | null; endKm: number | null } | null): string | null {
  if (!roadTest || roadTest.startKm === null || roadTest.endKm === null) return null;
  return `${formatKm(roadTest.startKm)} to ${formatKm(roadTest.endKm)} (${formatKm(roadTest.endKm - roadTest.startKm)})`;
}

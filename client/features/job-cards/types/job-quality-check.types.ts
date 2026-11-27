import type { WorkLineStatus } from "./job-repair.types";
import type { JobStage } from "./job-workspace.types";

/** The job's QC result, from its current inspection. */
export type QcState = "PENDING" | "PASSED" | "FAILED" | "NOT_REQUIRED";
export type QcLineResult = "PASS" | "FAIL";
export type InspectionResult = "PASSED" | "FAILED";

export interface QcWorkLine {
  id: string;
  description: string;
  kind: "SERVICE" | "LABOUR";
  supplementary: boolean;
  status: WorkLineStatus;
  doneAt: string | null;
  /** Reopened by an earlier failed check. */
  reopened: boolean;
  technician: string | null;
}

export interface QcGeneralCheck {
  code: string;
  label: string;
}

/** One quality check on the job, newest first. Never carries the signature image. */
export interface QcInspection {
  id: string;
  result: InspectionResult;
  at: string;
  /** The job's current result; earlier checks are history. */
  current: boolean;
  inspector: string | null;
  notes: string | null;
  failedLines: string[];
  lines: { workLineId: string; description: string; result: QcLineResult }[];
  general: { code: string; label: string; passed: boolean }[];
  roadTest: { startKm: number | null; endKm: number | null; notes: string | null } | null;
  acOutletTempC: string | null;
  certified: { by: string | null; at: string; signed: boolean } | null;
}

export interface JobQualityCheckStep {
  jobCardId: string;
  jobNumber: string;
  stage: JobStage;
  state: QcState;
  statement: string;
  generalChecks: QcGeneralCheck[];
  /** The check-in odometer, offered as the road test start. */
  startKm: number | null;
  workLines: QcWorkLine[];
  history: QcInspection[];
  access: { canRecord: boolean; reason: string | null };
}

export interface QualityCheckPayload {
  requestId: string;
  outcome: "PASS" | "FAIL";
  lines: { workLineId: string; result: QcLineResult }[];
  general: { code: string; passed: boolean }[];
  acOutletTempC: number | null;
  roadTestStartKm: number | null;
  roadTestEndKm: number | null;
  roadTestNotes: string | null;
  notes: string | null;
  signatureImage: string | null;
}

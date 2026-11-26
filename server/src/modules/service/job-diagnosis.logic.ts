import { z } from "zod";
import type { JobStage } from "@prisma/client";
import { ROLES } from "../../shared/constants/roles";
import { PHOTO_DATA_URL_LIMIT } from "./job-check-in.logic";
import type { StageActor } from "./job-stage.logic";

/**
 * Diagnosis (job card revamp phase 3): the workshop supervisor assigns a technician and bay, the
 * technician records what they found with the work and parts needed (never prices), and the
 * service engineer confirms. Pure rules only; job-diagnosis.service.ts loads the facts and writes.
 */

export const FINDING_TEXT_MAX = 2000;
export const ALLOCATION_NOTE_MAX = 500;
export const RETURN_NOTE_MAX = 1000;
export const MAX_ITEMS_PER_FINDING = 30;
export const MAX_PHOTOS_PER_FINDING = 6;
export const MAX_EXTRA_FINDINGS = 20;
/** A technician with this many jobs in hand or more shows as Busy. TODO(confirm) the threshold with the workshop. */
export const BUSY_FROM_JOBS = 3;
export const ITEM_QUANTITY_MAX = 9999;

/** Steps where the vehicle is in the workshop: its technician has it in hand and it takes up its bay. */
export const IN_WORKSHOP_STAGES = ["DIAGNOSIS", "WARRANTY", "ESTIMATE", "REPAIR", "QUALITY_CHECK"] as const satisfies readonly JobStage[];

const ADMINS = [ROLES.SUPER_ADMIN, ROLES.ADMIN];
/** The workshop supervisor role and the managers who can stand in for it (same as the stage rules). */
export const DIAGNOSIS_SUPERVISORS: readonly string[] = [ROLES.WORKSHOP_MANAGER, ROLES.GENERAL_WORKSHOP_MANAGER, ROLES.SERVICE_MANAGER, ...ADMINS];
/**
 * Who confirms or returns the diagnosis: the service engineer (Engineer role), or an admin.
 * TODO(confirm): whether a workshop manager may confirm at a branch without an engineer.
 */
export const DIAGNOSIS_ENGINEERS: readonly string[] = [ROLES.ENGINEER, ...ADMINS];

const uuid = (message: string) => z.string().uuid(message);

/** Assigning the technician and bay (the existing assignment endpoint, extended). */
export const allocationBody = z
  .object({
    technicianId: uuid("Choose a technician"),
    qualityInspectorId: uuid("Choose a quality inspector").optional(),
    bayId: uuid("Choose a bay").optional(),
    note: z.string().trim().max(ALLOCATION_NOTE_MAX, `Keep the note to the technician under ${ALLOCATION_NOTE_MAX} characters`).optional(),
    requestId: uuid("Reload the page and try again").optional(),
  })
  .strict();
export type AllocationInput = z.infer<typeof allocationBody>;

const itemBody = z
  .object({
    kind: z.enum(["LABOUR", "PART", "OIL"], { errorMap: () => ({ message: "Choose work or a part" }) }),
    referenceId: uuid("Choose the work or part from the list"),
    quantity: z
      .number({ invalid_type_error: "Enter the quantity as a number" })
      .positive("Enter a quantity above 0")
      .max(ITEM_QUANTITY_MAX, `Enter a quantity of ${ITEM_QUANTITY_MAX} or less`)
      .multipleOf(0.01, "Use at most 2 decimal places for the quantity"),
  })
  .strict();

/**
 * One finding, saved whole by the autosave. The client chooses the id, so a save retried after a
 * dropped connection updates the same finding instead of creating a second one.
 */
export const findingBody = z
  .object({
    complaintId: uuid("Choose the customer request this finding is for").nullable(),
    causeAndDefect: z.string().max(FINDING_TEXT_MAX, `Keep "What did you find?" under ${FINDING_TEXT_MAX} characters`),
    possibleWarranty: z.boolean({ invalid_type_error: "Choose whether this may be covered by warranty" }),
    items: z.array(itemBody).max(MAX_ITEMS_PER_FINDING, `A finding can list up to ${MAX_ITEMS_PER_FINDING} work and part lines`),
    /** 0 for a new finding; otherwise the version this screen last saw. */
    expectedVersion: z.number().int().min(0, "Reload the page and try again"),
  })
  .strict()
  .superRefine((body, ctx) => {
    const seen = new Set<string>();
    body.items.forEach((item, index) => {
      const key = `${item.kind === "LABOUR" ? "L" : "P"}:${item.referenceId}`;
      if (seen.has(key))
        ctx.addIssue({ code: "custom", path: ["items", index, "referenceId"], message: "This work or part is already listed. Change its quantity instead." });
      seen.add(key);
    });
  });
export type FindingInput = z.infer<typeof findingBody>;

export const findingPhotoBody = z
  .object({
    requestId: uuid("Reload the page and try again"),
    image: z.string().max(PHOTO_DATA_URL_LIMIT, "The photo is too large. Use a photo under 2 MB"),
  })
  .strict();

export const optionsQuery = z
  .object({
    q: z.string().trim().max(80, "Search with fewer than 80 characters").default(""),
  })
  .strict();

/** Labour is a job to do once; its hours come from the model's labour schedule at the estimate. */
export function itemQuantity(kind: "LABOUR" | "PART" | "OIL", quantity: number) {
  return kind === "LABOUR" ? 1 : quantity;
}

export type DiagnosisSubStep = "ASSIGN_TECHNICIAN" | "FINDINGS" | "ENGINEER_REVIEW";

export interface DiagnosisState {
  submittedAt: Date | null;
  returnedAt: Date | null;
}

export function diagnosisSubStep(technicianId: string | null, diagnosis: DiagnosisState | null): DiagnosisSubStep {
  if (!technicianId) return "ASSIGN_TECHNICIAN";
  return diagnosis?.submittedAt ? "ENGINEER_REVIEW" : "FINDINGS";
}

/** The technician sees the engineer's note while the job is back with them. */
export function isReturned(diagnosis: DiagnosisState | null) {
  return !!diagnosis?.returnedAt && !diagnosis.submittedAt;
}

const isAssignedTechnician = (actor: StageActor, technicianId: string | null) => actor.role === ROLES.TECHNICIAN && actor.id === technicianId;

/** Who may work the current part of diagnosis. Everyone else sees it read-only. */
export function canWorkDiagnosis(subStep: DiagnosisSubStep, actor: StageActor, technicianId: string | null) {
  switch (subStep) {
    case "ASSIGN_TECHNICIAN":
      return DIAGNOSIS_SUPERVISORS.includes(actor.role);
    case "FINDINGS":
      // The supervisor can record findings for a technician who has no device.
      return isAssignedTechnician(actor, technicianId) || DIAGNOSIS_SUPERVISORS.includes(actor.role);
    case "ENGINEER_REVIEW":
      return DIAGNOSIS_ENGINEERS.includes(actor.role);
  }
}

/** The supervisor may change the technician and bay until the findings are sent to the engineer. */
export function canAllocate(subStep: DiagnosisSubStep, actor: StageActor) {
  return subStep !== "ENGINEER_REVIEW" && DIAGNOSIS_SUPERVISORS.includes(actor.role);
}

export interface FindingFact {
  complaintId: string | null;
  causeAndDefect: string;
}

/**
 * What stops the findings going to the engineer: every customer request needs a written finding,
 * and a finding the customer did not mention needs words or has to be removed.
 */
export function findingProblems(complaintIds: string[], findings: FindingFact[]): string[] {
  const written = new Set(findings.filter((f) => f.complaintId && f.causeAndDefect.trim()).map((f) => f.complaintId));
  const missing = complaintIds.filter((id) => !written.has(id)).length;
  const problems: string[] = [];
  if (complaintIds.length && missing)
    problems.push(
      missing === complaintIds.length && complaintIds.length === 1
        ? "Write what you found for the customer request."
        : `Write what you found for every customer request (${missing} of ${complaintIds.length} still empty).`,
    );
  if (findings.some((f) => !f.complaintId && !f.causeAndDefect.trim()))
    problems.push("Describe each finding the customer did not mention, or remove it.");
  if (!complaintIds.length && !findings.some((f) => f.causeAndDefect.trim())) problems.push("Write at least one finding.");
  return problems;
}

export interface RouteFacts {
  /** Coverage was active when the job opened. */
  coverageActive: boolean;
  /** Open campaigns linked to the job at opening. */
  openCampaigns: number;
  /** A warranty case already exists for the job. */
  warrantyCase: boolean;
  /** Findings the technician or engineer flagged "Possible warranty". */
  flaggedFindings: number;
}

export type DiagnosisRoute = "WARRANTY" | "ESTIMATE";

/** Where the confirmed diagnosis goes: the warranty officer when anything may be warranty, else the advisor. */
export function diagnosisRoute(facts: RouteFacts): DiagnosisRoute {
  return facts.coverageActive || facts.openCampaigns > 0 || facts.warrantyCase || facts.flaggedFindings > 0 ? "WARRANTY" : "ESTIMATE";
}

/** Recorded on the stage event when the warranty step is skipped, and shown on the stepper. */
export const WARRANTY_SKIPPED_REASON = "Not under warranty";

export type Availability = "AVAILABLE" | "BUSY";

export function availability(jobsInHand: number): Availability {
  return jobsInHand >= BUSY_FROM_JOBS ? "BUSY" : "AVAILABLE";
}

export interface BayJob {
  bayId: string | null;
  jobCardId: string;
  jobNumber: string;
}

export interface BayView {
  id: string;
  code: string;
  description: string;
  occupiedBy: string | null;
}

/** Each active bay, free or occupied by another job in the workshop (first job number shown). */
export function bayStates(bays: { id: string; code: string; description: string }[], openJobs: BayJob[], thisJobId: string): BayView[] {
  const occupied = new Map<string, string>();
  for (const job of [...openJobs].sort((a, b) => a.jobNumber.localeCompare(b.jobNumber)))
    if (job.bayId && job.jobCardId !== thisJobId && !occupied.has(job.bayId)) occupied.set(job.bayId, job.jobNumber);
  return bays.map((bay) => ({ ...bay, occupiedBy: occupied.get(bay.id) ?? null }));
}

/** Counts per technician from one grouped query's rows. */
export function jobsInHand(rows: { technicianId: string | null; count: number }[]) {
  const counts = new Map<string, number>();
  for (const row of rows) if (row.technicianId) counts.set(row.technicianId, (counts.get(row.technicianId) ?? 0) + row.count);
  return counts;
}

/** Technicians in the order the supervisor scans them: available first, fewest jobs, then by name. */
export function sortTechnicians<T extends { name: string; jobsInHand: number }>(technicians: T[]): T[] {
  return [...technicians].sort((a, b) => {
    const busy = Number(availability(a.jobsInHand) === "BUSY") - Number(availability(b.jobsInHand) === "BUSY");
    return busy || a.jobsInHand - b.jobsInHand || a.name.localeCompare(b.name);
  });
}

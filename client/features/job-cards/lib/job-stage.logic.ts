import type { StatusTone } from "@/components/ui/table-components/StatusBadge";
import { NOT_PROVIDED, formatDateTime } from "@/lib/format";
import type {
  JobStage,
  JobWorkspace,
  StageAction,
  StageSummary,
  SubStep,
} from "../types/job-workspace.types";

/**
 * The single mapping for the staged job card: step order and labels, badge wording and tone,
 * action and role labels. Screens use these and never show raw codes.
 */

export const JOB_STEPS = [
  "CHECK_IN",
  "DIAGNOSIS",
  "WARRANTY",
  "ESTIMATE",
  "REPAIR",
  "QUALITY_CHECK",
  "BILLING",
  "DELIVERY",
] as const satisfies readonly JobStage[];
export type JobStep = (typeof JOB_STEPS)[number];

/** Stepper labels. */
export const STAGE_LABELS: Record<JobStage, string> = {
  CHECK_IN: "Check-in",
  DIAGNOSIS: "Diagnosis",
  WARRANTY: "Warranty",
  ESTIMATE: "Estimate",
  REPAIR: "Repair",
  QUALITY_CHECK: "Quality check",
  BILLING: "Billing",
  DELIVERY: "Delivery",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

const isStatus = (status: string, ...values: string[]) => values.includes(status.toUpperCase().replace(/ /g, "_"));

/** The job's badge: one label and tone from its stage and status. */
export function jobStageBadge(stage: JobStage, status: string): { label: string; tone: StatusTone } {
  switch (stage) {
    case "CHECK_IN":
      return { label: "Check-in", tone: "amber" };
    case "DIAGNOSIS":
      return { label: "Diagnosis", tone: "blue" };
    case "WARRANTY":
      return { label: "Warranty check", tone: "purple" };
    case "ESTIMATE":
      return { label: "Awaiting approval", tone: "amber" };
    case "REPAIR":
      return isStatus(status, "WAITING_PARTS") ? { label: "Waiting parts", tone: "amber" } : { label: "In repair", tone: "blue" };
    case "QUALITY_CHECK":
      return { label: "Quality check", tone: "blue" };
    case "BILLING":
      return isStatus(status, "READY", "COMPLETED") ? { label: "Ready", tone: "emerald" } : { label: "QC passed", tone: "emerald" };
    case "DELIVERY":
      return { label: "Ready", tone: "emerald" };
    case "CLOSED":
      return { label: "Delivered", tone: "gray" };
    case "CANCELLED":
      return { label: "Cancelled", tone: "red" };
  }
}

/** The job list's Step column: the step name, coloured like the job's badge. */
export function jobStepBadge(stage: JobStage, status: string): { label: string; tone: StatusTone } {
  return { label: STAGE_LABELS[stage], tone: jobStageBadge(stage, status).tone };
}

export function stepNumber(stage: JobStage): number | null {
  const index = (JOB_STEPS as readonly JobStage[]).indexOf(stage);
  return index < 0 ? null : index + 1;
}

/** Phone stepper: "Step 5 of 8: Repair". Closed and cancelled jobs show their end state. */
export function phoneStepLabel(stage: JobStage): string {
  const number = stepNumber(stage);
  return number ? `Step ${number} of ${JOB_STEPS.length}: ${STAGE_LABELS[stage]}` : STAGE_LABELS[stage];
}

export type StepState = "completed" | "current" | "upcoming" | "skipped";

/** The state of each of the 8 steps. A cancelled job keeps its completed steps; the rest are upcoming. */
export function stepStates(workspace: Pick<JobWorkspace, "stage" | "summaries">): { stage: JobStep; state: StepState }[] {
  const done = new Map(workspace.summaries.map((summary) => [summary.stage, summary.state]));
  return JOB_STEPS.map((stage) => {
    const summary = done.get(stage);
    if (summary === "SKIPPED") return { stage, state: "skipped" };
    if (summary === "COMPLETED") return { stage, state: "completed" };
    return { stage, state: stage === workspace.stage ? "current" : "upcoming" };
  });
}

/** One line per finished step, for example "Check-in completed by Chidi Eze, 25 Nov 2026, 09:40." */
export function summaryLine(summary: StageSummary): string {
  const label = STAGE_LABELS[summary.stage];
  if (summary.state === "SKIPPED") return `${label} skipped.`;
  if (!summary.by) return `${label} completed. ${NOT_PROVIDED}.`;
  return `${label} completed by ${summary.by}, ${formatDateTime(summary.at)}.`;
}

/** Button wording for each action. */
export const ACTION_LABELS: Record<StageAction, string> = {
  SEND_TO_SUPERVISOR: "Send to workshop supervisor",
  SEND_TO_WARRANTY: "Send to warranty officer",
  SEND_TO_ADVISOR: "Send to service advisor",
  WARRANTY_TO_ADVISOR: "Send to service advisor",
  RELEASE_TO_REPAIR: "Release to technician",
  PAUSE_FOR_PARTS: "Pause for parts",
  RESUME_REPAIR: "Resume repair",
  SEND_TO_QC: "Send to quality check",
  QC_PASSED_TO_ADVISOR: "Send to service advisor",
  RETURN_TO_REPAIR: "Return to technician",
  MARK_READY: "Mark vehicle ready",
  SEND_TO_DELIVERY: "Send to delivery",
  CANCEL: "Cancel job",
};

/** Job-card wording for the role that holds a step. */
const OWNER_ROLE_LABELS: Record<string, string> = {
  ServiceAdviser: "Service advisor",
  WorkshopManager: "Workshop supervisor",
  Technician: "Technician",
  Engineer: "Service engineer",
  WarrantyOfficer: "Warranty officer",
  BillingOfficer: "Billing officer",
};

export function ownerRoleLabel(role: string | null | undefined): string {
  return (role && OWNER_ROLE_LABELS[role]) || "Staff member";
}

/** Header line: "With: Musa Abdullahi (Technician) since 25 Nov 2026, 09:40". */
export function ownerLine(workspace: Pick<JobWorkspace, "owner" | "enteredAt">): string | null {
  const { owner } = workspace;
  if (!owner) return null;
  const role = ownerRoleLabel(owner.role);
  const who = owner.name ? `${owner.name} (${role})` : role;
  return `With: ${who} since ${formatDateTime(workspace.enteredAt)}`;
}

/** Toast after a handoff: "Job 2026000127 sent to Tunde Bakare". */
export function handoffToast(workspace: Pick<JobWorkspace, "jobNumber" | "owner" | "stage">): string {
  if (workspace.stage === "CANCELLED") return `Job ${workspace.jobNumber} cancelled`;
  if (!workspace.owner) return `Job ${workspace.jobNumber} updated`;
  return `Job ${workspace.jobNumber} sent to ${workspace.owner.name ?? ownerRoleLabel(workspace.owner.role).toLowerCase()}`;
}

/** What is happening inside the current step. */
export const SUB_STEP_LABELS: Record<SubStep, string> = {
  DETAILS: "Confirming the visit details",
  WALK_AROUND: "Walking round the vehicle",
  CUSTOMER_CONSENT: "Waiting for the customer's check-in signature",
  SEND_TO_WORKSHOP: "Ready to send to the workshop",
  ASSIGN_TECHNICIAN: "Waiting for a technician to be assigned",
  FINDINGS: "Technician is inspecting the vehicle",
  WARRANTY_REVIEW: "Warranty officer is checking cover",
  ESTIMATE_APPROVAL: "Waiting for the customer to approve the estimate",
  ADVANCE_PAYMENT: "Waiting for the advance payment",
  RELEASE: "Ready to release to the technician",
  WORK: "Work in progress",
  WAITING_PARTS: "Waiting for parts",
  INSPECTION: "Waiting for the quality check",
  QC_PASSED: "Quality check passed",
  QC_FAILED: "Quality check failed",
  MARK_READY: "Waiting for the advisor to mark the vehicle ready",
  INVOICE: "Waiting for the bill",
  HANDOVER: "Waiting for the customer to collect",
};

/** The one primary action, if any, and the rest. */
export function splitActions(workspace: Pick<JobWorkspace, "actions">) {
  return {
    primary: workspace.actions.find((view) => view.kind === "primary") ?? null,
    secondary: workspace.actions.filter((view) => view.kind === "secondary"),
    danger: workspace.actions.filter((view) => view.kind === "danger"),
  };
}

import { JOB_STATUS_WORDS } from "../types/job-card-status";
import { belongingsText, damageSentence, fuelLabel } from "./check-in.logic";
import type { StatusTone } from "@/components/ui/table-components/StatusBadge";
import { NOT_PROVIDED, formatDateTime, formatKm, formatMoney, formatRelative } from "@/lib/format";
import { COVERAGE_LABELS, CASE_STATUS_LABELS } from "@/features/warranty/lib/warranty-format";
import { toEstimateViewModel } from "../components/repair-workspace-helpers";
import { WORKSPACE_COPY } from "../components/repair-workspace-copy";
import type { JobCard } from "../types/job-card.types";
import type {
  JobStage,
  JobWorkspace,
  StageAction,
  StageActivity,
  StageAlert,
  StageSummary,
} from "../types/job-workspace.types";
import {
  ACTION_LABELS,
  JOB_STEPS,
  handoffToast,
  STAGE_LABELS,
  ownerRoleLabel,
  stepStates,
  summaryLine,
  type JobStep,
  type StepState,
} from "./job-stage.logic";

/**
 * Pure rules behind the job card frame (header, stepper, summaries, alerts, action bar, Job file).
 * Components only render what these return.
 */

const HOUR = 60 * 60 * 1000;

export type CountdownTone = "normal" | "soon" | "overdue";

/**
 * The promised-delivery countdown beside the header date: amber when less than 4 hours remain,
 * red once the time has passed. Finished and cancelled jobs show no countdown.
 */
export function promiseCountdown(
  promisedAt: string | null | undefined,
  stage: JobStage,
  now: Date = new Date(),
): { tone: CountdownTone; text: string } | null {
  if (!promisedAt || stage === "CLOSED" || stage === "CANCELLED") return null;
  const due = new Date(promisedAt).getTime();
  if (!Number.isFinite(due)) return null;
  const left = due - now.getTime();
  if (left < 0) {
    const late = formatRelative(promisedAt, now);
    return { tone: "overdue", text: late === "just now" ? "Due now" : `Overdue by ${late.replace(/ ago$/, "")}` };
  }
  return { tone: left < 4 * HOUR ? "soon" : "normal", text: formatRelative(promisedAt, now) };
}

export interface StepView {
  stage: JobStep;
  number: number;
  label: string;
  state: StepState;
  /** Who finished the step and when, "Skipped", or nothing for current and upcoming steps. */
  caption: string | null;
  /** A finished step (or the skipped warranty check) that opens its read-only summary. */
  opensSummary: boolean;
}

/** The 8 steps with their state and caption. A cancelled job keeps what it finished. */
export function stepperView(workspace: Pick<JobWorkspace, "stage" | "summaries">): StepView[] {
  const byStage = new Map(workspace.summaries.map((summary) => [summary.stage, summary]));
  return stepStates(workspace).map(({ stage, state }, index) => {
    const summary = byStage.get(stage);
    const caption =
      state === "skipped"
        ? "Skipped"
        : state === "completed"
          ? summary?.by
            ? `${summary.by}, ${formatDateTime(summary.at)}`
            : NOT_PROVIDED
          : null;
    // A skipped warranty check still opens: the warranty officer can read the evidence.
    const opensSummary = state === "completed" || (state === "skipped" && stage === "WARRANTY");
    return { stage, number: index + 1, label: STAGE_LABELS[stage], state, caption, opensSummary };
  });
}

/** Width of the phone stepper's progress bar, 0 to 100. */
export function stepProgress(workspace: Pick<JobWorkspace, "stage" | "summaries">): number {
  if (workspace.stage === "CLOSED") return 100;
  const done = workspace.summaries.length;
  return Math.round((done / JOB_STEPS.length) * 100);
}

export interface DetailRow {
  label: string;
  value: string;
}

const person = (value: { firstName: string; lastName: string } | null | undefined) =>
  value ? `${value.firstName} ${value.lastName}`.trim() || NOT_PROVIDED : NOT_PROVIDED;
const text = (value: string | null | undefined) => (value && value.trim() ? value.trim() : NOT_PROVIDED);
export const yesNo = (value: boolean | null | undefined) => (value == null ? NOT_PROVIDED : value ? "Yes" : "No");

const QC_RESULT: Record<string, string> = WORKSPACE_COPY.qcStates;
const ACTIVE_INVOICE = (status: string) => !["CANCELLED", "CANCELED", "VOID"].includes(status.toUpperCase());

/**
 * The read-only facts shown when a finished step is expanded. Data the job never recorded,
 * for example on jobs created before the staged job card, reads "Not provided".
 */
export function stageDetails(stage: JobStep, job: JobCard): DetailRow[] {
  switch (stage) {
    case "CHECK_IN":
      return [
        { label: "Received by", value: person(job.serviceAdvisor) },
        { label: "Mileage", value: formatKm(job.mileage) },
        { label: "Service type", value: text(job.serviceType?.description ?? job.service?.name) },
        { label: "Promised delivery", value: formatDateTime(job.promisedAt) },
        {
          label: "Customer requests",
          value: job.complaints?.length ? job.complaints.map((complaint) => complaint.description).join("; ") : NOT_PROVIDED,
        },
        { label: "Instructions to technician", value: text(job.checkIn?.instructionsToTechnician) },
        ...checkInRows(job),
        {
          label: "Customer consent",
          value: job.openingSignatureCurrent ? "Signed by the customer" : job.openingSignatureRequired ? "Not signed" : NOT_PROVIDED,
        },
      ];
    case "DIAGNOSIS": {
      const findings = (job.findings ?? []).filter((finding) => finding.causeAndDefect.trim());
      const flagged = findings.filter((finding) => finding.possibleWarranty).length;
      return [
        { label: "Technician", value: person(job.technician) },
        { label: "Bay", value: text(job.bay?.description) },
        { label: "Findings", value: findings.length ? findings.map((finding) => finding.causeAndDefect.trim()).join(" ") : NOT_PROVIDED },
        { label: "Possible warranty", value: findings.length ? (flagged ? `${flagged} ${flagged === 1 ? "finding" : "findings"}` : "None") : NOT_PROVIDED },
        {
          label: "Confirmed by",
          value: job.diagnosis?.confirmedAt ? `${person(job.diagnosis.confirmedBy)}, ${formatDateTime(job.diagnosis.confirmedAt)}` : NOT_PROVIDED,
        },
      ];
    }
    case "WARRANTY":
      return [
        {
          label: "Coverage when the job opened",
          value: job.warrantyStatusAtCreation ? COVERAGE_LABELS[job.warrantyStatusAtCreation] : NOT_PROVIDED,
        },
        {
          label: "Warranty case",
          value: job.warrantyCase ? `${job.warrantyCase.caseNumber}, ${CASE_STATUS_LABELS[job.warrantyCase.status]}` : NOT_PROVIDED,
        },
      ];
    case "ESTIMATE": {
      const latest = job.estimates?.[0];
      if (!latest) return [{ label: "Estimate", value: NOT_PROVIDED }];
      const view = toEstimateViewModel(latest);
      return [
        { label: "Estimate", value: `Revision ${view.version}` },
        { label: "Customer decision", value: WORKSPACE_COPY.estimateStates[view.status] },
        { label: "Estimate total", value: formatMoney(view.total) },
      ];
    }
    case "REPAIR":
      return [
        { label: "Technician", value: person(job.technician) },
        { label: "Work done", value: text(job.workDone) },
        { label: "Labour lines recorded", value: String(job.labourLines?.length ?? 0) },
        { label: "Parts issued", value: String(job.partIssuances?.length ?? 0) },
      ];
    case "QUALITY_CHECK":
      return [
        { label: "Result", value: QC_RESULT[job.qcStatus?.toUpperCase() ?? ""] ?? NOT_PROVIDED },
        { label: "Quality inspector", value: person(job.qualityInspector) },
        { label: "Notes", value: text(job.qcNotes) },
      ];
    case "BILLING": {
      const invoices = (job.invoices ?? []).filter((invoice) => ACTIVE_INVOICE(invoice.status));
      return [
        { label: "Marked ready", value: formatDateTime(job.readyAt) },
        { label: "Bill", value: invoices.length ? invoices.map((invoice) => invoice.invoiceNumber).join(", ") : NOT_PROVIDED },
        { label: "Credit approved", value: job.creditApprovedById ? "Yes" : "No" },
      ];
    }
    case "DELIVERY":
      return [
        { label: "Delivered", value: formatDateTime(job.deliveredAt) },
        { label: "Delivered by", value: person(job.deliveryAdvisor) },
        { label: "Gate pass", value: text(job.gatePassNumber) },
      ];
  }
}

/** The walk-around in a few words. Item names are in the signed copy; here only the counts. */
function checkInRows(job: JobCard): DetailRow[] {
  const record = job.checkIn;
  if (!record || !record.fuelLevel) return [{ label: "Walk-around", value: NOT_PROVIDED }];
  const states = Object.values(record.checklist ?? {});
  const count = (state: string) => states.filter((value) => value === state).length;
  return [
    { label: "Fuel level", value: fuelLabel(record.fuelLevel) },
    { label: "Damage noted", value: damageSentence((job.damageMarks ?? []).map((mark) => ({ type: mark.type, x: Number(mark.x), y: Number(mark.y) }))) },
    { label: "Checklist", value: `${count("MISSING")} missing, ${count("NOT_WORKING")} not working` },
    { label: "Belongings", value: belongingsText(record) },
  ];
}

/** The one-line summary plus its details, for each finished step. */
export function summaryItems(workspace: Pick<JobWorkspace, "summaries">, job: JobCard) {
  return workspace.summaries.map((summary: StageSummary) => ({
    stage: summary.stage,
    line: summaryLine(summary),
    skipped: summary.state === "SKIPPED",
    details: summary.state === "SKIPPED" ? [] : stageDetails(summary.stage, job),
  }));
}

/** The Job file tabs, in order. */
export const JOB_FILE_TABS = [
  { id: "customer", label: "Customer and vehicle" },
  { id: "visits", label: "Visit history" },
  { id: "warranty", label: "Warranty and campaigns" },
  { id: "documents", label: "Documents and prints" },
  { id: "activity", label: "Activity" },
] as const;
export type JobFileTab = (typeof JOB_FILE_TABS)[number]["id"];

export type AlertLink = { label: string; anchor: string } | { label: string; tab: JobFileTab };

export interface AlertView extends StageAlert {
  link: AlertLink | null;
}

/**
 * Adds the action link each alert can offer. A link to a section is only offered when the
 * person can see that section on the current step.
 */
export function alertViews(alerts: StageAlert[], options: { canAssign: boolean; canSeeParts: boolean }): AlertView[] {
  return alerts.slice(0, 3).map((alert) => {
    let link: AlertLink | null = null;
    if (alert.code === "NO_TECHNICIAN" && options.canAssign) link = { label: "Assign a technician", anchor: "assign-technician" };
    if (alert.code === "WAITING_PARTS" && options.canSeeParts) link = { label: "View parts", anchor: "job-parts" };
    if (alert.code === "CAMPAIGN_ANSWERS") link = { label: "Open campaigns", tab: "warranty" };
    return { ...alert, link };
  });
}

/** The banner for someone who can see the step but does not own it. Null when no banner applies. */
export function waitingMessage(workspace: Pick<JobWorkspace, "readOnly" | "stage" | "owner" | "jobType">): string | null {
  if (!workspace.readOnly || workspace.stage === "CLOSED" || workspace.stage === "CANCELLED") return null;
  if (workspace.jobType === "PDI") return "This is a PDI job card. Update it from the PDI menu.";
  const role = ownerRoleLabel(workspace.owner?.role).toLowerCase();
  const who = workspace.owner?.name ? `${workspace.owner.name} (${ownerRoleLabel(workspace.owner.role)})` : `the ${role}`;
  return `Waiting for ${who}. You can view this step but only the ${role} can update it.`;
}

export type LoadProblem = "denied" | "not-found" | "error";

/** What went wrong loading the job: no access, no such job, or anything else (offline, server). */
export function loadProblem(error: unknown): LoadProblem {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  if (status === 403) return "denied";
  if (status === 404 || status === 400) return "not-found";
  return "error";
}

/** Plain-English line for one Activity entry, for example "Sent from Check-in to Diagnosis". */
export function activityLine(entry: StageActivity): string {
  const to = STAGE_LABELS[entry.toStage];
  if (entry.action === "CANCEL" || entry.toStage === "CANCELLED") return "Job cancelled";
  if (!entry.fromStage) return entry.action === "OPENED" ? "Job opened at Check-in" : `Job placed at ${to}`;
  if (entry.fromStage === entry.toStage) {
    if (entry.action === "ASSIGNED") return `Technician and bay assigned (${to})`;
    const label = entry.action && entry.action in ACTION_LABELS ? ACTION_LABELS[entry.action as keyof typeof ACTION_LABELS] : null;
    return label ? `${label} (${to})` : `Step owner changed (${to})`;
  }
  return `Moved from ${STAGE_LABELS[entry.fromStage]} to ${to}`;
}

/** "Musa Abdullahi (Technician)", or the role alone when no one person holds the step. */
export function activityOwner(entry: StageActivity): string | null {
  if (!entry.ownerRole && !entry.ownerName) return null;
  const role = ownerRoleLabel(entry.ownerRole);
  return entry.ownerName ? `${entry.ownerName} (${role})` : role;
}

/** "Kia Sportage 2023, white": the vehicle as people say it. */
export function vehicleTitle(vehicle: JobCard["vehicle"] | null | undefined): string {
  if (!vehicle) return NOT_PROVIDED;
  const name = [vehicle.make, vehicle.model, vehicle.year].filter((part) => part !== null && part !== undefined && String(part).trim()).join(" ");
  const colour = vehicle.color?.trim();
  if (!name) return colour || NOT_PROVIDED;
  return colour ? `${name}, ${colour.toLowerCase()}` : name;
}

/** The customer's name: company or person. */
export function customerName(customer: JobCard["customer"] | null | undefined): string {
  if (!customer) return NOT_PROVIDED;
  return customer.companyName?.trim() || `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim() || NOT_PROVIDED;
}


export function jobStatusWords(canonicalStatus: string | null | undefined): string {
  return (canonicalStatus && JOB_STATUS_WORDS[canonicalStatus]) || "Status not recorded";
}

/** The invoice badge: one label and tone per invoice status, never the raw code. */
export function invoiceStatusBadge(status: string | null | undefined): { label: string; tone: StatusTone } {
  const key = (status ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  switch (key) {
    case "PAID":
      return { label: "Paid", tone: "emerald" };
    case "UNPAID":
    case "ISSUED":
      return { label: "Unpaid", tone: "amber" };
    case "PARTIAL":
    case "PARTIALLY_PAID":
      return { label: "Part paid", tone: "amber" };
    case "OVERDUE":
      return { label: "Overdue", tone: "red" };
    case "DRAFT":
      return { label: "Draft", tone: "gray" };
    case "CANCELLED":
    case "CANCELED":
    case "VOID":
      return { label: "Cancelled", tone: "gray" };
    default:
      return { label: key ? key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, " ") : "Status not recorded", tone: "gray" };
  }
}


/** The success message after a step action, naming the job and, for a handoff, the new owner. */
export function actionToast(action: StageAction, workspace: Pick<JobWorkspace, "jobNumber" | "owner" | "stage">): string {
  switch (action) {
    case "PAUSE_FOR_PARTS":
      return `Job ${workspace.jobNumber} paused for parts`;
    case "RESUME_REPAIR":
      return `Work resumed on job ${workspace.jobNumber}`;
    case "MARK_READY":
      return `Job ${workspace.jobNumber} marked ready`;
    default:
      return handoffToast(workspace);
  }
}

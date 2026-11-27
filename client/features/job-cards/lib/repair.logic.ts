import type { StatusTone } from "@/components/ui/table-components/StatusBadge";
import { estimateTotals } from "./estimate.logic";
import type { JobEstimateStep } from "../types/job-estimate.types";
import type { MyJob, MyJobTab, PartRowStatus, RepairFinding, RepairFindingState, WorkLine, WorkLineAction, WorkLineStatus } from "../types/job-repair.types";

/**
 * Repair (job card revamp phase 6): the words, badges and rules the repair screens show.
 * One mapping each for work line, part and finding states.
 */

export const WORK_STATUS_BADGE: Record<WorkLineStatus, { label: string; tone: StatusTone }> = {
  NOT_STARTED: { label: "Not started", tone: "gray" },
  IN_PROGRESS: { label: "In progress", tone: "blue" },
  WAITING_PARTS: { label: "Waiting parts", tone: "amber" },
  DONE: { label: "Done", tone: "emerald" },
};

export const PART_STATUS_BADGE: Record<PartRowStatus, { label: string; tone: StatusTone }> = {
  REQUESTED: { label: "Requested from store", tone: "amber" },
  READY: { label: "Ready to collect", tone: "blue" },
  PARTLY_COLLECTED: { label: "Partly collected", tone: "amber" },
  COLLECTED: { label: "Collected", tone: "emerald" },
};

export const FINDING_STATE_BADGE: Record<RepairFindingState, { label: string; tone: StatusTone }> = {
  WAITING_ESTIMATE: { label: "Waiting for estimate", tone: "amber" },
  WAITING_APPROVAL: { label: "Waiting for customer", tone: "amber" },
  APPROVED: { label: "Approved", tone: "emerald" },
  DECLINED: { label: "Declined by customer", tone: "gray" },
};

export const PAYER_TAG: Partial<Record<WorkLine["payer"], string>> = { WARRANTY: "Warranty", GOODWILL: "Goodwill", CAMPAIGN: "Campaign" };

/** "1 h 20 min", "50 min", "Under 1 min". */
export function timeWorkedText(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  if (minutes < 1) return "Under 1 min";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** "1.5 h" from the approved hours. */
export function hoursText(hours: string): string {
  const value = Number(hours);
  return `${value.toLocaleString("en-NG", { maximumFractionDigits: 2 })} h`;
}

/**
 * The big button on a work line: Start (also to carry on after waiting for parts) or Done.
 * Disabled with the reason while the job is paused or the person cannot work the job.
 */
export function lineButton(line: Pick<WorkLine, "status">, options: { paused: boolean; canWork: boolean }): { action: WorkLineAction; label: string; disabledReason: string | null } | null {
  if (line.status === "DONE") return null;
  const action: WorkLineAction = line.status === "IN_PROGRESS" ? "DONE" : "START";
  const label = action === "DONE" ? "Done" : line.status === "WAITING_PARTS" ? "Continue" : "Start";
  if (!options.canWork) return { action, label, disabledReason: "Only the assigned technician can update this work." };
  if (options.paused && action === "START") return { action, label, disabledReason: "The job is paused for parts. Resume the job first." };
  return { action, label, disabledReason: null };
}

/** How many work lines are not done yet. */
export function workLeft(lines: Pick<WorkLine, "status">[]): number {
  return lines.filter((line) => line.status !== "DONE").length;
}

/** "4 of 5 ready to collect at store", or what to say when nothing is ready. */
export function partsSummary(parts: { ready: number; outstanding: number; total: number }): string {
  if (parts.total === 0) return "No parts were requested for this job.";
  if (parts.outstanding === 0) return "All parts collected.";
  if (parts.ready === 0) return parts.outstanding === 1 ? "1 part is not ready at the store yet." : `${parts.outstanding} parts are not ready at the store yet.`;
  return `${parts.ready} of ${parts.outstanding} ready to collect at store`;
}

/** "Your signature confirms you received these parts from Ibrahim Sule." */
export function collectionConfirmation(issuers: (string | null)[]): string {
  const names = [...new Set(issuers.filter((name): name is string => !!name))];
  if (!names.length) return "Your signature confirms you received these parts from the store.";
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Your signature confirms you received these parts from ${list}.`;
}

export function collectProblems(selected: string[], signature: string | null): { parts?: string; signature?: string } {
  return {
    ...(selected.length ? {} : { parts: "Tick at least one part you are collecting" }),
    ...(signature ? {} : { signature: "Sign in the box to confirm you received the parts" }),
  };
}

export interface FindingForm {
  description: string;
  items: { kind: "LABOUR" | "PART"; referenceId: string; description: string; quantity: string }[];
}

/** Field errors for "Need a part" and "Add a finding", naming the field and the fix. */
export function findingFormProblems(form: FindingForm, kind: "PART" | "FINDING"): { description?: string; items?: string; quantities: Record<number, string> } {
  const quantities: Record<number, string> = {};
  form.items.forEach((item, index) => {
    const value = item.quantity.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(value) || Number(value) <= 0) quantities[index] = "Enter a quantity above 0, with at most 2 decimal places";
    else if (Number(value) > 9999) quantities[index] = "Enter a quantity of 9,999 or less";
  });
  const description = form.description.trim().length < 3 ? (kind === "PART" ? "Say why the part is needed, in at least 3 characters" : "Write what you found, in at least 3 characters") : undefined;
  const items =
    kind === "PART" && !form.items.some((item) => item.kind === "PART")
      ? "Choose the part you need"
      : !form.items.length
        ? "Add the work or part this finding needs"
        : undefined;
  return { ...(description ? { description } : {}), ...(items ? { items } : {}), quantities };
}

export const hasFindingProblems = (problems: ReturnType<typeof findingFormProblems>) =>
  !!problems.description || !!problems.items || Object.keys(problems.quantities).length > 0;

/** The new-finding banner for the advisor: who found what, and the one action. */
export function newFindingBanner(findings: RepairFinding[]): { text: string; waiting: number } | null {
  const waiting = findings.filter((finding) => finding.state === "WAITING_ESTIMATE");
  if (!waiting.length) return null;
  const first = waiting[0];
  const who = first.raisedBy ?? "The technician";
  const text =
    waiting.length === 1
      ? `New finding from ${who}: ${first.description}`
      : `${waiting.length} new findings from the workshop, the latest from ${waiting[waiting.length - 1].raisedBy ?? "the technician"}.`;
  return { text, waiting: waiting.length };
}

/**
 * A supplementary revision on the estimate screens: only the new lines are shown, decided and totalled.
 * The earlier lines keep the customer's first answer on the server.
 */
export function supplementaryView(step: JobEstimateStep): JobEstimateStep {
  if (!step.estimate?.supplementary) return step;
  const lines = step.estimate.lines.filter((line) => !line.carriedOver);
  return { ...step, estimate: { ...step.estimate, lines, totals: estimateTotals(lines, step.estimate.vatRate) } };
}

export const MY_JOB_TABS: { value: MyJobTab; label: string; empty: string }[] = [
  { value: "TODAY", label: "Today", empty: "No jobs waiting for you. New jobs appear here when the workshop supervisor assigns them to you." },
  { value: "WAITING_PARTS", label: "Waiting parts", empty: "None of your jobs is paused for parts." },
  { value: "DONE", label: "Done", empty: "You have not sent a job for the quality check today." },
];

/** The card button's look: collecting parts stands out from carrying on with work. */
export function nextActionVariant(next: MyJob["next"]): "default" | "secondary" | "outline" {
  return next.kind === "COLLECT" ? "secondary" : next.kind === "VIEW" || next.kind === "WAITING" ? "outline" : "default";
}

/** "Kia Sportage (2023)", or the model alone, or nothing known. */
export function vehicleText(job: Pick<MyJob, "model" | "year">): string | null {
  if (!job.model) return null;
  return job.year ? `${job.model} (${job.year})` : job.model;
}

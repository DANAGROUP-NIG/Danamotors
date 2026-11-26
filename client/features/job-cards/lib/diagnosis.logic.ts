import { z } from "zod";
import type { StatusTone } from "@/components/ui/table-components/StatusBadge";
import type {
  BayOption,
  CustomerRequest,
  DiagnosisRouting,
  FindingDraft,
  FindingInput,
  FindingItem,
  FindingItemKind,
  JobDiagnosis,
  JobFinding,
  TechnicianRow,
} from "../types/job-diagnosis.types";

/**
 * Diagnosis screens (job card revamp phase 3): allocation, technician findings, engineer review.
 * Pure rules and wording only; the components stay presentational.
 */

/** Mirrors the server: 3 or more jobs in hand shows Busy. TODO(confirm) the threshold with the workshop. */
export const BUSY_FROM_JOBS = 3;
export const FINDING_TEXT_MAX = 2000;
export const ALLOCATION_NOTE_MAX = 500;
export const RETURN_NOTE_MAX = 1000;
export const MAX_PHOTOS_PER_FINDING = 6;
export const MAX_ITEMS_PER_FINDING = 30;
export const MAX_EXTRA_FINDINGS = 20;
export const QUANTITY_MAX = 9999;

export const allocationSchema = z.object({
  technicianId: z.string().min(1, "Choose a technician from the list."),
  bayId: z.string().min(1, "Choose a bay for the vehicle."),
  note: z.string().trim().max(ALLOCATION_NOTE_MAX, `Keep the note to the technician under ${ALLOCATION_NOTE_MAX} characters.`),
});
export type AllocationValues = z.infer<typeof allocationSchema>;

export const returnNoteSchema = z.object({
  note: z
    .string()
    .trim()
    .min(1, "Write what the technician should check again.")
    .max(RETURN_NOTE_MAX, `Keep the note under ${RETURN_NOTE_MAX} characters.`),
});
export type ReturnNoteValues = z.infer<typeof returnNoteSchema>;

export const fullName = (row: { firstName: string; lastName: string }) => `${row.firstName} ${row.lastName}`.trim();

/** Available or Busy, always with words as well as colour. On leave is not shown: there is no leave data yet. */
export function availabilityBadge(jobsInHand: number): { label: string; tone: StatusTone } {
  return jobsInHand >= BUSY_FROM_JOBS ? { label: "Busy", tone: "amber" } : { label: "Available", tone: "emerald" };
}

/** The small load bar: 0 to 100, full at 5 jobs. */
export function loadPercent(jobsInHand: number): number {
  return Math.round(Math.min(Math.max(jobsInHand, 0), 5) * 20);
}

export function jobsInHandText(jobsInHand: number): string {
  return jobsInHand === 1 ? "1 job in hand" : `${jobsInHand} jobs in hand`;
}

/** Technicians the supervisor scans first: available, fewest jobs, then by name. */
export function sortTechnicians(rows: TechnicianRow[]): TechnicianRow[] {
  return [...rows].sort((a, b) => {
    const busy = Number(a.jobsInHand >= BUSY_FROM_JOBS) - Number(b.jobsInHand >= BUSY_FROM_JOBS);
    return busy || a.jobsInHand - b.jobsInHand || fullName(a).localeCompare(fullName(b));
  });
}

/** The tag beside the name: the technician's workshop team. Skills come later (TODO(confirm)). */
export const teamTag = (row: TechnicianRow) => row.employee?.team?.description?.trim() || null;

export function bayLabel(bay: BayOption): string {
  const name = bay.description?.trim() || bay.code;
  return bay.occupiedBy ? `${name} (occupied by job ${bay.occupiedBy})` : `${name} (free)`;
}

export function assignButtonLabel(name: string | null): string {
  return name ? `Assign and send to ${name}` : "Assign technician";
}

/** One card per customer request, in the order they were taken, each with its finding if recorded. */
export function requestCards(diagnosis: Pick<JobDiagnosis, "requests" | "findings">) {
  const byRequest = new Map(diagnosis.findings.filter((f) => f.complaintId).map((f) => [f.complaintId as string, f]));
  return diagnosis.requests.map((request) => ({ request, finding: byRequest.get(request.id) ?? null }));
}

/** Findings the customer did not mention, oldest first. */
export const extraFindings = (diagnosis: Pick<JobDiagnosis, "findings">) => diagnosis.findings.filter((f) => !f.complaintId);

export const emptyDraft = (): FindingDraft => ({ causeAndDefect: "", possibleWarranty: false, items: [] });

export function draftOf(finding: JobFinding | null): FindingDraft {
  if (!finding) return emptyDraft();
  return {
    causeAndDefect: finding.causeAndDefect,
    possibleWarranty: finding.possibleWarranty,
    items: finding.items.map(({ kind, referenceId, description, quantity }) => ({ kind, referenceId, description, quantity })),
  };
}

export function findingPayload(complaintId: string | null, draft: FindingDraft, expectedVersion: number): FindingInput {
  return {
    complaintId,
    causeAndDefect: draft.causeAndDefect,
    possibleWarranty: draft.possibleWarranty,
    items: draft.items.map((item) => ({ kind: item.kind, referenceId: item.referenceId, quantity: item.quantity })),
    expectedVersion,
  };
}

/** Quantities show like "1", "4.5" or "0.25": never a trailing ".00", never a price. */
export function formatQuantity(quantity: number): string {
  return new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 }).format(quantity);
}

export function itemLine(item: Pick<FindingItem, "kind" | "description" | "quantity">): string {
  return item.kind === "LABOUR" ? item.description : `${item.description} (qty ${formatQuantity(item.quantity)})`;
}

/** The stepper on a part line: whole units for parts, half litres for oil, never below one step. */
export function stepQuantity(kind: FindingItemKind, quantity: number, direction: 1 | -1): number {
  const step = kind === "OIL" ? 0.5 : 1;
  const next = Math.round((quantity + direction * step) * 100) / 100;
  return Math.min(Math.max(next, step), QUANTITY_MAX);
}

/** A typed quantity, or a message naming the fix. */
export function parseQuantity(value: string): { ok: true; quantity: number } | { ok: false; message: string } {
  const text = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { ok: false, message: "Enter the quantity as a number with up to 2 decimal places." };
  const quantity = Number(text);
  if (quantity <= 0) return { ok: false, message: "Enter a quantity above 0." };
  if (quantity > QUANTITY_MAX) return { ok: false, message: `Enter a quantity of ${QUANTITY_MAX} or less.` };
  return { ok: true, quantity };
}

/** Adds work or a part; the same one again raises the quantity instead of a second line. */
export function addItem(items: FindingItem[], item: FindingItem): FindingItem[] {
  const isLabour = item.kind === "LABOUR";
  const index = items.findIndex((row) => (row.kind === "LABOUR") === isLabour && row.referenceId === item.referenceId);
  if (index < 0) return [...items, item];
  if (isLabour) return items;
  return items.map((row, i) => (i === index ? { ...row, quantity: stepQuantity(row.kind, row.quantity, 1) } : row));
}

/** The collapsed card's line: what was found (the card clamps it to one line), or that nothing is written yet. */
export function findingSummary(draft: FindingDraft): string {
  return draft.causeAndDefect.trim() || "No finding written yet";
}

/** For the engineer's table: findings grouped under the request they answer, extras last. */
export function reviewRows(diagnosis: Pick<JobDiagnosis, "requests" | "findings">) {
  const rows: { key: string; request: CustomerRequest | null; finding: JobFinding | null }[] = requestCards(diagnosis).map(
    ({ request, finding }) => ({ key: request.id, request, finding }),
  );
  for (const finding of extraFindings(diagnosis)) rows.push({ key: finding.id, request: null, finding });
  return rows;
}

export interface RoutingView {
  route: "WARRANTY" | "ESTIMATE";
  /** Why, in plain words; the last line says where the job goes. */
  lines: string[];
  note: string | null;
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/** The routing card: where the confirmed diagnosis goes next and why. */
export function routingView(routing: DiagnosisRouting): RoutingView {
  if (routing.route === "ESTIMATE")
    return {
      route: "ESTIMATE",
      lines: [
        "The vehicle is not under warranty, has no open campaign and no finding is flagged as possible warranty.",
        "This job goes to the service advisor next. The warranty step is skipped with the reason Not under warranty.",
      ],
      note: null,
    };
  const reasons = [
    ...(routing.flaggedFindings
      ? [`${routing.flaggedFindings} ${plural(routing.flaggedFindings, "finding is", "findings are")} flagged as possible warranty.`]
      : []),
    ...(routing.coverageActive ? ["The vehicle was under warranty when the job opened."] : []),
    ...(routing.openCampaigns
      ? [`${plural(routing.openCampaigns, "There is an open campaign", `There are ${routing.openCampaigns} open campaigns`)} for this vehicle.`]
      : []),
    ...(routing.warrantyCase ? ["A warranty case is already open for this job."] : []),
  ];
  return {
    route: "WARRANTY",
    lines: [...reasons, "This job goes to the warranty officer next."],
    note: "Jobs with customer-pay items only go straight to the service advisor.",
  };
}

/** "Kelechi Nwosu (Service engineer)" under the technician's button, or the role when none is set up. */
export function engineerLine(engineers: string[]): string {
  if (!engineers.length) return "The service engineer reviews your findings next.";
  return `${engineers[0]} (Service engineer) reviews your findings next.`;
}

/** The banner on the technician's view after the engineer sent the job back. */
export function returnedBanner(returned: NonNullable<JobDiagnosis["returned"]>, when: string): string {
  const who = returned.by ?? "The service engineer";
  return `Returned by ${who}, ${when}.`;
}

/** Browser speech input, only where the browser has it built in. No library and no recording is kept. */
export function speechRecognitionAvailable(scope: unknown): boolean {
  const w = scope as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown } | undefined;
  return !!w && (typeof w.SpeechRecognition === "function" || typeof w.webkitSpeechRecognition === "function");
}

/** Joins dictated words onto what is typed, with one space between. */
export function appendDictation(current: string, heard: string): string {
  const words = heard.trim();
  if (!words) return current;
  return current.trim() ? `${current.trimEnd()} ${words}` : words;
}

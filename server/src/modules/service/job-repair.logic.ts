import type { FindingPayer, WorkLineStatus } from "@prisma/client";
import { z } from "zod";

/**
 * Repair (job card revamp phase 6): pure rules for the technician's work list, the quality check
 * gate, the parts card and the My jobs home. No database access here.
 */

export const WORK_LINE_ACTIONS = ["START", "DONE", "WAIT_PARTS"] as const;
export type WorkLineAction = (typeof WORK_LINE_ACTIONS)[number];

export interface WorkLineState {
  status: WorkLineStatus;
  startedAt: Date | null;
  resumedAt: Date | null;
  workedSeconds: number;
  doneAt: Date | null;
}

/** Seconds worked so far, including the running stretch of a line in progress. */
export function secondsWorked(line: Pick<WorkLineState, "status" | "resumedAt" | "workedSeconds">, now: Date): number {
  const running = line.status === "IN_PROGRESS" && line.resumedAt ? Math.max(0, Math.floor((now.getTime() - line.resumedAt.getTime()) / 1000)) : 0;
  return line.workedSeconds + running;
}

export type WorkLineMove =
  | { ok: true; changed: boolean; next: WorkLineState }
  | { ok: false; reason: string };

/**
 * The work line state machine:
 * NOT_STARTED to IN_PROGRESS (Start) or WAITING_PARTS; IN_PROGRESS to DONE or WAITING_PARTS;
 * WAITING_PARTS back to IN_PROGRESS (Start). DONE is final in this phase (a failed quality
 * check reopens lines in phase 7). Repeating the move a line is already in changes nothing.
 * While the whole job is paused for parts, nothing starts.
 */
export function moveWorkLine(line: WorkLineState, action: WorkLineAction, now: Date, jobPaused: boolean): WorkLineMove {
  const target: WorkLineStatus = action === "START" ? "IN_PROGRESS" : action === "DONE" ? "DONE" : "WAITING_PARTS";
  if (line.status === target) return { ok: true, changed: false, next: line };
  if (line.status === "DONE") return { ok: false, reason: "This work is already done." };
  const worked = secondsWorked(line, now);
  switch (action) {
    case "START":
      if (jobPaused) return { ok: false, reason: "The job is paused for parts. Resume the job first." };
      return { ok: true, changed: true, next: { ...line, status: "IN_PROGRESS", startedAt: line.startedAt ?? now, resumedAt: now } };
    case "DONE":
      if (line.status !== "IN_PROGRESS") return { ok: false, reason: "Start this work before you mark it done." };
      return { ok: true, changed: true, next: { ...line, status: "DONE", resumedAt: null, workedSeconds: worked, doneAt: now } };
    case "WAIT_PARTS":
      return { ok: true, changed: true, next: { ...line, status: "WAITING_PARTS", resumedAt: null, workedSeconds: worked } };
  }
}

/** Pausing the whole job for parts stops the clock on every line in progress. */
export function pauseLine(line: WorkLineState, now: Date): WorkLineState {
  if (line.status !== "IN_PROGRESS") return line;
  return { ...line, status: "WAITING_PARTS", resumedAt: null, workedSeconds: secondsWorked(line, now) };
}

export interface RepairGateFacts {
  /** Every work line's status. A job released before phase 6 may have none. */
  lines: WorkLineStatus[];
  /** Findings raised during repair that no supplementary estimate prices yet. */
  findingsWithoutEstimate: number;
  /** A supplementary revision is prepared but the customer has not answered it. */
  supplementaryPending: boolean;
}

/**
 * Why "Send for quality check" is blocked. All work must be done, and new findings must have
 * the customer's answer first: "The customer must approve before this work is done."
 * TODO(confirm): new findings block the quality check until the customer answers.
 */
export function qualityCheckGate(facts: RepairGateFacts): string[] {
  const left = facts.lines.filter((status) => status !== "DONE").length;
  const reasons: string[] = [];
  if (left > 0) reasons.push(`Finish all work first: ${left} ${left === 1 ? "item" : "items"} left.`);
  if (facts.findingsWithoutEstimate > 0)
    reasons.push(
      facts.findingsWithoutEstimate === 1
        ? "A new finding is waiting for the service advisor's supplementary estimate."
        : `${facts.findingsWithoutEstimate} new findings are waiting for the service advisor's supplementary estimate.`,
    );
  if (facts.supplementaryPending) reasons.push("The customer has not answered the supplementary estimate yet.");
  return reasons;
}

export type PartRowStatus = "REQUESTED" | "READY" | "PARTLY_COLLECTED" | "COLLECTED";

export interface RequestedPart {
  sparePartId: string;
  description: string;
  quantity: number;
  requestedAt: Date | null;
}

export interface IssuedPart {
  id: string;
  sparePartId: string;
  description: string;
  /** Issued less active returns. Zero for a cancelled requisition. */
  quantity: number;
  issuedAt: Date;
  issuedBy: string | null;
  receivedAt: Date | null;
  receivedBy: string | null;
}

export interface PartRow {
  sparePartId: string;
  description: string;
  requested: number;
  requestedAt: Date | null;
  issued: number;
  issuedAt: Date | null;
  issuedBy: string | null;
  collected: number;
  collectedAt: Date | null;
  collectedBy: string | null;
  status: PartRowStatus;
}

/**
 * One row per part: requested (the automatic parts request), issued by the store and collected by
 * the technician (signed). A part issued without a request still shows, as requested = issued.
 */
export function partRows(requested: RequestedPart[], issued: IssuedPart[]): PartRow[] {
  const rows = new Map<string, PartRow>();
  const row = (sparePartId: string, description: string) => {
    const existing = rows.get(sparePartId);
    if (existing) return existing;
    const created: PartRow = {
      sparePartId,
      description,
      requested: 0,
      requestedAt: null,
      issued: 0,
      issuedAt: null,
      issuedBy: null,
      collected: 0,
      collectedAt: null,
      collectedBy: null,
      status: "REQUESTED",
    };
    rows.set(sparePartId, created);
    return created;
  };
  for (const part of requested) {
    const current = row(part.sparePartId, part.description);
    current.requested += part.quantity;
    if (part.requestedAt && (!current.requestedAt || part.requestedAt < current.requestedAt)) current.requestedAt = part.requestedAt;
  }
  for (const issue of issued) {
    if (issue.quantity <= 0) continue;
    const current = row(issue.sparePartId, issue.description);
    current.issued += issue.quantity;
    if (!current.issuedAt || issue.issuedAt > current.issuedAt) {
      current.issuedAt = issue.issuedAt;
      current.issuedBy = issue.issuedBy;
    }
    if (issue.receivedAt) {
      current.collected += issue.quantity;
      if (!current.collectedAt || issue.receivedAt > current.collectedAt) {
        current.collectedAt = issue.receivedAt;
        current.collectedBy = issue.receivedBy;
      }
    }
  }
  for (const current of rows.values()) {
    current.requested = Math.max(current.requested, current.issued);
    current.status =
      current.issued > current.collected
        ? "READY"
        : current.collected > 0 && current.collected >= current.requested
          ? "COLLECTED"
          : current.collected > 0
            ? "PARTLY_COLLECTED"
            : "REQUESTED";
  }
  return [...rows.values()];
}

/** "4 of 5 ready to collect": parts ready at the store, of the parts not yet collected. */
export function partsReadiness(rows: PartRow[]) {
  const open = rows.filter((row) => row.status !== "COLLECTED");
  return { ready: open.filter((row) => row.status === "READY").length, outstanding: open.length, total: rows.length };
}

export const MY_JOB_TABS = ["TODAY", "WAITING_PARTS", "DONE"] as const;
export type MyJobTab = (typeof MY_JOB_TABS)[number];

export interface MyJobFacts {
  stage: string;
  status: string;
  diagnosisReturned: boolean;
  returnedFromQc: boolean;
  readyToCollect: number;
  nextWork: string | null;
  linesLeft: number;
  findingRequests: number;
}

export type NextActionKind = "DIAGNOSIS" | "REPAIR" | "COLLECT" | "WAITING" | "VIEW";

/** The next thing the technician does on a job, as the card's button and the line above it. */
export function myJobNextAction(job: MyJobFacts): { kind: NextActionKind; label: string; detail: string } {
  if (job.stage === "DIAGNOSIS")
    return job.diagnosisReturned
      ? { kind: "DIAGNOSIS", label: "Check again", detail: "The service engineer returned the findings with a note." }
      : {
          kind: "DIAGNOSIS",
          label: "Start diagnosis",
          detail: `Record what you find for ${job.findingRequests} customer ${job.findingRequests === 1 ? "request" : "requests"}.`,
        };
  if (job.stage === "REPAIR" && job.status === "WAITING_PARTS")
    return job.readyToCollect > 0
      ? { kind: "COLLECT", label: "Collect parts", detail: `${job.readyToCollect} ${job.readyToCollect === 1 ? "item" : "items"} ready at the store.` }
      : { kind: "WAITING", label: "Open job", detail: "Paused while the job waits for parts." };
  if (job.stage === "REPAIR") {
    if (job.readyToCollect > 0 && !job.returnedFromQc)
      return { kind: "COLLECT", label: "Collect parts", detail: `${job.readyToCollect} ${job.readyToCollect === 1 ? "item" : "items"} ready at the store.` };
    if (job.returnedFromQc) return { kind: "REPAIR", label: "Continue repair", detail: "Returned from the quality check. Read the note and fix the work." };
    return {
      kind: "REPAIR",
      label: "Continue repair",
      detail: job.nextWork ? `Next: ${job.nextWork}.` : job.linesLeft === 0 ? "All work is done. Send the job for the quality check." : "Work through the approved list.",
    };
  }
  return { kind: "VIEW", label: "View job", detail: "Sent for the quality check." };
}

/** Midnight in Lagos (UTC+1 all year) for the day containing `now`, as an instant. */
export function lagosDayStart(now: Date): Date {
  const lagos = new Date(now.getTime() + 60 * 60 * 1000);
  return new Date(Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate()) - 60 * 60 * 1000);
}

/** The work lines a release or an approved supplementary estimate creates: approved service and labour lines. */
export interface WorkSourceLine {
  id: string;
  type: string;
  referenceId: string | null;
  description: string;
  quantity: { toString(): string };
  payer: FindingPayer;
  customerDecision: "APPROVED" | "DECLINED" | null;
  sortOrder: number;
  campaignId: string | null;
}

export function workLinePlans(lines: WorkSourceLine[], existingKeys: Set<string>, supplementary: boolean) {
  const plans: {
    sourceKey: string;
    estimateLineId: string;
    kind: "SERVICE" | "LABOUR";
    labourItemId: string | null;
    description: string;
    quantity: string;
    payer: FindingPayer;
    campaignId: string | null;
    supplementary: boolean;
    sortOrder: number;
  }[] = [];
  const seen = new Set(existingKeys);
  for (const line of [...lines].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!line.referenceId || line.customerDecision === "DECLINED") continue;
    const kind = line.type === "SERVICE" ? "SERVICE" : ["LABOUR", "INCLUDED_LABOUR"].includes(line.type) ? "LABOUR" : null;
    if (!kind) continue;
    const sourceKey = `${kind}:${line.referenceId}`;
    if (seen.has(sourceKey)) continue;
    seen.add(sourceKey);
    plans.push({
      sourceKey,
      estimateLineId: line.id,
      kind,
      labourItemId: kind === "LABOUR" ? line.referenceId : null,
      description: line.description,
      quantity: line.quantity.toString(),
      payer: line.payer,
      campaignId: line.campaignId,
      supplementary,
      sortOrder: line.sortOrder,
    });
  }
  return plans;
}

/** The labour slip charge type for a work line's payer (CAMPAIGN is a FREE line charged to the campaign). */
export function chargeTypeFor(payer: FindingPayer) {
  return payer === "CAMPAIGN" ? ("FREE" as const) : payer;
}

const requestId = z.string().uuid("Reload the page and try again");

export const workLineActionBody = z.object({ action: z.enum(WORK_LINE_ACTIONS, { message: "Choose Start, Done or Waiting parts" }), requestId }).strict();

const findingItem = z
  .object({
    kind: z.enum(["LABOUR", "PART"], { message: "Choose work or a part" }),
    referenceId: z.string().uuid("Choose the work or part from the list"),
    quantity: z.coerce.number({ message: "Enter the quantity as a number" }).positive("Enter a quantity above 0").max(9999, "Enter a quantity of 9,999 or less"),
  })
  .strict();

export const repairFindingBody = z
  .object({
    requestId,
    kind: z.enum(["PART", "FINDING"]),
    description: z.string().trim().min(3, "Write what you found, in at least 3 characters").max(1000, "Keep the description under 1,000 characters"),
    items: z.array(findingItem).max(20, "Add at most 20 items"),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (body.kind === "PART" && !body.items.some((item) => item.kind === "PART"))
      ctx.addIssue({ code: "custom", path: ["items"], message: "Choose the part you need" });
    // The supplementary estimate prices the items, so a finding names the work or part it needs.
    else if (!body.items.length) ctx.addIssue({ code: "custom", path: ["items"], message: "Add the work or part this finding needs" });
  });

export const supplementaryBody = z.object({ requestId }).strict();

export const myJobsQuery = z
  .object({
    tab: z.enum(MY_JOB_TABS).default("TODAY"),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

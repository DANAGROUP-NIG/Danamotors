import type { JobStage } from "@prisma/client";
import { allGateReasons, checkInStep, type CheckInGates } from "./job-check-in.logic";
import { ROLES } from "../../shared/constants/roles";

/**
 * The staged job card: one job, one step, one owner.
 * Pure rules only. The stage service (job-stage.service.ts) loads the facts and writes.
 */

export const CANONICAL_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_PARTS",
  "QC",
  "READY",
  "BILLED",
  "DELIVERED",
  "CANCELLED",
] as const;
export type CanonicalStatus = (typeof CANONICAL_STATUSES)[number];
/** Statuses a lifecycle write can move a job to. OPEN is set at opening and BILLED by billing. */
export type WorkflowStatus = Exclude<CanonicalStatus, "OPEN" | "BILLED">;

/** The 8 working steps, in order. CLOSED and CANCELLED are end states, not steps. */
export const STAGE_ORDER = [
  "CHECK_IN",
  "DIAGNOSIS",
  "WARRANTY",
  "ESTIMATE",
  "REPAIR",
  "QUALITY_CHECK",
  "BILLING",
  "DELIVERY",
] as const satisfies readonly JobStage[];

export const ALL_STAGES = [...STAGE_ORDER, "CLOSED", "CANCELLED"] as const satisfies readonly JobStage[];

/** Server-side wording for audit entries and notifications. The client keeps its own display mapping. */
export const STAGE_LABELS: Record<JobStage, string> = {
  CHECK_IN: "Check-in",
  DIAGNOSIS: "Diagnosis",
  WARRANTY: "Warranty check",
  ESTIMATE: "Estimate",
  REPAIR: "Repair",
  QUALITY_CHECK: "Quality check",
  BILLING: "Billing",
  DELIVERY: "Delivery",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

/** Every legacy spelling seen in the codebase, mapped to the canonical lifecycle value. */
const LEGACY_STATUS: Record<string, CanonicalStatus> = {
  Open: "OPEN",
  Pending: "OPEN",
  "In Progress": "IN_PROGRESS",
  "On Hold": "IN_PROGRESS",
  "Quality Check": "QC",
  Ready: "READY",
  Completed: "READY",
  COMPLETED: "READY",
  Billed: "BILLED",
  Closed: "DELIVERED",
  CLOSED: "DELIVERED",
  Delivered: "DELIVERED",
  Cancelled: "CANCELLED",
  Canceled: "CANCELLED",
  CANCELED: "CANCELLED",
};

export function normaliseJobStatus(status: string): CanonicalStatus | null {
  if ((CANONICAL_STATUSES as readonly string[]).includes(status)) return status as CanonicalStatus;
  return LEGACY_STATUS[status] ?? null;
}

/** The stage a job holding this status is at when no stage history exists. Same mapping as the phase 0 migration. */
export function stageForLegacyStatus(status: string): JobStage {
  switch (normaliseJobStatus(status)) {
    case "IN_PROGRESS":
    case "WAITING_PARTS":
      return "REPAIR";
    case "QC":
      return "QUALITY_CHECK";
    case "READY":
      return "BILLING";
    case "BILLED":
      return "DELIVERY";
    case "DELIVERED":
      return "CLOSED";
    case "CANCELLED":
      return "CANCELLED";
    default:
      // OPEN, and any unknown spelling, is open work waiting for its estimate.
      return "ESTIMATE";
  }
}

export interface LegacyStatusFacts {
  waitingParts?: boolean;
  markedReady?: boolean;
  billed?: boolean;
}

/** The status the existing workflow must hold for a stage, so reports, billing and late deliveries keep working. */
export function legacyStatusForStage(stage: JobStage, facts: LegacyStatusFacts = {}): CanonicalStatus {
  switch (stage) {
    case "CHECK_IN":
    case "DIAGNOSIS":
    case "WARRANTY":
    case "ESTIMATE":
      return "OPEN";
    case "REPAIR":
      return facts.waitingParts ? "WAITING_PARTS" : "IN_PROGRESS";
    case "QUALITY_CHECK":
      return "QC";
    case "BILLING":
      // QC until the advisor marks it ready, then READY. Once invoiced (BILLED) the job is at delivery.
      return facts.markedReady ? "READY" : "QC";
    case "DELIVERY":
      return facts.billed ? "BILLED" : "READY";
    case "CLOSED":
      return "DELIVERED";
    case "CANCELLED":
      return "CANCELLED";
  }
}

/** Statuses a job at each stage may hold. Used to prove stage and status never disagree. */
export const STAGE_STATUSES: Record<JobStage, readonly CanonicalStatus[]> = {
  CHECK_IN: ["OPEN"],
  DIAGNOSIS: ["OPEN"],
  WARRANTY: ["OPEN"],
  ESTIMATE: ["OPEN"],
  REPAIR: ["IN_PROGRESS", "WAITING_PARTS"],
  QUALITY_CHECK: ["QC"],
  BILLING: ["QC", "READY"],
  DELIVERY: ["READY", "BILLED"],
  CLOSED: ["DELIVERED"],
  CANCELLED: ["CANCELLED"],
};

export function stageAllowsStatus(stage: JobStage, status: string) {
  const canonical = normaliseJobStatus(status);
  return !!canonical && STAGE_STATUSES[stage].includes(canonical);
}

/**
 * The stage a job must be at after its status (or QC result) changed by any path.
 * Stage-only moves (check-in to diagnosis, QC pass to billing and so on) are made by stage actions;
 * this keeps the stage in step when an existing workflow path changes the status.
 */
export function reconcileStage(
  current: JobStage,
  status: string,
  qcStatus: string | null | undefined,
  creditApproved = false,
): JobStage {
  const canonical = normaliseJobStatus(status);
  const qc = qcStatus?.toUpperCase() ?? null;
  switch (canonical) {
    case "CANCELLED":
      return "CANCELLED";
    case "DELIVERED":
      return "CLOSED";
    case "BILLED":
      return "DELIVERY";
    case "READY":
      // An unbilled job waits at delivery only on approved credit. A cancelled bill returns it to billing.
      return current === "DELIVERY" && creditApproved ? "DELIVERY" : "BILLING";
    case "QC":
      return current === "BILLING" && qc === "PASSED" ? "BILLING" : "QUALITY_CHECK";
    case "IN_PROGRESS":
    case "WAITING_PARTS":
      return "REPAIR";
    case "OPEN":
      return STAGE_STATUSES[current].includes("OPEN") ? current : "ESTIMATE";
    default:
      return current;
  }
}

export interface OwnerFacts {
  status: string;
  serviceAdvisorId: string | null;
  technicianId: string | null;
  qualityInspectorId: string | null;
  deliveryAdvisorId: string | null;
}

export interface StageOwner {
  ownerId: string | null;
  ownerRole: string | null;
}

/**
 * Who holds the job at a stage. Role names follow "Default business decisions":
 * workshop supervisor = WorkshopManager, service engineer = Engineer.
 * TODO(confirm): supervisor and engineer role mapping, see doc/plans/jobcard-revamp-implementation.md.
 */
export function stageOwnerFor(stage: JobStage, job: OwnerFacts): StageOwner {
  const advisor = { ownerId: job.serviceAdvisorId, ownerRole: ROLES.SERVICE_ADVISOR };
  const workshop = job.technicianId
    ? { ownerId: job.technicianId, ownerRole: ROLES.TECHNICIAN }
    : { ownerId: null, ownerRole: ROLES.WORKSHOP_MANAGER };
  switch (stage) {
    case "CHECK_IN":
    case "ESTIMATE":
      return advisor;
    case "DIAGNOSIS":
    case "REPAIR":
      return workshop;
    case "WARRANTY":
      return { ownerId: null, ownerRole: ROLES.WARRANTY_OFFICER };
    case "QUALITY_CHECK":
      return { ownerId: job.qualityInspectorId, ownerRole: ROLES.WORKSHOP_MANAGER };
    case "BILLING":
      return normaliseJobStatus(job.status) === "READY"
        ? { ownerId: null, ownerRole: ROLES.BILLING_OFFICER }
        : advisor;
    case "DELIVERY":
      return { ownerId: job.deliveryAdvisorId ?? job.serviceAdvisorId, ownerRole: ROLES.SERVICE_ADVISOR };
    case "CLOSED":
    case "CANCELLED":
      return { ownerId: null, ownerRole: null };
  }
}

const ADMINS = [ROLES.SUPER_ADMIN, ROLES.ADMIN];
const ADVISORS = [ROLES.SERVICE_ADVISOR, ROLES.SERVICE_MANAGER, ...ADMINS];
const SUPERVISORS = [ROLES.WORKSHOP_MANAGER, ROLES.GENERAL_WORKSHOP_MANAGER, ROLES.SERVICE_MANAGER, ...ADMINS];
const WORKSHOP = [...SUPERVISORS, ROLES.TECHNICIAN, ROLES.ENGINEER];
const RELEASERS = [ROLES.SERVICE_ADVISOR, ...SUPERVISORS];
const WARRANTY_ROLES = [ROLES.WARRANTY_OFFICER, ...ADMINS];
const BILLERS = [ROLES.BILLING_OFFICER, ROLES.BILLING_MANAGER, ROLES.GENERAL_BILLING_MANAGER];
/** The roles that can cancel a job today (JOB_TRANSITION_ROLES managers). */
const CANCELLERS = [
  ...ADMINS,
  ROLES.WORKSHOP_MANAGER,
  ROLES.GENERAL_WORKSHOP_MANAGER,
  ROLES.SERVICE_ADVISOR,
  ROLES.SERVICE_MANAGER,
];

/** Roles that work a stage. Anyone else sees it read-only. A technician also has to be the assigned one. */
export const STAGE_ROLES: Record<JobStage, readonly string[]> = {
  CHECK_IN: ADVISORS,
  DIAGNOSIS: WORKSHOP,
  WARRANTY: WARRANTY_ROLES,
  ESTIMATE: ADVISORS,
  REPAIR: WORKSHOP,
  QUALITY_CHECK: SUPERVISORS,
  BILLING: [...ADVISORS, ...BILLERS],
  DELIVERY: ADVISORS,
  CLOSED: [],
  CANCELLED: [],
};

export interface StageFacts {
  stage: JobStage;
  status: string;
  qcStatus: string | null;
  technicianId: string | null;
  complaintCount: number;
  /** Problem text from the existing gate checks, or null when the gate is met. */
  openingSignatureProblem: string | null;
  /** Check-in only: what is still missing on Details, Walk-around and Customer consent. Null at other steps. */
  checkInGates: CheckInGates | null;
  approvalProblem: string | null;
  depositProblem: string | null;
  /** In warranty, an open campaign, or a warranty case. Later phases add items flagged "possible warranty". */
  warrantyRelevant: boolean;
  billed: boolean;
  creditApproved: boolean;
  unansweredCampaigns: number;
}

export interface StageActor {
  id: string;
  role: string;
}

export const STAGE_ACTIONS = [
  "SEND_TO_SUPERVISOR",
  "SEND_TO_WARRANTY",
  "SEND_TO_ADVISOR",
  "WARRANTY_TO_ADVISOR",
  "RELEASE_TO_REPAIR",
  "PAUSE_FOR_PARTS",
  "RESUME_REPAIR",
  "SEND_TO_QC",
  // The forward handoff comes first so it is the primary button while nothing is enabled yet.
  "QC_PASSED_TO_ADVISOR",
  "RETURN_TO_REPAIR",
  "MARK_READY",
  "SEND_TO_DELIVERY",
  "CANCEL",
] as const;
export type StageAction = (typeof STAGE_ACTIONS)[number];

interface ActionRule {
  from: JobStage[];
  to: JobStage | "SAME";
  /** Only offered while the job holds one of these statuses. */
  statuses?: CanonicalStatus[];
  /** The status the existing workflow moves the job to, when the action changes it. */
  toStatus?: WorkflowStatus;
  roles: readonly string[];
  /** A handoff passes the job on; one of them becomes the primary button. */
  kind: "handoff" | "secondary" | "danger";
  requiresNote?: boolean;
  /** Offered only when this holds, for example the warranty route. */
  when?: (facts: StageFacts) => boolean;
  gates: (facts: StageFacts) => string[];
}


const TECHNICIAN_GATE = (facts: StageFacts) =>
  facts.technicianId ? [] : ["Assign a technician to this job first."];
const problems = (...values: (string | null)[]) => values.filter((value): value is string => !!value);

export const ACTION_RULES: Record<StageAction, ActionRule> = {
  SEND_TO_SUPERVISOR: {
    from: ["CHECK_IN"],
    to: "DIAGNOSIS",
    roles: ADVISORS,
    kind: "handoff",
    // Details valid, walk-around saved and consent signed, each reason naming the step that fixes it.
    gates: (facts) => (facts.checkInGates ? allGateReasons(facts.checkInGates) : []),
  },
  SEND_TO_WARRANTY: {
    from: ["DIAGNOSIS"],
    to: "WARRANTY",
    roles: WORKSHOP,
    kind: "handoff",
    when: (facts) => facts.warrantyRelevant,
    gates: TECHNICIAN_GATE,
  },
  SEND_TO_ADVISOR: {
    from: ["DIAGNOSIS"],
    to: "ESTIMATE",
    roles: WORKSHOP,
    kind: "handoff",
    when: (facts) => !facts.warrantyRelevant,
    gates: TECHNICIAN_GATE,
  },
  WARRANTY_TO_ADVISOR: {
    from: ["WARRANTY"],
    to: "ESTIMATE",
    roles: WARRANTY_ROLES,
    kind: "handoff",
    gates: () => [],
  },
  RELEASE_TO_REPAIR: {
    from: ["ESTIMATE"],
    to: "REPAIR",
    toStatus: "IN_PROGRESS",
    roles: RELEASERS,
    kind: "handoff",
    gates: (facts) => [
      ...TECHNICIAN_GATE(facts),
      ...problems(facts.openingSignatureProblem, facts.approvalProblem, facts.depositProblem),
    ],
  },
  PAUSE_FOR_PARTS: {
    from: ["REPAIR"],
    to: "SAME",
    statuses: ["IN_PROGRESS"],
    toStatus: "WAITING_PARTS",
    roles: WORKSHOP,
    kind: "secondary",
    gates: () => [],
  },
  RESUME_REPAIR: {
    from: ["REPAIR"],
    to: "SAME",
    statuses: ["WAITING_PARTS"],
    toStatus: "IN_PROGRESS",
    roles: WORKSHOP,
    kind: "handoff",
    gates: (facts) => problems(facts.openingSignatureProblem, facts.approvalProblem, facts.depositProblem),
  },
  SEND_TO_QC: {
    from: ["REPAIR"],
    to: "QUALITY_CHECK",
    statuses: ["IN_PROGRESS"],
    toStatus: "QC",
    roles: WORKSHOP,
    kind: "handoff",
    gates: (facts) => [...TECHNICIAN_GATE(facts), ...problems(facts.openingSignatureProblem, facts.approvalProblem)],
  },
  RETURN_TO_REPAIR: {
    from: ["QUALITY_CHECK"],
    to: "REPAIR",
    toStatus: "IN_PROGRESS",
    roles: SUPERVISORS,
    kind: "handoff",
    gates: (facts) => [
      ...(facts.qcStatus?.toUpperCase() === "FAILED"
        ? []
        : ["Record a failed quality check before returning the job to the technician."]),
      ...problems(facts.openingSignatureProblem, facts.approvalProblem, facts.depositProblem),
    ],
  },
  QC_PASSED_TO_ADVISOR: {
    from: ["QUALITY_CHECK"],
    to: "BILLING",
    roles: SUPERVISORS,
    kind: "handoff",
    gates: (facts) =>
      facts.qcStatus?.toUpperCase() === "PASSED"
        ? []
        : ["Record a passed quality check before sending the job to the service advisor."],
  },
  MARK_READY: {
    from: ["BILLING"],
    to: "SAME",
    statuses: ["QC"],
    toStatus: "READY",
    // The existing rule: only the service advisor marks a job ready.
    roles: [ROLES.SERVICE_ADVISOR],
    kind: "handoff",
    gates: (facts) => [
      ...(facts.qcStatus?.toUpperCase() === "PASSED" ? [] : ["Record a passed quality check first."]),
      ...(facts.unansweredCampaigns > 0
        ? ["Record whether the campaign work was done for each campaign on this job."]
        : []),
      ...problems(facts.openingSignatureProblem, facts.approvalProblem),
    ],
  },
  SEND_TO_DELIVERY: {
    from: ["BILLING"],
    to: "DELIVERY",
    statuses: ["READY"],
    roles: ADVISORS,
    kind: "handoff",
    gates: (facts) =>
      facts.billed || facts.creditApproved ? [] : ["Create the bill or record credit approval before delivery."],
  },
  CANCEL: {
    from: ["CHECK_IN", "DIAGNOSIS", "WARRANTY", "ESTIMATE", "REPAIR", "QUALITY_CHECK", "BILLING"],
    to: "CANCELLED",
    toStatus: "CANCELLED",
    roles: CANCELLERS,
    kind: "danger",
    requiresNote: true,
    gates: (facts) => (facts.billed ? ["A billed job cannot be cancelled. Cancel the bill first."] : []),
  },
};

export function targetStage(action: StageAction, from: JobStage): JobStage {
  const to = ACTION_RULES[action].to;
  return to === "SAME" ? from : to;
}

/** Can this person work the stage at all (not counting gates)? */
export function canWorkStage(stage: JobStage, actor: StageActor, technicianId: string | null) {
  if (!STAGE_ROLES[stage].includes(actor.role)) return false;
  return actor.role !== ROLES.TECHNICIAN || technicianId === actor.id;
}

function offered(action: StageAction, facts: StageFacts) {
  const rule = ACTION_RULES[action];
  if (!rule.from.includes(facts.stage)) return false;
  if (rule.statuses && !rule.statuses.includes(normaliseJobStatus(facts.status) as CanonicalStatus)) return false;
  return !rule.when || rule.when(facts);
}

function permitted(action: StageAction, facts: StageFacts, actor: StageActor) {
  if (!ACTION_RULES[action].roles.includes(actor.role)) return false;
  // A technician acts only on a job assigned to them.
  return actor.role !== ROLES.TECHNICIAN || facts.technicianId === actor.id;
}

export interface ActionView {
  action: StageAction;
  kind: "primary" | "secondary" | "danger";
  enabled: boolean;
  reasons: string[];
  requiresNote: boolean;
}

/**
 * The actions this person can see on the job now, each with its blocking reasons.
 * At most one is primary: the first enabled handoff, or the first handoff when none is enabled.
 */
export function availableActions(facts: StageFacts, actor: StageActor): ActionView[] {
  const views = STAGE_ACTIONS.filter((action) => offered(action, facts) && permitted(action, facts, actor)).map(
    (action) => {
      const reasons = ACTION_RULES[action].gates(facts);
      return { action, rule: ACTION_RULES[action], enabled: reasons.length === 0, reasons };
    },
  );
  const handoffs = views.filter((view) => view.rule.kind === "handoff");
  const primary = handoffs.find((view) => view.enabled) ?? handoffs[0];
  return views.map(({ action, rule, enabled, reasons }) => ({
    action,
    kind: rule.kind === "danger" ? "danger" : action === primary?.action ? "primary" : "secondary",
    enabled,
    reasons,
    requiresNote: !!rule.requiresNote,
  }));
}

export type ActionCheck =
  | { ok: true; to: JobStage; toStatus?: WorkflowStatus }
  | { ok: false; kind: "unavailable" | "forbidden" | "blocked"; reasons: string[] };

/** The authoritative check before a stage action runs. */
export function checkStageAction(action: StageAction, facts: StageFacts, actor: StageActor): ActionCheck {
  if (!offered(action, facts))
    return {
      ok: false,
      kind: "unavailable",
      reasons: [`This action is not possible while the job is at ${STAGE_LABELS[facts.stage]}. Reload the job to see its current step.`],
    };
  if (!permitted(action, facts, actor))
    return {
      ok: false,
      kind: "forbidden",
      reasons: [
        actor.role === ROLES.TECHNICIAN && ACTION_RULES[action].roles.includes(actor.role)
          ? "Only the technician assigned to this job can do this."
          : "Your role cannot do this on this step.",
      ],
    };
  const reasons = ACTION_RULES[action].gates(facts);
  if (reasons.length) return { ok: false, kind: "blocked", reasons };
  return { ok: true, to: targetStage(action, facts.stage), toStatus: ACTION_RULES[action].toStatus };
}

export type SubStep =
  | "DETAILS"
  | "WALK_AROUND"
  | "CUSTOMER_CONSENT"
  | "SEND_TO_WORKSHOP"
  | "ASSIGN_TECHNICIAN"
  | "FINDINGS"
  | "WARRANTY_REVIEW"
  | "ESTIMATE_APPROVAL"
  | "ADVANCE_PAYMENT"
  | "RELEASE"
  | "WORK"
  | "WAITING_PARTS"
  | "INSPECTION"
  | "QC_PASSED"
  | "QC_FAILED"
  | "MARK_READY"
  | "INVOICE"
  | "HANDOVER";

/** The part of the current step the job is on. Later phases refine these as each stage is rebuilt. */
export function currentSubStep(facts: StageFacts): SubStep | null {
  const status = normaliseJobStatus(facts.status);
  const qc = facts.qcStatus?.toUpperCase();
  switch (facts.stage) {
    case "CHECK_IN":
      return facts.checkInGates ? checkInStep(facts.checkInGates) : "DETAILS";
    case "DIAGNOSIS":
      return facts.technicianId ? "FINDINGS" : "ASSIGN_TECHNICIAN";
    case "WARRANTY":
      return "WARRANTY_REVIEW";
    case "ESTIMATE":
      if (facts.approvalProblem) return "ESTIMATE_APPROVAL";
      return facts.depositProblem ? "ADVANCE_PAYMENT" : "RELEASE";
    case "REPAIR":
      return status === "WAITING_PARTS" ? "WAITING_PARTS" : "WORK";
    case "QUALITY_CHECK":
      return qc === "PASSED" ? "QC_PASSED" : qc === "FAILED" ? "QC_FAILED" : "INSPECTION";
    case "BILLING":
      return status === "READY" ? "INVOICE" : "MARK_READY";
    case "DELIVERY":
      return "HANDOVER";
    default:
      return null;
  }
}

export interface StageAlert {
  code: "PROMISE_PASSED" | "PROMISE_SOON" | "WAITING_PARTS" | "QC_FAILED" | "NO_TECHNICIAN" | "CAMPAIGN_ANSWERS";
  tone: "danger" | "warning";
  message: string;
}

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

/** At most 3 alerts, the most urgent first. */
export function stageAlerts(facts: StageFacts & { promisedAt: Date | null }, now: Date): StageAlert[] {
  const alerts: StageAlert[] = [];
  const open = !["CLOSED", "CANCELLED"].includes(facts.stage);
  if (open && facts.promisedAt && facts.promisedAt.getTime() < now.getTime())
    alerts.push({ code: "PROMISE_PASSED", tone: "danger", message: "The promised delivery time has passed." });
  if (facts.stage === "QUALITY_CHECK" && facts.qcStatus?.toUpperCase() === "FAILED")
    alerts.push({ code: "QC_FAILED", tone: "danger", message: "The quality check failed. Return the job to the technician." });
  if (
    open &&
    facts.promisedAt &&
    facts.promisedAt.getTime() >= now.getTime() &&
    facts.promisedAt.getTime() - now.getTime() < FOUR_HOURS_MS
  )
    alerts.push({ code: "PROMISE_SOON", tone: "warning", message: "The promised delivery time is less than 4 hours away." });
  if (normaliseJobStatus(facts.status) === "WAITING_PARTS")
    alerts.push({ code: "WAITING_PARTS", tone: "warning", message: "Work is paused while the job waits for parts." });
  if (["DIAGNOSIS", "REPAIR"].includes(facts.stage) && !facts.technicianId)
    alerts.push({ code: "NO_TECHNICIAN", tone: "warning", message: "No technician is assigned to this job." });
  if (facts.stage === "BILLING" && facts.unansweredCampaigns > 0)
    alerts.push({
      code: "CAMPAIGN_ANSWERS",
      tone: "warning",
      message: "Campaign work on this job still needs a done or not done answer.",
    });
  return alerts.slice(0, 3);
}

export interface StageEventFact {
  fromStage: JobStage | null;
  toStage: JobStage;
  actorName: string | null;
  createdAt: Date;
}

export interface StageSummary {
  stage: (typeof STAGE_ORDER)[number];
  state: "COMPLETED" | "SKIPPED";
  /** Null for jobs created before the staged job card: shown as "Not provided". */
  by: string | null;
  at: Date | null;
}

/** The step a cancelled job was at when it was cancelled, from its event log. */
export function stageBeforeCancel(events: StageEventFact[]): JobStage | null {
  const cancel = [...events].reverse().find((event) => event.toStage === "CANCELLED");
  return cancel?.fromStage ?? null;
}

/** One line per completed or skipped step before the current one, oldest first. */
export function stageSummaries(stage: JobStage, events: StageEventFact[]): StageSummary[] {
  const reached =
    stage === "CLOSED"
      ? STAGE_ORDER.length
      : stage === "CANCELLED"
        ? STAGE_ORDER.indexOf((stageBeforeCancel(events) ?? "CHECK_IN") as (typeof STAGE_ORDER)[number])
        : STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number]);
  const warrantyVisited = events.some((event) => event.toStage === "WARRANTY");
  const warrantySkipped = !warrantyVisited && events.some((event) => event.fromStage === "DIAGNOSIS" && event.toStage === "ESTIMATE");
  return STAGE_ORDER.slice(0, Math.max(reached, 0)).map((step) => {
    if (step === "WARRANTY" && warrantySkipped) return { stage: step, state: "SKIPPED", by: null, at: null };
    const left = [...events].reverse().find((event) => event.fromStage === step && event.toStage !== step);
    return { stage: step, state: "COMPLETED", by: left?.actorName ?? null, at: left?.createdAt ?? null };
  });
}

/**
 * The header's Warranty or Non-warranty tag, as on the paper job card: the vehicle was under
 * warranty when the job opened, or the job has a warranty case. Campaigns alone do not make it a
 * warranty job. TODO(confirm): whether goodwill-only jobs should also show "Warranty".
 */
export function isWarrantyJob(coverageAtOpening: string | null | undefined, hasWarrantyCase: boolean): boolean {
  return coverageAtOpening === "ACTIVE" || hasWarrantyCase;
}

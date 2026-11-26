import { ROLES } from "../../shared/constants/roles";
import { JOB_TRANSITION_ROLES } from "./job-transitions";
import {
  isWarrantyJob,
  ACTION_RULES,
  ALL_STAGES,
  CANONICAL_STATUSES,
  STAGE_ACTIONS,
  STAGE_STATUSES,
  availableActions,
  canWorkStage,
  checkStageAction,
  currentSubStep,
  legacyStatusForStage,
  normaliseJobStatus,
  reconcileStage,
  stageAlerts,
  stageAllowsStatus,
  stageForLegacyStatus,
  stageOwnerFor,
  stageSummaries,
  type StageAction,
  type StageFacts,
} from "./job-stage.logic";

const TECH = "tech-1";
const facts = (overrides: Partial<StageFacts> = {}): StageFacts => ({
  stage: "CHECK_IN",
  status: "OPEN",
  qcStatus: "PENDING",
  technicianId: TECH,
  complaintCount: 2,
  openingSignatureProblem: null,
  checkInGates: { details: [], walkAround: [], consent: [] },
  approvalProblem: null,
  depositProblem: null,
  warrantyRelevant: false,
  billed: false,
  creditApproved: false,
  unansweredCampaigns: 0,
  ...overrides,
});
const advisor = { id: "advisor-1", role: ROLES.SERVICE_ADVISOR };
const supervisor = { id: "wm-1", role: ROLES.WORKSHOP_MANAGER };
const technician = { id: TECH, role: ROLES.TECHNICIAN };
const otherTechnician = { id: "tech-2", role: ROLES.TECHNICIAN };
const warrantyOfficer = { id: "wo-1", role: ROLES.WARRANTY_OFFICER };
const billing = { id: "bo-1", role: ROLES.BILLING_OFFICER };
const ccu = { id: "ccu-1", role: ROLES.CCU_OFFICER };

describe("status spellings and the stage mapping", () => {
  it.each([
    ["Open", "OPEN", "ESTIMATE"],
    ["Pending", "OPEN", "ESTIMATE"],
    ["OPEN", "OPEN", "ESTIMATE"],
    ["In Progress", "IN_PROGRESS", "REPAIR"],
    ["On Hold", "IN_PROGRESS", "REPAIR"],
    ["IN_PROGRESS", "IN_PROGRESS", "REPAIR"],
    ["WAITING_PARTS", "WAITING_PARTS", "REPAIR"],
    ["Quality Check", "QC", "QUALITY_CHECK"],
    ["QC", "QC", "QUALITY_CHECK"],
    ["Ready", "READY", "BILLING"],
    ["Completed", "READY", "BILLING"],
    ["COMPLETED", "READY", "BILLING"],
    ["READY", "READY", "BILLING"],
    ["Billed", "BILLED", "DELIVERY"],
    ["BILLED", "BILLED", "DELIVERY"],
    ["Closed", "DELIVERED", "CLOSED"],
    ["CLOSED", "DELIVERED", "CLOSED"],
    ["Delivered", "DELIVERED", "CLOSED"],
    ["DELIVERED", "DELIVERED", "CLOSED"],
    ["Cancelled", "CANCELLED", "CANCELLED"],
    ["Canceled", "CANCELLED", "CANCELLED"],
    ["CANCELED", "CANCELLED", "CANCELLED"],
    ["CANCELLED", "CANCELLED", "CANCELLED"],
  ])("%s normalises to %s at stage %s", (status, canonical, stage) => {
    expect(normaliseJobStatus(status)).toBe(canonical);
    expect(stageForLegacyStatus(status)).toBe(stage);
    expect(stageAllowsStatus(stage as never, status)).toBe(true);
  });

  it("treats an unknown status as open work at the estimate stage", () => {
    expect(normaliseJobStatus("Weird")).toBeNull();
    expect(stageForLegacyStatus("Weird")).toBe("ESTIMATE");
    expect(stageAllowsStatus("ESTIMATE", "Weird")).toBe(false);
  });

  it("maps every client status alias the same way as the server", () => {
    // features/job-cards/types/job-card-status.ts on the client.
    const client: Record<string, string> = {
      Open: "OPEN", Pending: "OPEN", "In Progress": "IN_PROGRESS", "On Hold": "IN_PROGRESS",
      "Quality Check": "QC", Ready: "READY", Completed: "READY", Billed: "BILLED", Closed: "DELIVERED",
      CLOSED: "DELIVERED", Delivered: "DELIVERED", Cancelled: "CANCELLED", Canceled: "CANCELLED", CANCELED: "CANCELLED",
    };
    for (const [legacy, canonical] of Object.entries(client)) expect(normaliseJobStatus(legacy)).toBe(canonical);
  });
});

describe("legacyStatusForStage", () => {
  it.each([
    ["CHECK_IN", {}, "OPEN"],
    ["DIAGNOSIS", {}, "OPEN"],
    ["WARRANTY", {}, "OPEN"],
    ["ESTIMATE", {}, "OPEN"],
    ["REPAIR", {}, "IN_PROGRESS"],
    ["REPAIR", { waitingParts: true }, "WAITING_PARTS"],
    ["QUALITY_CHECK", {}, "QC"],
    ["BILLING", {}, "QC"],
    ["BILLING", { markedReady: true }, "READY"],
    ["DELIVERY", {}, "READY"],
    ["DELIVERY", { billed: true }, "BILLED"],
    ["CLOSED", {}, "DELIVERED"],
    ["CANCELLED", {}, "CANCELLED"],
  ] as const)("%s with %j holds %s", (stage, flags, status) => {
    expect(legacyStatusForStage(stage, flags)).toBe(status);
    expect(stageAllowsStatus(stage, status)).toBe(true);
  });

  it("round-trips: the stage of a job's legacy status allows that status", () => {
    for (const status of CANONICAL_STATUSES) expect(stageAllowsStatus(stageForLegacyStatus(status), status)).toBe(true);
  });

  it("gives every stage at least one status", () => {
    for (const stage of ALL_STAGES) expect(STAGE_STATUSES[stage].length).toBeGreaterThan(0);
  });
});

describe("reconcileStage keeps the stage in step with any status change", () => {
  it.each([
    ["CHECK_IN", "OPEN", null, false, "CHECK_IN"],
    ["DIAGNOSIS", "OPEN", null, false, "DIAGNOSIS"],
    ["ESTIMATE", "IN_PROGRESS", null, false, "REPAIR"],
    ["CHECK_IN", "IN_PROGRESS", null, false, "REPAIR"],
    ["REPAIR", "WAITING_PARTS", null, false, "REPAIR"],
    ["REPAIR", "QC", "PENDING", false, "QUALITY_CHECK"],
    ["QUALITY_CHECK", "IN_PROGRESS", "PENDING", false, "REPAIR"],
    ["BILLING", "QC", "PASSED", false, "BILLING"],
    ["BILLING", "QC", "PENDING", false, "QUALITY_CHECK"],
    ["BILLING", "QC", "FAILED", false, "QUALITY_CHECK"],
    ["BILLING", "READY", "PASSED", false, "BILLING"],
    ["BILLING", "BILLED", "PASSED", false, "DELIVERY"],
    ["DELIVERY", "READY", "PASSED", false, "BILLING"],
    ["DELIVERY", "READY", "PASSED", true, "DELIVERY"],
    ["DELIVERY", "DELIVERED", "PASSED", false, "CLOSED"],
    ["BILLING", "DELIVERED", "PASSED", true, "CLOSED"],
    ["BILLING", "IN_PROGRESS", "PENDING", false, "REPAIR"],
    ["ESTIMATE", "CANCELLED", null, false, "CANCELLED"],
    ["CLOSED", "OPEN", null, false, "ESTIMATE"],
    ["REPAIR", "Weird", null, false, "REPAIR"],
  ] as const)("%s + %s (QC %s, credit %s) is %s", (current, status, qc, credit, expected) => {
    const stage = reconcileStage(current, status, qc, credit);
    expect(stage).toBe(expected);
    if (normaliseJobStatus(status)) expect(stageAllowsStatus(stage, status)).toBe(true);
  });
});

describe("stageOwnerFor", () => {
  const job = { status: "OPEN", serviceAdvisorId: "sa", technicianId: null, qualityInspectorId: null, deliveryAdvisorId: null };
  it("names the advisor at check-in and estimate", () => {
    expect(stageOwnerFor("CHECK_IN", job)).toEqual({ ownerId: "sa", ownerRole: ROLES.SERVICE_ADVISOR });
    expect(stageOwnerFor("ESTIMATE", job)).toEqual({ ownerId: "sa", ownerRole: ROLES.SERVICE_ADVISOR });
  });
  it("gives diagnosis and repair to the supervisor until a technician is assigned", () => {
    expect(stageOwnerFor("DIAGNOSIS", job)).toEqual({ ownerId: null, ownerRole: ROLES.WORKSHOP_MANAGER });
    expect(stageOwnerFor("REPAIR", { ...job, technicianId: "t" })).toEqual({ ownerId: "t", ownerRole: ROLES.TECHNICIAN });
  });
  it("gives warranty to the warranty officers and QC to the inspector or supervisor", () => {
    expect(stageOwnerFor("WARRANTY", job)).toEqual({ ownerId: null, ownerRole: ROLES.WARRANTY_OFFICER });
    expect(stageOwnerFor("QUALITY_CHECK", { ...job, qualityInspectorId: "qi" })).toEqual({ ownerId: "qi", ownerRole: ROLES.WORKSHOP_MANAGER });
  });
  it("gives billing to the advisor until ready, then to billing", () => {
    expect(stageOwnerFor("BILLING", { ...job, status: "QC" })).toEqual({ ownerId: "sa", ownerRole: ROLES.SERVICE_ADVISOR });
    expect(stageOwnerFor("BILLING", { ...job, status: "READY" })).toEqual({ ownerId: null, ownerRole: ROLES.BILLING_OFFICER });
  });
  it("prefers the delivery advisor at delivery and has no owner once closed", () => {
    expect(stageOwnerFor("DELIVERY", { ...job, deliveryAdvisorId: "da" })).toEqual({ ownerId: "da", ownerRole: ROLES.SERVICE_ADVISOR });
    expect(stageOwnerFor("CLOSED", job)).toEqual({ ownerId: null, ownerRole: null });
    expect(stageOwnerFor("CANCELLED", job)).toEqual({ ownerId: null, ownerRole: null });
  });
});

describe("action rules stay within the existing workflow", () => {
  it("only lets roles move a status that JOB_TRANSITION_ROLES already allows", () => {
    for (const action of STAGE_ACTIONS) {
      const rule = ACTION_RULES[action];
      if (!rule.toStatus) continue;
      const fromStatuses = rule.statuses ?? rule.from.flatMap((stage) => STAGE_STATUSES[stage]);
      for (const from of new Set(fromStatuses))
        for (const role of rule.roles)
          expect({ action, from, role, allowed: JOB_TRANSITION_ROLES[from]?.[rule.toStatus]?.includes(role) ?? false }).toEqual({
            action, from, role, allowed: true,
          });
    }
  });
});

describe("allowed and blocked moves", () => {
  const names = (list: { action: StageAction }[]) => list.map((view) => view.action);

  it("check-in: the advisor sends to the supervisor once details, walk-around and consent are in place", () => {
    expect(availableActions(facts(), advisor)).toEqual([
      { action: "SEND_TO_SUPERVISOR", kind: "primary", enabled: true, reasons: [], requiresNote: false },
      { action: "CANCEL", kind: "danger", enabled: true, reasons: [], requiresNote: true },
    ]);
    const gates = {
      details: ["Add at least one customer request on Details."],
      walkAround: ["Record the fuel level on Walk-around."],
      consent: ["Get the customer's signature on Customer consent."],
    };
    const blocked = checkStageAction("SEND_TO_SUPERVISOR", facts({ checkInGates: gates }), advisor);
    // Every missing gate is a reason, in step order.
    expect(blocked).toEqual({ ok: false, kind: "blocked", reasons: [...gates.details, ...gates.walkAround, ...gates.consent] });
    expect(checkStageAction("SEND_TO_SUPERVISOR", facts(), advisor)).toEqual({ ok: true, to: "DIAGNOSIS", toStatus: undefined });
  });

  it("check-in is read-only for the technician and the warranty officer", () => {
    expect(availableActions(facts(), technician)).toEqual([]);
    expect(canWorkStage("CHECK_IN", technician, TECH)).toBe(false);
    expect(checkStageAction("SEND_TO_SUPERVISOR", facts(), warrantyOfficer)).toMatchObject({ ok: false, kind: "forbidden" });
  });

  it("diagnosis: warranty route when relevant, straight to the advisor otherwise", () => {
    const relevant = facts({ stage: "DIAGNOSIS", warrantyRelevant: true });
    expect(names(availableActions(relevant, supervisor))).toEqual(["SEND_TO_WARRANTY", "CANCEL"]);
    expect(checkStageAction("SEND_TO_ADVISOR", relevant, supervisor)).toMatchObject({ ok: false, kind: "unavailable" });
    const plain = facts({ stage: "DIAGNOSIS" });
    expect(names(availableActions(plain, technician))).toEqual(["SEND_TO_ADVISOR"]);
    expect(checkStageAction("SEND_TO_ADVISOR", plain, technician)).toEqual({ ok: true, to: "ESTIMATE", toStatus: undefined });
  });

  it("diagnosis needs an assigned technician, and only that technician can act", () => {
    const unassigned = facts({ stage: "DIAGNOSIS", technicianId: null });
    expect(checkStageAction("SEND_TO_ADVISOR", unassigned, supervisor)).toEqual({
      ok: false, kind: "blocked", reasons: ["Assign a technician to this job first."],
    });
    expect(checkStageAction("SEND_TO_ADVISOR", facts({ stage: "DIAGNOSIS" }), otherTechnician)).toEqual({
      ok: false, kind: "forbidden", reasons: ["Only the technician assigned to this job can do this."],
    });
    expect(canWorkStage("DIAGNOSIS", otherTechnician, TECH)).toBe(false);
    expect(canWorkStage("DIAGNOSIS", technician, TECH)).toBe(true);
  });

  it("warranty: only the warranty officer hands back to the advisor", () => {
    const warranty = facts({ stage: "WARRANTY", warrantyRelevant: true });
    expect(checkStageAction("WARRANTY_TO_ADVISOR", warranty, warrantyOfficer)).toEqual({ ok: true, to: "ESTIMATE", toStatus: undefined });
    expect(checkStageAction("WARRANTY_TO_ADVISOR", warranty, advisor)).toMatchObject({ ok: false, kind: "forbidden" });
    expect(canWorkStage("WARRANTY", advisor, TECH)).toBe(false);
  });

  it("estimate: release to repair runs every existing gate", () => {
    const estimate = facts({ stage: "ESTIMATE" });
    expect(checkStageAction("RELEASE_TO_REPAIR", estimate, advisor)).toEqual({ ok: true, to: "REPAIR", toStatus: "IN_PROGRESS" });
    expect(
      checkStageAction(
        "RELEASE_TO_REPAIR",
        facts({ stage: "ESTIMATE", technicianId: null, approvalProblem: "Approve the estimate", depositProblem: "Record an advance" }),
        advisor,
      ),
    ).toEqual({ ok: false, kind: "blocked", reasons: ["Assign a technician to this job first.", "Approve the estimate", "Record an advance"] });
    expect(checkStageAction("RELEASE_TO_REPAIR", estimate, technician)).toMatchObject({ ok: false, kind: "forbidden" });
    expect(checkStageAction("RELEASE_TO_REPAIR", estimate, billing)).toMatchObject({ ok: false, kind: "forbidden" });
  });

  it("repair: pause, resume and send to QC, for the assigned technician", () => {
    const repair = facts({ stage: "REPAIR", status: "IN_PROGRESS" });
    expect(availableActions(repair, technician).map(({ action, kind }) => [action, kind])).toEqual([
      ["PAUSE_FOR_PARTS", "secondary"],
      ["SEND_TO_QC", "primary"],
    ]);
    expect(checkStageAction("PAUSE_FOR_PARTS", repair, technician)).toEqual({ ok: true, to: "REPAIR", toStatus: "WAITING_PARTS" });
    expect(checkStageAction("SEND_TO_QC", repair, technician)).toEqual({ ok: true, to: "QUALITY_CHECK", toStatus: "QC" });
    const paused = facts({ stage: "REPAIR", status: "WAITING_PARTS" });
    expect(names(availableActions(paused, technician))).toEqual(["RESUME_REPAIR"]);
    expect(checkStageAction("SEND_TO_QC", paused, technician)).toMatchObject({ ok: false, kind: "unavailable" });
    expect(checkStageAction("SEND_TO_QC", repair, otherTechnician)).toMatchObject({ ok: false, kind: "forbidden" });
  });

  it("quality check: pass goes to the advisor, fail goes back to the technician", () => {
    const pending = facts({ stage: "QUALITY_CHECK", status: "QC", qcStatus: "PENDING" });
    const views = availableActions(pending, supervisor);
    expect(views.find((view) => view.action === "QC_PASSED_TO_ADVISOR")).toMatchObject({
      kind: "primary", enabled: false, reasons: ["Record a passed quality check before sending the job to the service advisor."],
    });
    const failed = facts({ stage: "QUALITY_CHECK", status: "QC", qcStatus: "FAILED" });
    expect(availableActions(failed, supervisor).find((view) => view.kind === "primary")?.action).toBe("RETURN_TO_REPAIR");
    expect(checkStageAction("RETURN_TO_REPAIR", failed, supervisor)).toEqual({ ok: true, to: "REPAIR", toStatus: "IN_PROGRESS" });
    expect(checkStageAction("QC_PASSED_TO_ADVISOR", facts({ stage: "QUALITY_CHECK", status: "QC", qcStatus: "passed" }), supervisor)).toEqual({
      ok: true, to: "BILLING", toStatus: undefined,
    });
    expect(checkStageAction("QC_PASSED_TO_ADVISOR", failed, technician)).toMatchObject({ ok: false, kind: "forbidden" });
  });

  it("billing: only the service advisor marks ready, then credit or a bill sends it to delivery", () => {
    const billingQc = facts({ stage: "BILLING", status: "QC", qcStatus: "PASSED" });
    expect(checkStageAction("MARK_READY", billingQc, advisor)).toEqual({ ok: true, to: "BILLING", toStatus: "READY" });
    expect(checkStageAction("MARK_READY", billingQc, { id: "admin", role: ROLES.ADMIN })).toMatchObject({ ok: false, kind: "forbidden" });
    expect(checkStageAction("MARK_READY", { ...billingQc, unansweredCampaigns: 1 }, advisor)).toEqual({
      ok: false, kind: "blocked", reasons: ["Record whether the campaign work was done for each campaign on this job."],
    });
    const ready = facts({ stage: "BILLING", status: "READY", qcStatus: "PASSED" });
    expect(checkStageAction("SEND_TO_DELIVERY", ready, advisor)).toEqual({
      ok: false, kind: "blocked", reasons: ["Create the bill or record credit approval before delivery."],
    });
    expect(checkStageAction("SEND_TO_DELIVERY", { ...ready, creditApproved: true }, advisor)).toEqual({ ok: true, to: "DELIVERY", toStatus: undefined });
    expect(canWorkStage("BILLING", billing, null)).toBe(true);
  });

  it("cancel: managers only, before billing, with a reason", () => {
    expect(checkStageAction("CANCEL", facts({ stage: "REPAIR", status: "IN_PROGRESS" }), supervisor)).toEqual({
      ok: true, to: "CANCELLED", toStatus: "CANCELLED",
    });
    expect(checkStageAction("CANCEL", facts({ stage: "BILLING", status: "READY", billed: true }), advisor)).toEqual({
      ok: false, kind: "blocked", reasons: ["A billed job cannot be cancelled. Cancel the bill first."],
    });
    expect(checkStageAction("CANCEL", facts({ stage: "DELIVERY", status: "BILLED" }), advisor)).toMatchObject({ ok: false, kind: "unavailable" });
    expect(checkStageAction("CANCEL", facts(), technician)).toMatchObject({ ok: false, kind: "forbidden" });
    expect(ACTION_RULES.CANCEL.requiresNote).toBe(true);
  });

  it("closed and cancelled jobs have no actions and are read-only for everyone", () => {
    for (const stage of ["CLOSED", "CANCELLED"] as const) {
      expect(availableActions(facts({ stage, status: stage === "CLOSED" ? "DELIVERED" : "CANCELLED" }), advisor)).toEqual([]);
      expect(canWorkStage(stage, { id: "x", role: ROLES.SUPER_ADMIN }, null)).toBe(false);
    }
  });

  it("gives roles outside the workshop nothing to do", () => {
    for (const stage of ALL_STAGES) expect(availableActions(facts({ stage }), ccu)).toEqual([]);
  });
});

describe("sub-step, alerts and summaries", () => {
  it("names the current sub-step", () => {
    expect(currentSubStep(facts({ checkInGates: { details: ["x"], walkAround: ["y"], consent: ["z"] } }))).toBe("DETAILS");
    expect(currentSubStep(facts({ checkInGates: { details: [], walkAround: ["y"], consent: ["z"] } }))).toBe("WALK_AROUND");
    expect(currentSubStep(facts({ checkInGates: { details: [], walkAround: [], consent: ["z"] } }))).toBe("CUSTOMER_CONSENT");
    expect(currentSubStep(facts())).toBe("SEND_TO_WORKSHOP");
    expect(currentSubStep(facts({ stage: "DIAGNOSIS", technicianId: null }))).toBe("ASSIGN_TECHNICIAN");
    expect(currentSubStep(facts({ stage: "ESTIMATE", approvalProblem: "x" }))).toBe("ESTIMATE_APPROVAL");
    expect(currentSubStep(facts({ stage: "ESTIMATE", depositProblem: "x" }))).toBe("ADVANCE_PAYMENT");
    expect(currentSubStep(facts({ stage: "REPAIR", status: "WAITING_PARTS" }))).toBe("WAITING_PARTS");
    expect(currentSubStep(facts({ stage: "QUALITY_CHECK", status: "QC", qcStatus: "FAILED" }))).toBe("QC_FAILED");
    expect(currentSubStep(facts({ stage: "BILLING", status: "READY" }))).toBe("INVOICE");
    expect(currentSubStep(facts({ stage: "CLOSED", status: "DELIVERED" }))).toBeNull();
  });

  it("orders alerts by urgency and shows at most 3", () => {
    const now = new Date("2026-11-25T10:00:00Z");
    const alerts = stageAlerts(
      { ...facts({ stage: "REPAIR", status: "WAITING_PARTS", technicianId: null }), promisedAt: new Date("2026-11-25T09:00:00Z") },
      now,
    );
    expect(alerts.map((alert) => alert.code)).toEqual(["PROMISE_PASSED", "WAITING_PARTS", "NO_TECHNICIAN"]);
    expect(stageAlerts({ ...facts(), promisedAt: new Date("2026-11-25T12:00:00Z") }, now).map((a) => a.code)).toEqual(["PROMISE_SOON"]);
    expect(stageAlerts({ ...facts({ stage: "CLOSED", status: "DELIVERED" }), promisedAt: new Date("2026-11-24T00:00:00Z") }, now)).toEqual([]);
  });

  it("summarises completed steps, marks a skipped warranty step and shows legacy steps without names", () => {
    const at = (hour: number) => new Date(`2026-11-25T${String(hour).padStart(2, "0")}:00:00Z`);
    const events = [
      { fromStage: null, toStage: "CHECK_IN" as const, actorName: "Chidi Eze", createdAt: at(8) },
      { fromStage: "CHECK_IN" as const, toStage: "DIAGNOSIS" as const, actorName: "Chidi Eze", createdAt: at(9) },
      { fromStage: "DIAGNOSIS" as const, toStage: "ESTIMATE" as const, actorName: "Musa Abdullahi", createdAt: at(10) },
    ];
    expect(stageSummaries("ESTIMATE", events)).toEqual([
      { stage: "CHECK_IN", state: "COMPLETED", by: "Chidi Eze", at: at(9) },
      { stage: "DIAGNOSIS", state: "COMPLETED", by: "Musa Abdullahi", at: at(10) },
      { stage: "WARRANTY", state: "SKIPPED", by: null, at: null },
    ]);
    expect(stageSummaries("REPAIR", []).map((row) => [row.stage, row.by])).toEqual([
      ["CHECK_IN", null], ["DIAGNOSIS", null], ["WARRANTY", null], ["ESTIMATE", null],
    ]);
    expect(stageSummaries("CLOSED", [])).toHaveLength(8);
    const cancelled = [...events, { fromStage: "ESTIMATE" as const, toStage: "CANCELLED" as const, actorName: "Tunde Bakare", createdAt: at(11) }];
    expect(stageSummaries("CANCELLED", cancelled).map((row) => row.stage)).toEqual(["CHECK_IN", "DIAGNOSIS", "WARRANTY"]);
  });
});

describe("isWarrantyJob", () => {
  it("tags the job Warranty when the vehicle was covered at opening or a warranty case exists", () => {
    expect(isWarrantyJob("ACTIVE", false)).toBe(true);
    expect(isWarrantyJob("EXPIRED", true)).toBe(true);
    expect(isWarrantyJob("EXPIRED", false)).toBe(false);
    expect(isWarrantyJob(null, false)).toBe(false);
    expect(isWarrantyJob(undefined, false)).toBe(false);
  });
});

import {
  chargeTypeFor,
  lagosDayStart,
  moveWorkLine,
  myJobNextAction,
  partRows,
  partsReadiness,
  pauseLine,
  qualityCheckGate,
  repairFindingBody,
  secondsWorked,
  workLinePlans,
  type WorkLineState,
} from "./job-repair.logic";
import { governingEstimate } from "./estimate-approval";
import { checkStageAction } from "./job-stage.logic";
import { workshopRecipients } from "../notification/workshop-notification-outbox";

const at = (time: string) => new Date(`2026-11-27T${time}:00.000Z`);
const fresh: WorkLineState = { status: "NOT_STARTED", startedAt: null, resumedAt: null, workedSeconds: 0, doneAt: null };

describe("work line state machine", () => {
  it("starts, then finishes with the time worked", () => {
    const started = moveWorkLine(fresh, "START", at("09:00"), false);
    expect(started).toMatchObject({ ok: true, changed: true, next: { status: "IN_PROGRESS", startedAt: at("09:00"), resumedAt: at("09:00") } });
    if (!started.ok) throw new Error("start failed");
    const done = moveWorkLine(started.next, "DONE", at("10:20"), false);
    expect(done).toMatchObject({ ok: true, next: { status: "DONE", workedSeconds: 80 * 60, doneAt: at("10:20"), resumedAt: null } });
  });

  it("adds time across a wait for parts", () => {
    const running = { ...fresh, status: "IN_PROGRESS" as const, startedAt: at("08:00"), resumedAt: at("08:00") };
    const waiting = moveWorkLine(running, "WAIT_PARTS", at("08:30"), false);
    if (!waiting.ok) throw new Error("wait failed");
    expect(waiting.next).toMatchObject({ status: "WAITING_PARTS", workedSeconds: 1800, resumedAt: null });
    const resumed = moveWorkLine(waiting.next, "START", at("11:00"), false);
    if (!resumed.ok) throw new Error("resume failed");
    expect(resumed.next.startedAt).toEqual(at("08:00"));
    const done = moveWorkLine(resumed.next, "DONE", at("11:15"), false);
    expect(done.ok && done.next.workedSeconds).toBe(2700);
  });

  it("a line can wait for parts before it starts", () => {
    expect(moveWorkLine(fresh, "WAIT_PARTS", at("09:00"), false)).toMatchObject({ ok: true, next: { status: "WAITING_PARTS", workedSeconds: 0 } });
  });

  it("refuses Done before Start, anything after Done, and Start while the job is paused", () => {
    expect(moveWorkLine(fresh, "DONE", at("09:00"), false)).toEqual({ ok: false, reason: "Start this work before you mark it done." });
    const done = { ...fresh, status: "DONE" as const };
    expect(moveWorkLine(done, "START", at("09:00"), false)).toEqual({ ok: false, reason: "This work is already done." });
    expect(moveWorkLine(fresh, "START", at("09:00"), true)).toEqual({ ok: false, reason: "The job is paused for parts. Resume the job first." });
  });

  it("repeating the move a line is already in changes nothing", () => {
    const running = { ...fresh, status: "IN_PROGRESS" as const, startedAt: at("08:00"), resumedAt: at("08:00") };
    expect(moveWorkLine(running, "START", at("09:00"), false)).toEqual({ ok: true, changed: false, next: running });
  });

  it("pausing the job stops the clock on running lines only", () => {
    const running = { ...fresh, status: "IN_PROGRESS" as const, startedAt: at("08:00"), resumedAt: at("08:00"), workedSeconds: 60 };
    expect(pauseLine(running, at("08:10"))).toMatchObject({ status: "WAITING_PARTS", workedSeconds: 660, resumedAt: null });
    expect(pauseLine(fresh, at("08:10"))).toBe(fresh);
    expect(secondsWorked(running, at("08:01"))).toBe(120);
  });
});

describe("send for quality check gate", () => {
  it("needs every line done", () => {
    expect(qualityCheckGate({ lines: ["DONE", "IN_PROGRESS", "NOT_STARTED"], findingsWithoutEstimate: 0, supplementaryPending: false })).toEqual([
      "Finish all work first: 2 items left.",
    ]);
    expect(qualityCheckGate({ lines: ["DONE", "WAITING_PARTS"], findingsWithoutEstimate: 0, supplementaryPending: false })).toEqual(["Finish all work first: 1 item left."]);
    expect(qualityCheckGate({ lines: ["DONE", "DONE"], findingsWithoutEstimate: 0, supplementaryPending: false })).toEqual([]);
  });

  it("waits for the customer's answer on new findings", () => {
    expect(qualityCheckGate({ lines: ["DONE"], findingsWithoutEstimate: 1, supplementaryPending: false })).toEqual([
      "A new finding is waiting for the service advisor's supplementary estimate.",
    ]);
    expect(qualityCheckGate({ lines: ["DONE"], findingsWithoutEstimate: 2, supplementaryPending: true })).toEqual([
      "2 new findings are waiting for the service advisor's supplementary estimate.",
      "The customer has not answered the supplementary estimate yet.",
    ]);
  });

  it("a job released before work lines existed is not blocked by them", () => {
    expect(qualityCheckGate({ lines: [], findingsWithoutEstimate: 0, supplementaryPending: false })).toEqual([]);
  });
});

describe("parts card", () => {
  const issue = (id: string, part: string, quantity: number, received?: string) => ({
    id,
    sparePartId: part,
    description: part,
    quantity,
    issuedAt: at("10:00"),
    issuedBy: "Ibrahim Sule",
    receivedAt: received ? at(received) : null,
    receivedBy: received ? "Musa Abdullahi" : null,
  });
  const requested = (part: string, quantity: number) => ({ sparePartId: part, description: part, quantity, requestedAt: at("09:00") });

  it("counts parts ready to collect out of those not yet collected", () => {
    const rows = partRows(
      [requested("pads", 1), requested("filter", 1), requested("compressor", 1), requested("oil", 4)],
      [issue("i1", "pads", 1), issue("i2", "filter", 1, "11:00"), issue("i3", "oil", 2)],
    );
    expect(rows.map((row) => [row.sparePartId, row.status])).toEqual([
      ["pads", "READY"],
      ["filter", "COLLECTED"],
      ["compressor", "REQUESTED"],
      ["oil", "READY"],
    ]);
    expect(partsReadiness(rows)).toEqual({ ready: 2, outstanding: 3, total: 4 });
    expect(rows[1]).toMatchObject({ collectedBy: "Musa Abdullahi", collectedAt: at("11:00"), issuedBy: "Ibrahim Sule" });
  });

  it("shows a partly collected part, and ignores cancelled issues", () => {
    const rows = partRows([requested("oil", 4)], [issue("i1", "oil", 2, "11:00"), issue("i2", "oil", 0)]);
    expect(rows[0]).toMatchObject({ status: "PARTLY_COLLECTED", issued: 2, collected: 2, requested: 4 });
  });

  it("a part issued without a request still shows", () => {
    expect(partRows([], [issue("i1", "wiper", 1)])[0]).toMatchObject({ requested: 1, status: "READY" });
  });
});

describe("work lines from an approved revision", () => {
  const line = (id: string, type: string, referenceId: string, customerDecision: "APPROVED" | "DECLINED" | null, sortOrder: number) => ({
    id,
    type,
    referenceId,
    description: id,
    quantity: { toString: () => "1.50" },
    payer: "CUSTOMER" as const,
    customerDecision,
    sortOrder,
    campaignId: null,
  });

  it("takes the service and approved labour, never parts or declined work", () => {
    const plans = workLinePlans(
      [line("service", "SERVICE", "s1", "APPROVED", 0), line("pads", "PART", "p1", "APPROVED", 1), line("brakes", "LABOUR", "l1", "APPROVED", 2), line("wiper", "LABOUR", "l2", "DECLINED", 3), line("inc", "INCLUDED_LABOUR", "l3", null, 4)],
      new Set(),
      false,
    );
    expect(plans.map((plan) => [plan.sourceKey, plan.kind, plan.labourItemId, plan.quantity])).toEqual([
      ["SERVICE:s1", "SERVICE", null, "1.50"],
      ["LABOUR:l1", "LABOUR", "l1", "1.50"],
      ["LABOUR:l3", "LABOUR", "l3", "1.50"],
    ]);
  });

  it("skips work that already has a line, so a supplementary adds only the new work", () => {
    const plans = workLinePlans([line("service", "SERVICE", "s1", "APPROVED", 0), line("wiper", "LABOUR", "l2", "APPROVED", 1)], new Set(["SERVICE:s1"]), true);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ sourceKey: "LABOUR:l2", supplementary: true });
  });

  it("charges the labour slip by who pays", () => {
    expect(chargeTypeFor("CAMPAIGN")).toBe("FREE");
    expect(chargeTypeFor("WARRANTY")).toBe("WARRANTY");
    expect(chargeTypeFor("CUSTOMER")).toBe("CUSTOMER");
  });
});

describe("governing estimate while a supplementary waits", () => {
  const revision = (id: string, supplementary: boolean, approved: boolean | null, status: string) => ({
    id,
    supplementary,
    status,
    amount: 0,
    lines: [],
    approvals: approved === null ? [] : [{ approved, customerId: "c1", channel: "PHONE" as const, contentHash: null }],
  });

  it("uses the replaced revision, with its decision, until the customer answers", () => {
    const governing = governingEstimate([revision("r2", true, null, "Pending"), revision("r1", false, true, "SUPERSEDED")]);
    expect(governing).toMatchObject({ id: "r1", status: "Approved" });
  });

  it("uses the latest once it is answered, and for an ordinary revision", () => {
    expect(governingEstimate([revision("r2", true, true, "Approved"), revision("r1", false, true, "SUPERSEDED")])?.id).toBe("r2");
    expect(governingEstimate([revision("r2", false, null, "Pending"), revision("r1", false, true, "SUPERSEDED")])?.id).toBe("r2");
  });
});

describe("my jobs", () => {
  const job = { stage: "REPAIR", status: "IN_PROGRESS", diagnosisReturned: false, returnedFromQc: false, readyToCollect: 0, nextWork: "Replace front brake pads", linesLeft: 2, findingRequests: 1 };

  it("names the next action", () => {
    expect(myJobNextAction(job)).toEqual({ kind: "REPAIR", label: "Continue repair", detail: "Next: Replace front brake pads." });
    expect(myJobNextAction({ ...job, readyToCollect: 5 })).toEqual({ kind: "COLLECT", label: "Collect parts", detail: "5 items ready at the store." });
    expect(myJobNextAction({ ...job, stage: "DIAGNOSIS", status: "OPEN", findingRequests: 2 })).toMatchObject({ label: "Start diagnosis", detail: "Record what you find for 2 customer requests." });
    expect(myJobNextAction({ ...job, status: "WAITING_PARTS" })).toMatchObject({ kind: "WAITING", label: "Open job" });
    expect(myJobNextAction({ ...job, returnedFromQc: true, readyToCollect: 1 })).toMatchObject({ label: "Continue repair", detail: "Returned from the quality check. Read the note and fix the work." });
    expect(myJobNextAction({ ...job, stage: "QUALITY_CHECK", status: "QC" })).toMatchObject({ kind: "VIEW", label: "View job" });
  });

  it("starts the Lagos day at 23:00 UTC the day before", () => {
    expect(lagosDayStart(new Date("2026-11-27T22:30:00.000Z")).toISOString()).toBe("2026-11-26T23:00:00.000Z");
    expect(lagosDayStart(new Date("2026-11-27T23:30:00.000Z")).toISOString()).toBe("2026-11-27T23:00:00.000Z");
  });
});

describe("new finding input", () => {
  const base = { requestId: "1b4e28ba-2fa1-41d2-883f-0016d3cca427", description: "Rear wiper blade torn", items: [] };
  it("needs a part for Need a part, and names the field", () => {
    const result = repairFindingBody.safeParse({ ...base, kind: "PART" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ path: ["items"], message: "Choose the part you need" });
  });
  it("needs the work or part for a finding", () => {
    expect(repairFindingBody.safeParse({ ...base, kind: "FINDING" }).error?.issues[0]).toMatchObject({ path: ["items"], message: "Add the work or part this finding needs" });
  });
  it("needs words for the finding", () => {
    const result = repairFindingBody.safeParse({ ...base, kind: "FINDING", description: "  " });
    expect(result.error?.issues[0].message).toBe("Write what you found, in at least 3 characters");
  });
});

describe("stage rules use the repair gate", () => {
  const facts = {
    stage: "REPAIR" as const,
    status: "IN_PROGRESS",
    qcStatus: null,
    technicianId: "tech",
    complaintCount: 1,
    openingSignatureProblem: null,
    checkInGates: null,
    approvalProblem: null,
    depositProblem: null,
    warrantyRelevant: false,
    diagnosisSubmitted: true,
    findingProblems: [],
    warrantyProblems: [],
    billed: false,
    creditApproved: false,
    unansweredCampaigns: 0,
  };
  it("blocks Send to quality check with the reason, for the assigned technician", () => {
    expect(checkStageAction("SEND_TO_QC", { ...facts, repairProblems: ["Finish all work first: 2 items left."] }, { id: "tech", role: "Technician" })).toEqual({
      ok: false,
      kind: "blocked",
      reasons: ["Finish all work first: 2 items left."],
    });
    expect(checkStageAction("SEND_TO_QC", { ...facts, repairProblems: [] }, { id: "tech", role: "Technician" })).toMatchObject({ ok: true, to: "QUALITY_CHECK" });
    expect(checkStageAction("SEND_TO_QC", { ...facts, repairProblems: [] }, { id: "other", role: "Technician" })).toMatchObject({ ok: false, kind: "forbidden" });
  });

  it("tells the advisor of a new finding and the technician of approved supplementary work", () => {
    const card = { branchId: "b", serviceAdvisorId: "advisor", technicianId: "tech", qualityInspectorId: null };
    expect(workshopRecipients("REPAIR_FINDING", card).OR).toEqual([{ id: { in: ["advisor"] }, branchId: "b" }]);
    expect(workshopRecipients("SUPPLEMENTARY_APPROVED", card).OR).toEqual([{ id: { in: ["tech"] }, branchId: "b" }]);
    expect(workshopRecipients("PARTS_ISSUED", card).OR).toEqual([{ id: { in: ["advisor", "tech"] }, branchId: "b" }]);
  });
});

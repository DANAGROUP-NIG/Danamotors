import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { JobCardWorkflowService } from "./job-card-workflow.service";
import type { JobStageService } from "./job-stage.service";
import type { EstimateActor, JobEstimateService } from "./job-estimate.service";
import type { JobRepairService, RepairActor } from "./job-repair.service";
import type { WorkshopService } from "../workshop/workshop.service";

const database = process.env.TEST_DATABASE_URL;
const describeDb = database ? describe : describe.skip;
jest.setTimeout(120000);

const SIGNATURE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";
const DAY = 86_400_000;

describeDb("Repair, parts collection and supplementary estimate on isolated local PostgreSQL (job card revamp phase 6)", () => {
  let db: PrismaClient;
  let workflow: JobCardWorkflowService;
  let stages: JobStageService;
  let estimates: JobEstimateService;
  let repair: JobRepairService;
  let workshop: WorkshopService;
  let drain: (jobId: string) => Promise<void>;
  const run = `${Date.now()}`;
  let branchName: string;
  let branchId: string;
  let otherBranchId: string;
  let serviceTypeId: string;
  let customerId: string;
  let variantId: string;
  const parts: Record<"pads" | "wiper", string> = {} as never;
  const labour: Record<"brakes" | "wiper", string> = {} as never;
  type Key = "advisor" | "technician" | "otherTech" | "store";
  const users: Record<Key, { id: string; role: string }> = {} as never;
  const ADVISOR = ["jobcard:read", "jobcard:update", "estimate:read", "estimate:create", "estimate:sign"];
  const advisor = (): EstimateActor => ({ ...users.advisor, permissions: ADVISOR });
  const tech = (key: "technician" | "otherTech" = "technician"): RepairActor => ({ ...users[key], permissions: ["jobcard:read", "jobcard:update", "jobprogress:update"], branchId });

  beforeAll(async () => {
    if (!database || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(database).hostname))
      throw new Error("Repair tests require a disposable localhost database");
    process.env.DATABASE_URL = database;
    db = require("../../prisma/client").default;
    workflow = new (require("./job-card-workflow.service").JobCardWorkflowService)();
    stages = new (require("./job-stage.service").JobStageService)();
    estimates = new (require("./job-estimate.service").JobEstimateService)();
    repair = new (require("./job-repair.service").JobRepairService)();
    workshop = new (require("../workshop/workshop.service").WorkshopService)();
    drain = require("../notification/jobcard-notification-router").drainJobcardNotifications;
    branchName = `Repair fixture ${run}`;
    branchId = (await db.branch.create({ data: { name: branchName } })).id;
    otherBranchId = (await db.branch.create({ data: { name: `Repair other ${run}` } })).id;
    const person = async (key: Key, role: string) => {
      const roleId = (await db.role.upsert({ where: { name: role }, update: {}, create: { name: role } })).id;
      const user = await db.user.create({
        data: { firstName: key, lastName: "Synthetic", email: `rep-${key}-${run}@example.test`, passwordHash: "test-fixture-not-a-login-hash", roleId, branchId },
      });
      users[key] = { id: user.id, role };
    };
    await person("advisor", "ServiceAdviser");
    await person("technician", "Technician");
    await person("otherTech", "Technician");
    await person("store", "StoreOfficer");
    customerId = (await db.customer.create({ data: { firstName: "Adaeze", lastName: "Synthetic", branchId } })).id;
    const modelId = (await db.workshopMaster.create({ data: { kind: "MODEL", code: `RP-M-${run}`, description: "Synthetic Sportage" } })).id;
    variantId = (await db.workshopMaster.create({ data: { kind: "VARIANT", code: `RP-V-${run}`, description: "Sportage 2.0", parentId: modelId } })).id;
    serviceTypeId = (await db.workshopMaster.create({ data: { kind: "SERVICE_TYPE", code: `RP-S-${run}`, description: "Periodic service" } })).id;
    await db.serviceTypeModelSetting.create({ data: { serviceTypeId, modelId, serviceCharge: 25000 } });
    labour.brakes = (await db.labourItem.create({ data: { code: `RP-L-${run}`, description: "Brake pad replacement", rate: 15000 } })).id;
    labour.wiper = (await db.labourItem.create({ data: { code: `RP-W-${run}`, description: "Wiper blade replacement", rate: 3000 } })).id;
    parts.pads = (await db.sparePart.create({ data: { partNumber: `RP-P-${run}`, name: "Front brake pads set", taxCategory: "A", retailRate: 45000 } })).id;
    parts.wiper = (await db.sparePart.create({ data: { partNumber: `RP-WB-${run}`, name: "Rear wiper blade", taxCategory: "A", retailRate: 8500 } })).id;
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  /** A job released to repair: brake pads and their labour approved by phone, advance received. */
  async function jobInRepair() {
    const vehicle = await db.vehicle.create({ data: { vin: `REP${run}${randomUUID().slice(0, 6)}`, customerId, catalogueId: variantId, customModel: "Synthetic Sportage", registrationNumber: `KJA-${randomUUID().slice(0, 4)}` } });
    const job = await workflow.open({
      branchName,
      customerId,
      vehicleId: vehicle.id,
      serviceTypeId,
      serviceAdvisorId: users.advisor.id,
      description: "Noise from front left wheel when braking",
      mileage: 48250,
      promisedAt: new Date(Date.now() + 2 * DAY).toISOString(),
      complaints: [{ description: "Noise from front left wheel when braking" }],
      createdById: users.advisor.id,
      warrantyAcknowledged: true,
    });
    await db.jobCard.update({
      where: { id: job.id },
      data: { stage: "ESTIMATE", stageOwnerId: users.advisor.id, stageOwnerRole: "ServiceAdviser", technicianId: users.technician.id, openingSignatureRequired: false, serviceCharge: 25000 },
    });
    const complaint = await db.jobComplaint.findFirstOrThrow({ where: { jobCardId: job.id } });
    const finding = await db.jobFinding.create({ data: { jobCardId: job.id, complaintId: complaint.id, causeAndDefect: "Pads worn to 2 mm.", createdById: users.technician.id } });
    await db.jobFindingItem.createMany({
      data: [
        { findingId: finding.id, kind: "PART", referenceId: parts.pads, description: "Front brake pads set", quantity: 1, sortOrder: 0, payer: "CUSTOMER" },
        { findingId: finding.id, kind: "LABOUR", referenceId: labour.brakes, description: "Brake pad replacement", quantity: 1, sortOrder: 1, payer: "CUSTOMER" },
      ],
    });
    let step = await estimates.prepare(job.id, advisor());
    step = await estimates.phoneApproval(job.id, advisor(), {
      estimateId: step.estimate!.id,
      expectedHash: step.estimate!.contentHash,
      approverName: "Adaeze Synthetic",
      approverPhone: "+234 803 555 0142",
      approvedAt: new Date(Date.now() - 60_000).toISOString(),
      approvedLineIds: step.estimate!.lines.filter((line) => line.payer === "CUSTOMER").map((line) => line.id),
      requestId: randomUUID(),
    });
    await db.receipt.create({
      data: { receiptNumber: `RCT-${run}-${randomUUID().slice(0, 6)}`, customerId, branchId, amount: 50000, advanceAmount: 50000, advanceJobCardId: job.id, issuedAt: new Date(Date.now() - 60_000) },
    });
    const workspace = await stages.act(job.id, { action: "RELEASE_TO_REPAIR", requestId: randomUUID() }, users.advisor);
    expect(workspace.stage).toBe("REPAIR");
    return job.id;
  }

  const lineOf = async (jobId: string, description: string) => (await repair.view(jobId, tech())).workLines.find((line) => line.description === description)!;

  it("release creates the work list; Done records labour; pause stops the clock; Send for quality check waits for every line", async () => {
    const jobId = await jobInRepair();
    let view = await repair.view(jobId, tech());
    expect(view.workLines.map((line) => [line.kind, line.description, line.status, line.hours])).toEqual([
      ["SERVICE", "Periodic service", "NOT_STARTED", "1.00"],
      ["LABOUR", "Brake pad replacement", "NOT_STARTED", "1.00"],
    ]);
    expect(view.access).toMatchObject({ canWork: true, canCollect: true, canPrepareSupplementary: false });
    let workspace = await stages.workspace(jobId, users.technician);
    expect(workspace.actions.find((action) => action.action === "SEND_TO_QC")).toMatchObject({ enabled: false, reasons: ["Finish all work first: 2 items left."] });

    // Another technician cannot touch the work; Done before Start is refused with the reason.
    const brakes = await lineOf(jobId, "Brake pad replacement");
    await expect(repair.moveLine(jobId, brakes.id, tech("otherTech"), { action: "START", requestId: randomUUID() })).rejects.toThrow("Only the technician assigned to this job");
    await expect(repair.moveLine(jobId, brakes.id, tech(), { action: "DONE", requestId: randomUUID() })).rejects.toThrow("Start this work before you mark it done.");

    await repair.moveLine(jobId, brakes.id, tech(), { action: "START", requestId: randomUUID() });
    const doneRequest = randomUUID();
    view = await repair.moveLine(jobId, brakes.id, tech(), { action: "DONE", requestId: doneRequest });
    // A double tap with the same request changes nothing (one labour line).
    await repair.moveLine(jobId, brakes.id, tech(), { action: "DONE", requestId: doneRequest });
    expect(view.workLines.find((line) => line.id === brakes.id)).toMatchObject({ status: "DONE", technician: "technician Synthetic" });
    const recorded = await db.jobCardLabour.findMany({ where: { jobCardId: jobId }, include: { chargeLine: true } });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ labourItemId: labour.brakes, hours: 1, technicianId: users.technician.id, labourSlipId: expect.any(String) });
    expect(recorded[0].chargeLine?.chargeType).toBe("CUSTOMER");
    expect(view.labour).toEqual([expect.objectContaining({ description: "Brake pad replacement", hours: "1.00", technician: "technician Synthetic" })]);
    expect(await db.auditLog.count({ where: { action: "JOB_WORK_LINE_DONE", details: { contains: brakes.id } } })).toBe(1);

    // Pause for parts: the running line waits and cannot restart until the job resumes.
    const service = await lineOf(jobId, "Periodic service");
    await repair.moveLine(jobId, service.id, tech(), { action: "START", requestId: randomUUID() });
    workspace = await stages.act(jobId, { action: "PAUSE_FOR_PARTS", note: "Waiting parts", requestId: randomUUID() }, users.technician);
    expect(workspace.status).toBe("WAITING_PARTS");
    expect((await lineOf(jobId, "Periodic service")).status).toBe("WAITING_PARTS");
    await expect(repair.moveLine(jobId, service.id, tech(), { action: "START", requestId: randomUUID() })).rejects.toThrow("The job is paused for parts. Resume the job first.");
    await stages.act(jobId, { action: "RESUME_REPAIR", requestId: randomUUID() }, users.technician);
    await repair.moveLine(jobId, service.id, tech(), { action: "START", requestId: randomUUID() });
    await repair.moveLine(jobId, service.id, tech(), { action: "DONE", requestId: randomUUID() });
    // The service line has no labour operation, so no second labour line.
    expect(await db.jobCardLabour.count({ where: { jobCardId: jobId } })).toBe(1);

    workspace = await stages.workspace(jobId, users.technician);
    expect(workspace.actions.find((action) => action.action === "SEND_TO_QC")).toMatchObject({ enabled: true });
    workspace = await stages.act(jobId, { action: "SEND_TO_QC", requestId: randomUUID() }, users.technician);
    expect(workspace.stage).toBe("QUALITY_CHECK");
  });

  it("a new finding goes to the advisor; the supplementary revision waits while approved work continues; approval adds work lines and the parts request", async () => {
    const jobId = await jobInRepair();
    const request = randomUUID();
    const body = {
      requestId: request,
      kind: "FINDING" as const,
      description: "Rear wiper blade torn.",
      items: [
        { kind: "PART" as const, referenceId: parts.wiper, quantity: 1 },
        { kind: "LABOUR" as const, referenceId: labour.wiper, quantity: 1 },
      ],
    };
    let view = await repair.raiseFinding(jobId, tech(), body);
    await repair.raiseFinding(jobId, tech(), body);
    expect(view.findings).toEqual([expect.objectContaining({ description: "Rear wiper blade torn.", raisedBy: "technician Synthetic", state: "WAITING_ESTIMATE" })]);
    expect(await db.jobFinding.count({ where: { jobCardId: jobId, raisedDuringRepair: true } })).toBe(1);
    await drain(jobId);
    const notice = await db.notification.findFirst({ where: { userId: users.advisor.id, type: "REPAIR_FINDING" } });
    expect(notice?.message).toContain("technician Synthetic: Rear wiper blade torn.");
    expect(view.qualityCheckProblems).toContain("A new finding is waiting for the service advisor's supplementary estimate.");
    await expect(repair.raiseFinding(jobId, tech("otherTech"), { ...body, requestId: randomUUID() })).rejects.toThrow("Only the technician assigned to this job");

    // Revision 2: earlier lines copied with their decisions, only the new lines priced and open.
    let step = await estimates.prepareSupplementary(jobId, advisor());
    const supplementary = step.estimate!;
    expect(supplementary).toMatchObject({ version: 2, supplementary: true });
    expect(supplementary.lines.map((line) => [line.description, line.carriedOver, line.customerDecision, line.amount])).toEqual([
      ["Periodic service", true, "APPROVED", "25000.00"],
      ["Front brake pads set", true, "APPROVED", "45000.00"],
      ["Brake pad replacement", true, "APPROVED", "15000.00"],
      ["Rear wiper blade", false, null, "8500.00"],
      ["Wiper blade replacement", false, null, "3000.00"],
    ]);
    expect(step.access.canEdit).toBe(true);
    // Repeating it returns the same revision.
    expect((await estimates.prepareSupplementary(jobId, advisor())).estimate!.id).toBe(supplementary.id);
    view = await repair.view(jobId, tech());
    expect(view.findings[0].state).toBe("WAITING_APPROVAL");
    expect(view.supplementary).toMatchObject({ version: 2, state: "DRAFT" });
    expect(view.qualityCheckProblems).toContain("The customer has not answered the supplementary estimate yet.");

    // Approved work continues while the supplementary waits: Done records labour against revision 1's scope.
    const brakes = await lineOf(jobId, "Brake pad replacement");
    await repair.moveLine(jobId, brakes.id, tech(), { action: "START", requestId: randomUUID() });
    await repair.moveLine(jobId, brakes.id, tech(), { action: "DONE", requestId: randomUUID() });
    expect(await db.jobCardLabour.count({ where: { jobCardId: jobId } })).toBe(1);

    // Collection still needs the assigned technician of the same branch, on an open job.
    const issue = await db.partIssuance.create({ data: { branchId, sparePartId: parts.pads, jobCardId: jobId, issuedById: users.store.id, quantity: 1 } });
    view = await repair.view(jobId, tech());
    expect(view.parts).toMatchObject({ ready: 1, outstanding: 1, collectable: [{ issuanceId: issue.id, description: "Front brake pads set", quantity: 1, issuedBy: "store Synthetic" }] });
    await expect(workshop.receiveParts(issue.id, users.otherTech.id, SIGNATURE)).rejects.toThrow("Only the assigned technician may confirm part collection");
    await db.user.update({ where: { id: users.technician.id }, data: { branchId: otherBranchId } });
    await expect(workshop.receiveParts(issue.id, users.technician.id, SIGNATURE)).rejects.toThrow("Only the assigned technician may confirm part collection");
    await db.user.update({ where: { id: users.technician.id }, data: { branchId } });
    await workshop.receiveParts(issue.id, users.technician.id, SIGNATURE);
    view = await repair.view(jobId, tech());
    expect(view.parts.rows.find((row) => row.sparePartId === parts.pads)).toMatchObject({ status: "COLLECTED", collectedBy: "technician Synthetic" });

    // The customer approves the new lines (the earlier lines keep their answer).
    step = await estimates.presentToCustomer(jobId, advisor(), supplementary.id);
    step = await estimates.approve(
      jobId,
      advisor(),
      {
        estimateId: supplementary.id,
        expectedHash: step.estimate!.contentHash,
        decisions: supplementary.lines.filter((line) => !line.carriedOver).map((line) => ({ lineId: line.id, decision: "APPROVED" as const })),
        signer: "OWNER",
        signerName: "Adaeze Synthetic",
        signatureImage: SIGNATURE,
        consentAccepted: true,
        requestId: randomUUID(),
      },
      "test",
    );
    expect(step.estimate).toMatchObject({ status: "APPROVED", outcome: "APPROVED" });
    expect(step.partsRequest).toMatchObject({ status: "SENT", itemCount: 1 });
    const request2 = await db.jobPartsRequest.findUniqueOrThrow({ where: { estimateId: supplementary.id } });
    expect(request2.lines).toEqual([{ sparePartId: parts.wiper, description: "Rear wiper blade", quantity: "1.00" }]);
    view = await repair.view(jobId, tech());
    expect(view.findings[0].state).toBe("APPROVED");
    expect(view.workLines.find((line) => line.description === "Wiper blade replacement")).toMatchObject({ status: "NOT_STARTED", supplementary: true });
    expect(view.qualityCheckProblems).toEqual(["Finish all work first: 2 items left."]);
    await drain(jobId);
    expect(await db.notification.count({ where: { userId: users.technician.id, type: "SUPPLEMENTARY_APPROVED" } })).toBe(1);
  });

  it("My jobs lists only this technician's jobs in their branch, by tab", async () => {
    const jobId = await jobInRepair();
    const elsewhere = await jobInRepair();
    await db.jobCard.update({ where: { id: elsewhere }, data: { branchId: otherBranchId } });
    let mine = await repair.myJobs(tech(), { tab: "TODAY", page: 1, limit: 50 });
    expect(mine.jobs.map((job) => job.id)).toContain(jobId);
    expect(mine.jobs.map((job) => job.id)).not.toContain(elsewhere);
    expect(mine.jobs.find((job) => job.id === jobId)).toMatchObject({ stage: "REPAIR", next: { label: "Continue repair", detail: "Next: Periodic service." } });
    const other = await repair.myJobs(tech("otherTech"), { tab: "TODAY", page: 1, limit: 50 });
    expect(other.counts.TODAY).toBe(0);

    await stages.act(jobId, { action: "PAUSE_FOR_PARTS", requestId: randomUUID() }, users.technician);
    mine = await repair.myJobs(tech(), { tab: "WAITING_PARTS", page: 1, limit: 50 });
    expect(mine.jobs.map((job) => job.id)).toEqual([jobId]);
    expect(mine.counts.WAITING_PARTS).toBe(1);
    // Paged: one per page.
    const paged = await repair.myJobs(tech(), { tab: "TODAY", page: 1, limit: 1 });
    expect(paged.jobs.length).toBeLessThanOrEqual(1);
    expect(paged.total).toBe(paged.counts.TODAY);
  });
});

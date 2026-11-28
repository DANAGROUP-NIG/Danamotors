import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { JobCardWorkflowService } from "./job-card-workflow.service";
import type { JobStageService } from "./job-stage.service";
import type { EstimateActor, JobEstimateService } from "./job-estimate.service";
import type { JobRepairService, RepairActor } from "./job-repair.service";
import type { JobQualityCheckService } from "./job-quality-check.service";
import type { JobBillingStepService } from "./job-billing-step.service";
import type { JobDeliveryService } from "./job-delivery.service";
import type { PsfService } from "../psf/psf.service";
import type { JobPrintService } from "./job-print.service";
import { QC_GENERAL_CHECKS } from "./job-quality-check.logic";
import { BELONGINGS_NOTE, LATE_REASONS_NEEDED, RELEASE_RULE, validDeliveryEvidence } from "./job-delivery.logic";
import { followUpDueAt } from "../psf/psf.logic";

const database = process.env.TEST_DATABASE_URL;
const describeDb = database ? describe : describe.skip;
jest.setTimeout(120000);

const SIGNATURE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";
const DAY = 86_400_000;

describeDb("Delivery: handover, belongings, collector, signatures, late reasons and gate pass on isolated local PostgreSQL (job card revamp phase 9)", () => {
  let db: PrismaClient;
  let workflow: JobCardWorkflowService;
  let stages: JobStageService;
  let estimates: JobEstimateService;
  let repair: JobRepairService;
  let qc: JobQualityCheckService;
  let billingStep: JobBillingStepService;
  let delivery: JobDeliveryService;
  let psf: PsfService;
  let prints: JobPrintService;
  const run = `${Date.now()}`;
  let branchName: string;
  let branchId: string;
  let serviceTypeId: string;
  let customerId: string;
  let variantId: string;
  let padsId: string;
  let brakesId: string;
  const lateReasons: string[] = [];
  type Key = "advisor" | "technician" | "supervisor" | "manager";
  const users: Record<Key, { id: string; role: string }> = {} as never;
  const ADVISOR = ["jobcard:read", "jobcard:update", "estimate:read", "estimate:create", "estimate:sign"];
  const estimator = (): EstimateActor => ({ ...users.advisor, permissions: ADVISOR });
  const advisor = (): RepairActor => ({ ...users.advisor, permissions: ADVISOR, branchId });
  const tech = (): RepairActor => ({ ...users.technician, permissions: ["jobcard:read", "jobcard:update", "jobprogress:update"], branchId });
  const supervisor = (): RepairActor => ({ ...users.supervisor, permissions: ["jobcard:read", "jobcard:update", "qcstatus:update"], branchId });
  const manager = (): RepairActor => ({ ...users.manager, permissions: ["jobcard:read", "jobcard:update", "estimate:sign"], branchId });

  beforeAll(async () => {
    if (!database || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(database).hostname))
      throw new Error("Delivery tests require a disposable localhost database");
    process.env.DATABASE_URL = database;
    db = require("../../prisma/client").default;
    workflow = new (require("./job-card-workflow.service").JobCardWorkflowService)();
    stages = new (require("./job-stage.service").JobStageService)();
    estimates = new (require("./job-estimate.service").JobEstimateService)();
    repair = new (require("./job-repair.service").JobRepairService)();
    qc = new (require("./job-quality-check.service").JobQualityCheckService)();
    billingStep = new (require("./job-billing-step.service").JobBillingStepService)();
    delivery = new (require("./job-delivery.service").JobDeliveryService)();
    psf = new (require("../psf/psf.service").PsfService)();
    prints = new (require("./job-print.service").JobPrintService)();
    branchName = `Delivery fixture ${run}`;
    branchId = (await db.branch.create({ data: { name: branchName } })).id;
    const person = async (key: Key, role: string) => {
      const roleId = (await db.role.upsert({ where: { name: role }, update: {}, create: { name: role } })).id;
      const user = await db.user.create({
        data: { firstName: key, lastName: "Synthetic", email: `dlv-${key}-${run}@example.test`, passwordHash: "test-fixture-not-a-login-hash", roleId, branchId },
      });
      users[key] = { id: user.id, role };
    };
    await person("advisor", "ServiceAdviser");
    await person("technician", "Technician");
    await person("supervisor", "WorkshopManager");
    await person("manager", "ServiceManager");
    customerId = (await db.customer.create({ data: { firstName: "Adaeze", lastName: "Synthetic", branchId, phoneNumber: "0803 555 0142" } })).id;
    const modelId = (await db.workshopMaster.create({ data: { kind: "MODEL", code: `DL-M-${run}`, description: "Synthetic Sportage" } })).id;
    variantId = (await db.workshopMaster.create({ data: { kind: "VARIANT", code: `DL-V-${run}`, description: "Sportage 2.0", parentId: modelId } })).id;
    serviceTypeId = (await db.workshopMaster.create({ data: { kind: "SERVICE_TYPE", code: `DL-S-${run}`, description: "Periodic service" } })).id;
    await db.serviceTypeModelSetting.create({ data: { serviceTypeId, modelId, serviceCharge: 25000 } });
    brakesId = (await db.labourItem.create({ data: { code: `DL-L-${run}`, description: "Brake pad replacement", rate: 15000 } })).id;
    padsId = (await db.sparePart.create({ data: { partNumber: `DL-P-${run}`, name: "Front brake pads set", taxCategory: "A", retailRate: 45000 } })).id;
    for (const [index, description] of ["Spare unavailable", "Wrong estimation"].entries())
      lateReasons.push((await db.workshopMaster.create({ data: { kind: "LATE_REASON", code: `DL-R${index}-${run}`, description } })).id);
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  /**
   * Opened, findings priced, approved by phone (signature due at delivery), released, done, passed QC, marked ready,
   * approved for credit by the service manager and sent to delivery. The air filter was declined.
   */
  async function jobAtDelivery() {
    const vehicle = await db.vehicle.create({
      data: { vin: `DL${run}${randomUUID().slice(0, 6)}`, customerId, catalogueId: variantId, customModel: "Synthetic Sportage", registrationNumber: `KJA-${randomUUID().slice(0, 4)}` },
    });
    const job = await workflow.open({
      branchName, customerId, vehicleId: vehicle.id, serviceTypeId, serviceAdvisorId: users.advisor.id,
      description: "Noise from front left wheel when braking", mileage: 48250,
      promisedAt: new Date(Date.now() + 2 * DAY).toISOString(),
      complaints: [{ description: "Noise from front left wheel when braking" }],
      createdById: users.advisor.id, warrantyAcknowledged: true,
    });
    await db.jobCard.update({
      where: { id: job.id },
      data: { stage: "ESTIMATE", stageOwnerId: users.advisor.id, stageOwnerRole: "ServiceAdviser", technicianId: users.technician.id, openingSignatureRequired: false, serviceCharge: 25000 },
    });
    await db.jobCheckIn.create({
      data: { jobCardId: job.id, checklist: { SERVICE_BOOK: "PRESENT", TOOL_KIT: "PRESENT", HEADLAMPS: "PRESENT", SPARE_WHEEL: "MISSING" }, belongingsNote: "Umbrella in boot" },
    });
    const complaint = await db.jobComplaint.findFirstOrThrow({ where: { jobCardId: job.id } });
    const finding = await db.jobFinding.create({ data: { jobCardId: job.id, complaintId: complaint.id, causeAndDefect: "Pads worn to 2 mm.", createdById: users.technician.id } });
    await db.jobFindingItem.createMany({
      data: [
        { findingId: finding.id, kind: "PART", referenceId: padsId, description: "Front brake pads set", quantity: 1, sortOrder: 0, payer: "CUSTOMER" },
        { findingId: finding.id, kind: "LABOUR", referenceId: brakesId, description: "Brake pad replacement", quantity: 1, sortOrder: 1, payer: "CUSTOMER" },
      ],
    });
    let step = await estimates.prepare(job.id, estimator());
    // The pads are declined on the phone: "Declined, recommended for next visit".
    step = await estimates.phoneApproval(job.id, estimator(), {
      estimateId: step.estimate!.id,
      expectedHash: step.estimate!.contentHash,
      approverName: "Adaeze Synthetic",
      approverPhone: "+234 803 555 0142",
      approvedAt: new Date(Date.now() - 60_000).toISOString(),
      approvedLineIds: step.estimate!.lines.filter((line) => line.payer === "CUSTOMER" && line.description !== "Front brake pads set").map((line) => line.id),
      requestId: randomUUID(),
    });
    await db.receipt.create({
      data: { receiptNumber: `RCT-${run}-${randomUUID().slice(0, 6)}`, customerId, branchId, amount: 50000, advanceAmount: 50000, advanceJobCardId: job.id, issuedAt: new Date(Date.now() - 60_000) },
    });
    expect((await stages.act(job.id, { action: "RELEASE_TO_REPAIR", requestId: randomUUID() }, users.advisor)).stage).toBe("REPAIR");
    for (const line of (await repair.view(job.id, tech())).workLines) {
      await repair.moveLine(job.id, line.id, tech(), { action: "START", requestId: randomUUID() });
      await repair.moveLine(job.id, line.id, tech(), { action: "DONE", requestId: randomUUID() });
    }
    expect((await stages.act(job.id, { action: "SEND_TO_QC", requestId: randomUUID() }, users.technician)).stage).toBe("QUALITY_CHECK");
    const view = await qc.view(job.id, supervisor());
    await qc.record(job.id, supervisor(), {
      requestId: randomUUID(), outcome: "PASS",
      lines: view.workLines.map((line) => ({ workLineId: line.id, result: "PASS" as const })),
      general: QC_GENERAL_CHECKS.map((item) => ({ code: item.code, passed: true })),
      acOutletTempC: 6, roadTestStartKm: 48_262, roadTestEndKm: 48_270, roadTestNotes: "No abnormal noise.", notes: null, signatureImage: SIGNATURE,
    });
    await billingStep.markReady(job.id, advisor(), { requestId: randomUUID(), channel: "PHONE_CALL", note: null });
    await workflow.approveCredit(job.id, users.manager.id, "Fleet customer on 30-day terms.");
    expect((await stages.act(job.id, { action: "SEND_TO_DELIVERY", requestId: randomUUID() }, users.advisor)).stage).toBe("DELIVERY");
    return job.id;
  }

  const handover = (overrides: Record<string, unknown> = {}) => ({
    requestId: randomUUID(),
    collectorType: "OWNER" as const,
    returnedCodes: ["SERVICE_BOOK", "TOOL_KIT", BELONGINGS_NOTE],
    lateReasonIds: [] as string[],
    accepted: true as const,
    signatureImage: SIGNATURE,
    ...overrides,
  });

  it("signs the phone approval, checks belongings and late reasons, delivers with the gate pass, closes the job and schedules the follow-up", async () => {
    const jobId = await jobAtDelivery();
    let view = await delivery.view(jobId, advisor());
    expect(view).toMatchObject({ stage: "DELIVERY", late: false, paymentProblem: null, delivered: null, checkInSigner: null, releaseApproval: null });
    expect(view.owner).toEqual({ name: "Adaeze Synthetic", phone: "0803 555 0142" });
    expect(view.belongings).toEqual([
      { code: "SERVICE_BOOK", label: "Service book" },
      { code: "TOOL_KIT", label: "Tool kit" },
      { code: BELONGINGS_NOTE, label: "Umbrella in boot" },
    ]);
    expect(view.workDone.map((line) => line.text)).toEqual(["Periodic service", "Brake pad replacement"]);
    expect(view.declined).toEqual(["Front brake pads set"]);
    expect(view.phoneApprovals).toHaveLength(1);
    expect(view.phoneApprovals[0]).toMatchObject({ version: 1, approverName: "Adaeze Synthetic", matches: true });
    expect(view.phoneApprovals[0].items.map((item) => item.description)).toEqual(["Periodic service", "Brake pad replacement"]);
    expect(view.access).toMatchObject({ canDeliver: true, canSignEstimate: true, canApproveRelease: false, canRequestRelease: true });

    // Not the advisor's step for a technician; the stage route cannot deliver without the signature.
    await expect(delivery.deliver(jobId, tech(), handover())).rejects.toMatchObject({ statusCode: 403, code: "DELIVERY_FORBIDDEN" });
    expect((await delivery.view(jobId, tech())).access.canDeliver).toBe(false);
    await expect(stages.act(jobId, { action: "DELIVER", requestId: randomUUID() }, users.advisor)).rejects.toMatchObject({
      statusCode: 409,
      code: "STAGE_ACTION_BLOCKED",
      message: expect.stringContaining("Complete the delivery on the Delivery step"),
    });
    await expect(
      workflow.update(jobId, { status: "DELIVERED", deliveryAdvisorId: users.advisor.id }, users.advisor.id),
    ).rejects.toThrow("Deliver the vehicle from the Delivery step of the job card.");

    // Everything missing is named at once.
    await expect(delivery.deliver(jobId, advisor(), handover({ returnedCodes: ["TOOL_KIT"] }))).rejects.toMatchObject({
      statusCode: 409,
      code: "DELIVERY_BLOCKED",
      details: {
        reasons: [
          "The customer must first sign the estimate they approved on the phone.",
          "Tick Returned for every belonging: 2 are not ticked yet.",
        ],
      },
    });

    // The customer signs the phone approval first; a repeat does not sign twice.
    const sign = { requestId: randomUUID(), signerName: "Adaeze Synthetic", accepted: true as const, signatureImage: SIGNATURE };
    view = await delivery.signPhoneApprovals(jobId, advisor(), sign, "test-device");
    await delivery.signPhoneApprovals(jobId, advisor(), sign, "test-device");
    expect(view.phoneApprovals).toEqual([]);
    const signature = await db.estimateSignature.findFirstOrThrow({ where: { estimate: { jobCardId: jobId } } });
    expect(signature).toMatchObject({ channel: "DELIVERY", hashVersion: 2, signerName: "Adaeze Synthetic", estimateVersion: 1 });
    expect(await db.estimateSignature.count({ where: { estimate: { jobCardId: jobId } } })).toBe(1);
    expect(await db.customerApproval.findFirstOrThrow({ where: { estimate: { jobCardId: jobId } } })).toMatchObject({ signatureDueAtDelivery: false });
    expect(await db.auditLog.count({ where: { action: "ESTIMATE_PHONE_APPROVAL_SIGNED", details: { contains: jobId } } })).toBe(1);

    // Late: the promised time has passed, so 1 to 6 distinct reasons are needed; someone else needs approval.
    await db.jobCard.update({ where: { id: jobId }, data: { promisedAt: new Date(Date.now() - 3_600_000) } });
    expect((await delivery.view(jobId, advisor())).late).toBe(true);
    await expect(delivery.deliver(jobId, advisor(), handover({ collectorType: "OTHER" }))).rejects.toMatchObject({
      details: { reasons: [RELEASE_RULE, LATE_REASONS_NEEDED] },
    });
    await expect(delivery.deliver(jobId, advisor(), handover({ lateReasonIds: [lateReasons[0], lateReasons[0]] }))).rejects.toMatchObject({
      details: { reasons: ["Reasons for late delivery: A reason can be selected only once."] },
    });

    // Delivered to the owner: gate pass, Closed, the late reasons, the follow-up date, the signed evidence.
    const done = handover({ lateReasonIds: lateReasons, lateRemarks: "Pads came late from the supplier." });
    view = await delivery.deliver(jobId, advisor(), done);
    await delivery.deliver(jobId, advisor(), done);
    const job = await db.jobCard.findUniqueOrThrow({
      where: { id: jobId },
      select: { stage: true, status: true, gatePassNumber: true, deliveredAt: true, deliveryAdvisorId: true, lateReasonIds: true, lateRemarks: true, psfFollowUpDueAt: true, stageOwnerId: true },
    });
    expect(job).toMatchObject({ stage: "CLOSED", status: "DELIVERED", deliveryAdvisorId: users.advisor.id, lateReasonIds: lateReasons, lateRemarks: "Pads came late from the supplier.", stageOwnerId: null });
    expect(job.gatePassNumber).toBeTruthy();
    expect(job.psfFollowUpDueAt).toEqual(followUpDueAt(job.deliveredAt!, 2));
    expect(view.delivered).toMatchObject({
      gatePassNumber: job.gatePassNumber,
      by: "advisor Synthetic",
      lateReasons: expect.arrayContaining(["Spare unavailable", "Wrong estimation"]),
      collector: { type: "OWNER", name: "Adaeze Synthetic", phone: "0803 555 0142" },
    });
    expect(view.delivered!.belongingsReturned).toEqual([
      { code: "SERVICE_BOOK", label: "Service book", returned: true },
      { code: "TOOL_KIT", label: "Tool kit", returned: true },
      { code: BELONGINGS_NOTE, label: "Umbrella in boot", returned: true },
    ]);
    expect(view.access).toMatchObject({ canDeliver: false, canSignEstimate: false, canApproveRelease: false });
    const stored = await db.jobDeliverySignature.findUniqueOrThrow({ where: { jobCardId: jobId } });
    expect(stored).toMatchObject({ collectorType: "OWNER", releaseApprovalId: null, capturedById: users.advisor.id });
    expect(validDeliveryEvidence({ ...stored, snapshot: stored.snapshot })).toBe(true);
    expect(stored.snapshot).toMatchObject({ statement: "I am taking delivery of the vehicle and I am satisfied with the repairs.", declined: ["Front brake pads set"] });
    expect(await db.jobDeliverySignature.count({ where: { jobCardId: jobId } })).toBe(1);
    expect(await db.jobStageEvent.count({ where: { jobCardId: jobId, action: "DELIVER", toStage: "CLOSED" } })).toBe(1);
    expect(await db.jobCardStatusHistory.count({ where: { jobCardId: jobId, toStatus: "DELIVERED" } })).toBe(1);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "JOB_DELIVERY_SIGNED", details: { contains: jobId } } });
    expect(JSON.parse(audit.details!)).toMatchObject({ collectorType: "OWNER", belongings: 3, gatePassNumber: job.gatePassNumber });
    expect(audit.details).not.toContain("Adaeze");

    // The follow-up is waiting on the PSF screen with its due date; the workspace shows all eight steps done.
    const followUp = await psf.detail(jobId, { userId: users.manager.id, branchId, allBranches: false } as never);
    expect(followUp).toMatchObject({ followUpDueAt: job.psfFollowUpDueAt, followUp: null });
    const workspace = await stages.workspace(jobId, users.advisor);
    expect(workspace).toMatchObject({ stage: "CLOSED", actions: [] });
    expect(workspace.summaries).toHaveLength(8);

    // Closed: nothing more can be signed, approved or delivered.
    await expect(delivery.approveRelease(jobId, manager(), { requestId: randomUUID(), collectorName: "Bola Ade", collectorPhone: "08039998888", reason: "Driver sent by the owner." })).rejects.toMatchObject({
      statusCode: 409,
      message: "This vehicle has already been delivered.",
    });
  });

  it("releases to the check-in signer or, with a manager's approval, to someone else; refuses an unpaid job", async () => {
    const jobId = await jobAtDelivery();
    await delivery.signPhoneApprovals(jobId, advisor(), { requestId: randomUUID(), signerName: "Emeka Rep", accepted: true, signatureImage: SIGNATURE }, "test-device");
    await db.jobOpeningSignature.create({
      data: {
        jobCardId: jobId, revision: 1, idempotencyKey: randomUUID(), documentHash: "a".repeat(64), scopeHash: "b".repeat(64), evidenceHash: "c".repeat(64),
        snapshot: {}, signerName: "Emeka Rep", relationship: "Driver", signerPhone: "08031112222", capturedById: users.advisor.id, signatureImage: SIGNATURE,
      },
    });
    let view = await delivery.view(jobId, advisor());
    expect(view.checkInSigner).toEqual({ name: "Emeka Rep", phone: "08031112222" });

    // Unpaid without credit: blocked with the payment reason.
    await db.jobCard.update({ where: { id: jobId }, data: { creditApprovedById: null } });
    view = await delivery.view(jobId, advisor());
    expect(view.paymentProblem).toBeTruthy();
    await expect(delivery.deliver(jobId, advisor(), handover({ collectorType: "CHECK_IN_SIGNER" }))).rejects.toMatchObject({
      code: "DELIVERY_BLOCKED",
      details: { reasons: [view.paymentProblem] },
    });
    await db.jobCard.update({ where: { id: jobId }, data: { creditApprovedById: users.manager.id } });

    // Someone else: the advisor asks, only a manager approves, and the approval names the collector.
    const asked = await delivery.requestRelease(jobId, advisor(), { requestId: randomUUID(), collectorName: "Bola Ade" });
    expect(asked.notified.sort()).toEqual(["manager Synthetic", "supervisor Synthetic"]);
    expect(await db.notification.count({ where: { type: "RELEASE_APPROVAL_REQUESTED", link: `/job-cards/${jobId}` } })).toBe(2);
    const approve = { requestId: randomUUID(), collectorName: "Bola Ade", collectorPhone: "+234 803 999 8888", reason: "Owner phoned and sent her driver with ID." };
    await expect(delivery.approveRelease(jobId, advisor(), approve)).rejects.toMatchObject({ statusCode: 403, code: "DELIVERY_FORBIDDEN" });
    view = await delivery.approveRelease(jobId, manager(), approve);
    await delivery.approveRelease(jobId, manager(), approve);
    expect(await db.jobReleaseApproval.count({ where: { jobCardId: jobId } })).toBe(1);
    expect(view.releaseApproval).toMatchObject({ collectorName: "Bola Ade", collectorPhone: "08039998888", approvedBy: "manager Synthetic", approvedByRole: "ServiceManager" });
    expect(view.access.canRequestRelease).toBe(false);

    // The service manager hands over to the approved collector, for the job's advisor.
    view = await delivery.deliver(jobId, manager(), handover({ collectorType: "OTHER" }));
    expect(view.delivered!.collector).toMatchObject({ type: "OTHER", name: "Bola Ade", phone: "08039998888" });
    const stored = await db.jobDeliverySignature.findUniqueOrThrow({ where: { jobCardId: jobId } });
    expect(stored.releaseApprovalId).toBe(view.releaseApproval!.id);
    expect(stored.snapshot).toMatchObject({ release: { approvedBy: "manager Synthetic", reason: approve.reason } });
    expect(await db.jobCard.findUniqueOrThrow({ where: { id: jobId }, select: { deliveryAdvisorId: true, stage: true } })).toEqual({
      deliveryAdvisorId: users.advisor.id,
      stage: "CLOSED",
    });
  });

  // Phase 11: the printed job card and gate pass read the delivered job as stored, accents included.
  it("prints the delivered job card front and back and the gate pass, with blank lines where nothing was signed", async () => {
    const jobId = await jobAtDelivery();
    await expect(prints.gatePass(jobId)).rejects.toMatchObject({ statusCode: 409, code: "GATE_PASS_NOT_ISSUED" });
    await db.customer.update({ where: { id: customerId }, data: { firstName: "Ọlá", lastName: "Ògúnlẹ̀yẹ̀", address: "14 Admiralty Way", city: "Lekki", state: "Lagos" } });
    await db.jobCheckIn.update({ where: { jobCardId: jobId }, data: { fuelLevel: "HALF", instructionsToTechnician: "Check the front brakes.\nRoad test after the repair." } });
    await db.jobDamageMark.create({ data: { jobCardId: jobId, requestId: randomUUID(), createdById: users.advisor.id, type: "SCRATCH", x: 50, y: 94, note: "Light scratch" } });
    await delivery.signPhoneApprovals(jobId, advisor(), { requestId: randomUUID(), signerName: "Ọlá Ògúnlẹ̀yẹ̀", accepted: true, signatureImage: SIGNATURE }, "test-device");
    await delivery.deliver(jobId, advisor(), handover());

    const card = await prints.jobCard(jobId);
    expect(card.customer).toEqual({ name: "Ọlá Ògúnlẹ̀yẹ̀", phone: "0803 555 0142", address: "14 Admiralty Way, Lekki, Lagos" });
    expect(card.job).toMatchObject({ mileage: 48250, advisor: "advisor Synthetic", warranty: false });
    expect(card.job.gatePassNumber).toBeTruthy();
    expect(card.requests).toEqual(["Noise from front left wheel when braking"]);
    expect(card.instructions.advisor).toEqual(["Check the front brakes.", "Road test after the repair."]);
    expect(card.fuelLevel).toBe("HALF");
    expect(card.damageMarks).toEqual([expect.objectContaining({ type: "SCRATCH", x: 50, y: 94, note: "Light scratch" })]);
    expect(card.checklist).toHaveLength(25);
    expect(card.checklist.find((row) => row.code === "SPARE_WHEEL")?.state).toBe("MISSING");
    expect(card.findings).toEqual([{ text: "Pads worn to 2 mm.", source: "Request 1" }]);
    expect(card.roadworthy).toMatchObject({ by: "supervisor Synthetic" });
    expect(card.comparison.rows?.at(-1)).toMatchObject({ group: "TOTAL" });
    expect(card.signatures.map((box) => [box.title, box.name, !!box.image])).toEqual([
      ["Service advisor", "advisor Synthetic", false],
      ["Technician", "technician Synthetic", false],
      ["Service manager", "supervisor Synthetic", true],
      // No check-in signature on this job: blank lines for a pen signature.
      ["Customer authorisation", null, false],
      ["Customer delivery", "Ọlá Ògúnlẹ̀yẹ̀", true],
    ]);
    expect(card.signatures[1].date).toBeInstanceOf(Date);
    expect(JSON.stringify(card)).not.toMatch(/passwordHash|evidenceHash|documentHash/);

    const pass = await prints.gatePass(jobId);
    expect(pass).toMatchObject({
      jobNumber: card.job.number,
      gatePassNumber: card.job.gatePassNumber,
      customer: "Ọlá Ògúnlẹ̀yẹ̀",
      collectedBy: "Ọlá Ògúnlẹ̀yẹ̀",
      deliveredBy: "advisor Synthetic",
    });
    expect(pass.deliveredAt).toBeInstanceOf(Date);

    // A check-in signature whose evidence cannot be verified is never printed as valid.
    await db.jobOpeningSignature.create({
      data: {
        jobCardId: jobId, revision: 1, idempotencyKey: randomUUID(), documentHash: "a".repeat(64), scopeHash: "b".repeat(64), evidenceHash: "c".repeat(64),
        snapshot: {}, signerName: "Ọlá Ògúnlẹ̀yẹ̀", capturedById: users.advisor.id, signatureImage: SIGNATURE,
      },
    });
    const reprinted = await prints.jobCard(jobId);
    expect(reprinted.signatures[3]).toMatchObject({ name: "Ọlá Ògúnlẹ̀yẹ̀", image: null, note: "The signature could not be verified. Ask the customer to sign the printed copy." });
  });
});

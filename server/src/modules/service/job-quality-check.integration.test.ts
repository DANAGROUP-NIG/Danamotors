import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { JobCardWorkflowService } from "./job-card-workflow.service";
import type { JobStageService } from "./job-stage.service";
import type { EstimateActor, JobEstimateService } from "./job-estimate.service";
import type { JobRepairService, RepairActor } from "./job-repair.service";
import type { JobQualityCheckService } from "./job-quality-check.service";
import type { JobBillingService } from "../finance/job-billing.service";
import { QC_GENERAL_CHECKS, type QualityCheckInput } from "./job-quality-check.logic";

const database = process.env.TEST_DATABASE_URL;
const describeDb = database ? describe : describe.skip;
jest.setTimeout(120000);

const SIGNATURE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";
const DAY = 86_400_000;

describeDb("Quality check: fail, repair and pass on isolated local PostgreSQL (job card revamp phase 7)", () => {
  let db: PrismaClient;
  let workflow: JobCardWorkflowService;
  let stages: JobStageService;
  let estimates: JobEstimateService;
  let repair: JobRepairService;
  let qc: JobQualityCheckService;
  let billing: JobBillingService;
  let drain: (jobId: string) => Promise<void>;
  const run = `${Date.now()}`;
  let branchName: string;
  let branchId: string;
  let serviceTypeId: string;
  let customerId: string;
  let variantId: string;
  const parts: Record<"pads" | "wiper", string> = {} as never;
  const labour: Record<"brakes" | "wiper", string> = {} as never;
  type Key = "advisor" | "technician" | "otherTech" | "store" | "supervisor";
  const users: Record<Key, { id: string; role: string }> = {} as never;
  const ADVISOR = ["jobcard:read", "jobcard:update", "estimate:read", "estimate:create", "estimate:sign"];
  const advisor = (): EstimateActor => ({ ...users.advisor, permissions: ADVISOR });
  const tech = (key: "technician" | "otherTech" = "technician"): RepairActor => ({ ...users[key], permissions: ["jobcard:read", "jobcard:update", "jobprogress:update"], branchId });

  beforeAll(async () => {
    if (!database || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(database).hostname))
      throw new Error("Quality check tests require a disposable localhost database");
    process.env.DATABASE_URL = database;
    db = require("../../prisma/client").default;
    workflow = new (require("./job-card-workflow.service").JobCardWorkflowService)();
    stages = new (require("./job-stage.service").JobStageService)();
    estimates = new (require("./job-estimate.service").JobEstimateService)();
    repair = new (require("./job-repair.service").JobRepairService)();
    qc = new (require("./job-quality-check.service").JobQualityCheckService)();
    billing = new (require("../finance/job-billing.service").JobBillingService)();
    drain = require("../notification/jobcard-notification-router").drainJobcardNotifications;
    branchName = `QC fixture ${run}`;
    branchId = (await db.branch.create({ data: { name: branchName } })).id;
    const person = async (key: Key, role: string) => {
      const roleId = (await db.role.upsert({ where: { name: role }, update: {}, create: { name: role } })).id;
      const user = await db.user.create({
        data: { firstName: key, lastName: "Synthetic", email: `qc-${key}-${run}@example.test`, passwordHash: "test-fixture-not-a-login-hash", roleId, branchId },
      });
      users[key] = { id: user.id, role };
    };
    await person("advisor", "ServiceAdviser");
    await person("technician", "Technician");
    await person("otherTech", "Technician");
    await person("store", "StoreOfficer");
    await person("supervisor", "WorkshopManager");
    customerId = (await db.customer.create({ data: { firstName: "Adaeze", lastName: "Synthetic", branchId } })).id;
    const modelId = (await db.workshopMaster.create({ data: { kind: "MODEL", code: `QC-M-${run}`, description: "Synthetic Sportage" } })).id;
    variantId = (await db.workshopMaster.create({ data: { kind: "VARIANT", code: `QC-V-${run}`, description: "Sportage 2.0", parentId: modelId } })).id;
    serviceTypeId = (await db.workshopMaster.create({ data: { kind: "SERVICE_TYPE", code: `QC-S-${run}`, description: "Periodic service" } })).id;
    await db.serviceTypeModelSetting.create({ data: { serviceTypeId, modelId, serviceCharge: 25000 } });
    labour.brakes = (await db.labourItem.create({ data: { code: `QC-L-${run}`, description: "Brake pad replacement", rate: 15000 } })).id;
    labour.wiper = (await db.labourItem.create({ data: { code: `QC-W-${run}`, description: "Wiper blade replacement", rate: 3000 } })).id;
    parts.pads = (await db.sparePart.create({ data: { partNumber: `QC-P-${run}`, name: "Front brake pads set", taxCategory: "A", retailRate: 45000 } })).id;
    parts.wiper = (await db.sparePart.create({ data: { partNumber: `QC-WB-${run}`, name: "Rear wiper blade", taxCategory: "A", retailRate: 8500 } })).id;
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  /** A job released to repair: brake pads and their labour approved by phone, advance received. */
  async function jobInRepair() {
    const vehicle = await db.vehicle.create({ data: { vin: `QC${run}${randomUUID().slice(0, 6)}`, customerId, catalogueId: variantId, customModel: "Synthetic Sportage", registrationNumber: `KJA-${randomUUID().slice(0, 4)}` } });
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

  const supervisor = (): RepairActor => ({ ...users.supervisor, permissions: ["jobcard:read", "jobcard:update", "qcstatus:update"], branchId });
  const lineOf = async (jobId: string, description: string) => (await repair.view(jobId, tech())).workLines.find((line) => line.description === description)!;

  /** Released, every line started and done by the technician, sent for the quality check. */
  async function jobAtQualityCheck() {
    const jobId = await jobInRepair();
    for (const description of ["Periodic service", "Brake pad replacement"]) {
      const line = await lineOf(jobId, description);
      await repair.moveLine(jobId, line.id, tech(), { action: "START", requestId: randomUUID() });
      await repair.moveLine(jobId, line.id, tech(), { action: "DONE", requestId: randomUUID() });
    }
    const workspace = await stages.act(jobId, { action: "SEND_TO_QC", requestId: randomUUID() }, users.technician);
    expect(workspace.stage).toBe("QUALITY_CHECK");
    return jobId;
  }

  const check = async (jobId: string, overrides: Partial<QualityCheckInput> = {}): Promise<QualityCheckInput> => {
    const view = await qc.view(jobId, supervisor());
    return {
      requestId: randomUUID(),
      outcome: "PASS",
      lines: view.workLines.map((line) => ({ workLineId: line.id, result: "PASS" as const })),
      general: QC_GENERAL_CHECKS.map((item) => ({ code: item.code, passed: true })),
      acOutletTempC: 6,
      roadTestStartKm: 48_262,
      roadTestEndKm: 48_270,
      roadTestNotes: "No abnormal noise.",
      notes: null,
      signatureImage: SIGNATURE,
      ...overrides,
    };
  };

  it("gates the pass and the fail, refuses the wrong person, fails back to repair, repairs and passes", async () => {
    const jobId = await jobAtQualityCheck();
    let view = await qc.view(jobId, supervisor());
    expect(view).toMatchObject({ stage: "QUALITY_CHECK", state: "PENDING", startKm: 48250, access: { canRecord: true, reason: null }, history: [] });
    expect(view.workLines.map((line) => [line.description, line.status])).toEqual([["Periodic service", "DONE"], ["Brake pad replacement", "DONE"]]);
    expect(view.generalChecks.map((item) => item.label)).toContain("Wheel nuts torqued");
    // The technician sees it read only and the server refuses.
    expect((await qc.view(jobId, tech())).access).toEqual({ canRecord: false, reason: "Only the workshop supervisor or the service manager can do the quality check." });
    await expect(qc.record(jobId, tech(), await check(jobId))).rejects.toMatchObject({ statusCode: 403, code: "QC_FORBIDDEN" });

    // Pass gates: every reason, and nothing recorded.
    const brakes = await lineOf(jobId, "Brake pad replacement");
    await expect(
      qc.record(jobId, supervisor(), await check(jobId, { signatureImage: null, roadTestEndKm: null, lines: [{ workLineId: brakes.id, result: "PASS" }] })),
    ).rejects.toMatchObject({ statusCode: 409, code: "QC_BLOCKED", details: { reasons: ["Check every work item: 1 left.", "Enter the road test start and end km.", "Sign the certification."] } });
    // Km validation and the fail's own rules name the field.
    await expect(qc.record(jobId, supervisor(), await check(jobId, { roadTestEndKm: 48_000 }))).rejects.toMatchObject({
      statusCode: 400,
      message: "End km must be the same as or higher than start km.",
      details: { field: "roadTestEndKm" },
    });
    await expect(qc.record(jobId, supervisor(), await check(jobId, { outcome: "FAIL", signatureImage: null }))).rejects.toMatchObject({ statusCode: 400, details: { field: "notes" } });
    await expect(
      qc.record(jobId, supervisor(), await check(jobId, { outcome: "FAIL", signatureImage: null, notes: "Brake still noisy." })),
    ).rejects.toMatchObject({ statusCode: 400, message: "Mark Fail on the work items that need rework.", details: { field: "lines" } });
    expect(await db.inspection.count({ where: { jobCardId: jobId } })).toBe(0);

    // Fail: the job goes back to repair, the brake line reopens, the technician is told.
    const failInput = await check(jobId, {
      outcome: "FAIL",
      signatureImage: null,
      notes: "Brake still noisy at low speed. Recheck front left caliper slider.",
      lines: (await qc.view(jobId, supervisor())).workLines.map((line) => ({ workLineId: line.id, result: line.id === brakes.id ? ("FAIL" as const) : ("PASS" as const) })),
    });
    view = await qc.record(jobId, supervisor(), failInput);
    await qc.record(jobId, supervisor(), failInput);
    expect(view).toMatchObject({ stage: "REPAIR", state: "PENDING", access: { canRecord: false } });
    expect(view.history).toEqual([
      expect.objectContaining({ result: "FAILED", current: false, inspector: "supervisor Synthetic", failedLines: ["Brake pad replacement"], certified: null }),
    ]);
    const job = await db.jobCard.findUniqueOrThrow({ where: { id: jobId }, select: { stage: true, status: true, stageOwnerId: true } });
    expect(job).toEqual({ stage: "REPAIR", status: "IN_PROGRESS", stageOwnerId: users.technician.id });
    expect(await db.inspection.count({ where: { jobCardId: jobId } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "JOB_QC_FAILED", details: { contains: jobId } } })).toBe(1);
    const repairView = await repair.view(jobId, tech());
    expect(repairView.returnedFromQc).toMatchObject({ by: "supervisor Synthetic", note: "Brake still noisy at low speed. Recheck front left caliper slider." });
    expect(repairView.workLines.map((line) => [line.description, line.status, line.returnedFromQc])).toEqual([
      ["Periodic service", "DONE", false],
      ["Brake pad replacement", "NOT_STARTED", true],
    ]);
    await drain(jobId);
    const notice = await db.notification.findFirst({ where: { userId: users.technician.id, type: "JOBCARD_QC_FAILED" } });
    expect(notice?.message).toContain("QC failed");

    // Repair the reopened line: no second labour charge; then the second check.
    const labourBefore = await db.jobCardLabour.count({ where: { jobCardId: jobId } });
    await repair.moveLine(jobId, brakes.id, tech(), { action: "START", requestId: randomUUID() });
    await repair.moveLine(jobId, brakes.id, tech(), { action: "DONE", requestId: randomUUID() });
    expect(await db.jobCardLabour.count({ where: { jobCardId: jobId } })).toBe(labourBefore);
    expect((await lineOf(jobId, "Brake pad replacement")).returnedFromQc).toBe(false);
    await stages.act(jobId, { action: "SEND_TO_QC", requestId: randomUUID() }, users.technician);
    expect((await qc.view(jobId, supervisor())).state).toBe("PENDING");

    // Pass: signed certification, the job goes to the service advisor at Billing (status stays QC).
    view = await qc.record(jobId, supervisor(), await check(jobId));
    expect(view).toMatchObject({ stage: "BILLING", state: "PASSED" });
    expect(view.history.map((row) => [row.result, row.current])).toEqual([["PASSED", true], ["FAILED", false]]);
    expect(view.history[0]).toMatchObject({ roadTest: { startKm: 48_262, endKm: 48_270 }, acOutletTempC: "6.0", certified: { by: "supervisor Synthetic", signed: true } });
    expect(JSON.stringify(view)).not.toContain("base64");
    const passed = await db.inspection.findFirstOrThrow({ where: { jobCardId: jobId, result: "PASSED" }, include: { signature: true } });
    expect(passed.signature?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await db.jobCard.findUniqueOrThrow({ where: { id: jobId }, select: { stage: true, status: true, stageOwnerId: true } })).toEqual({
      stage: "BILLING",
      status: "QC",
      stageOwnerId: users.advisor.id,
    });
    await drain(jobId);
    expect(await db.notification.count({ where: { userId: users.technician.id, type: "JOBCARD_QC_PASSED" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: users.advisor.id, type: "STAGE_HANDOFF" } })).toBeGreaterThan(0);

    // Billing readiness still needs the passed check: ready, then changed labour supersedes it.
    await stages.act(jobId, { action: "MARK_READY", requestId: randomUUID() }, users.advisor);
    const bill = { jobCardId: jobId, serviceAdvisorId: users.advisor.id, actorId: users.advisor.id, partsDiscountPercent: 0, labourDiscountPercent: 0 };
    expect((await billing.previewJobBill(bill)).review).toBeDefined();
    await db.inspection.updateMany({ where: { jobCardId: jobId, supersededAt: null }, data: { supersededAt: new Date() } });
    await expect(billing.previewJobBill(bill)).rejects.toThrow("Record a passed quality check on the job card before billing");
  });

  it("refuses a check on a job that is not at the quality check", async () => {
    const jobId = await jobInRepair();
    expect((await qc.view(jobId, supervisor())).access).toEqual({ canRecord: false, reason: "This job is not at the quality check. Reload the job." });
    await expect(qc.record(jobId, supervisor(), await check(jobId))).rejects.toMatchObject({ statusCode: 409, code: "QC_BLOCKED" });
  });
});

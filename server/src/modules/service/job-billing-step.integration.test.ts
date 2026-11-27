import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { JobCardWorkflowService } from "./job-card-workflow.service";
import type { JobStageService } from "./job-stage.service";
import type { EstimateActor, JobEstimateService } from "./job-estimate.service";
import type { JobRepairService, RepairActor } from "./job-repair.service";
import type { JobQualityCheckService } from "./job-quality-check.service";
import type { JobBillingService } from "../finance/job-billing.service";
import type { JobBillingStepService } from "./job-billing-step.service";
import type { ReceiptService } from "../finance/receipt.service";
import { QC_GENERAL_CHECKS, type QualityCheckInput } from "./job-quality-check.logic";

const database = process.env.TEST_DATABASE_URL;
const describeDb = database ? describe : describe.skip;
jest.setTimeout(120000);

const SIGNATURE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";
const DAY = 86_400_000;

describeDb("Billing: ready, notify, invoice, pay and delivery on isolated local PostgreSQL (job card revamp phase 8)", () => {
  let db: PrismaClient;
  let workflow: JobCardWorkflowService;
  let stages: JobStageService;
  let estimates: JobEstimateService;
  let repair: JobRepairService;
  let qc: JobQualityCheckService;
  let billing: JobBillingService;
  let step: JobBillingStepService;
  let receipts: ReceiptService;
  const run = `${Date.now()}`;
  let branchName: string;
  let branchId: string;
  let serviceTypeId: string;
  let customerId: string;
  let variantId: string;
  const parts: Record<"pads" | "wiper", string> = {} as never;
  const labour: Record<"brakes" | "wiper", string> = {} as never;
  type Key = "advisor" | "technician" | "otherTech" | "store" | "supervisor" | "biller" | "cashier" | "manager";
  const users: Record<Key, { id: string; role: string }> = {} as never;
  const ADVISOR = ["jobcard:read", "jobcard:update", "estimate:read", "estimate:create", "estimate:sign"];
  const advisor = (): EstimateActor => ({ ...users.advisor, permissions: ADVISOR });
  const tech = (key: "technician" | "otherTech" = "technician"): RepairActor => ({ ...users[key], permissions: ["jobcard:read", "jobcard:update", "jobprogress:update"], branchId });

  beforeAll(async () => {
    if (!database || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(database).hostname))
      throw new Error("Billing tests require a disposable localhost database");
    process.env.DATABASE_URL = database;
    db = require("../../prisma/client").default;
    workflow = new (require("./job-card-workflow.service").JobCardWorkflowService)();
    stages = new (require("./job-stage.service").JobStageService)();
    estimates = new (require("./job-estimate.service").JobEstimateService)();
    repair = new (require("./job-repair.service").JobRepairService)();
    qc = new (require("./job-quality-check.service").JobQualityCheckService)();
    billing = new (require("../finance/job-billing.service").JobBillingService)();
    step = new (require("./job-billing-step.service").JobBillingStepService)();
    receipts = new (require("../finance/receipt.service").ReceiptService)();
    branchName = `Billing fixture ${run}`;
    branchId = (await db.branch.create({ data: { name: branchName } })).id;
    const person = async (key: Key, role: string) => {
      const roleId = (await db.role.upsert({ where: { name: role }, update: {}, create: { name: role } })).id;
      const user = await db.user.create({
        data: { firstName: key, lastName: "Synthetic", email: `bill-${key}-${run}@example.test`, passwordHash: "test-fixture-not-a-login-hash", roleId, branchId },
      });
      users[key] = { id: user.id, role };
    };
    await person("advisor", "ServiceAdviser");
    await person("technician", "Technician");
    await person("otherTech", "Technician");
    await person("store", "StoreOfficer");
    await person("supervisor", "WorkshopManager");
    await person("biller", "BillingOfficer");
    await person("cashier", "Accountant");
    await person("manager", "ServiceManager");
    customerId = (await db.customer.create({ data: { firstName: "Adaeze", lastName: "Synthetic", branchId, phoneNumber: "0803 555 0142" } })).id;
    const modelId = (await db.workshopMaster.create({ data: { kind: "MODEL", code: `BL-M-${run}`, description: "Synthetic Sportage" } })).id;
    variantId = (await db.workshopMaster.create({ data: { kind: "VARIANT", code: `BL-V-${run}`, description: "Sportage 2.0", parentId: modelId } })).id;
    serviceTypeId = (await db.workshopMaster.create({ data: { kind: "SERVICE_TYPE", code: `BL-S-${run}`, description: "Periodic service" } })).id;
    await db.serviceTypeModelSetting.create({ data: { serviceTypeId, modelId, serviceCharge: 25000 } });
    labour.brakes = (await db.labourItem.create({ data: { code: `BL-L-${run}`, description: "Brake pad replacement", rate: 15000 } })).id;
    labour.wiper = (await db.labourItem.create({ data: { code: `BL-W-${run}`, description: "Wiper blade replacement", rate: 3000 } })).id;
    parts.pads = (await db.sparePart.create({ data: { partNumber: `BL-P-${run}`, name: "Front brake pads set", taxCategory: "A", retailRate: 45000 } })).id;
    parts.wiper = (await db.sparePart.create({ data: { partNumber: `BL-WB-${run}`, name: "Rear wiper blade", taxCategory: "A", retailRate: 8500 } })).id;
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  /** A job released to repair: brake pads and their labour approved by phone, advance received. */
  async function jobInRepair() {
    const vehicle = await db.vehicle.create({ data: { vin: `BL${run}${randomUUID().slice(0, 6)}`, customerId, catalogueId: variantId, customModel: "Synthetic Sportage", registrationNumber: `KJA-${randomUUID().slice(0, 4)}` } });
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

  const ADVISOR_ACTOR = (): RepairActor => ({ ...users.advisor, permissions: ADVISOR, branchId });
  const billerActor = (): RepairActor => ({ ...users.biller, permissions: ["jobcard:read", "invoice:read", "invoice:job-bill:create"], branchId });
  const cashierActor = (): RepairActor => ({ ...users.cashier, permissions: ["jobcard:read", "receipt:create", "invoice:read"], branchId });
  const managerActor = (): RepairActor => ({ ...users.manager, permissions: ["jobcard:read", "jobcard:update"], branchId });

  /** Through the quality check: passed, at Billing with the advisor, status QC. */
  async function jobAtBilling() {
    const jobId = await jobAtQualityCheck();
    const view = await qc.record(jobId, supervisor(), await check(jobId));
    expect(view.stage).toBe("BILLING");
    return jobId;
  }
  const bill = (jobId: string, extra: Record<string, unknown> = {}) =>
    billing.createJobBill({ jobCardId: jobId, serviceAdvisorId: users.advisor.id, actorId: users.biller.id, partsDiscountPercent: 0, labourDiscountPercent: 0, ...extra });
  const sendToDelivery = (jobId: string) => stages.act(jobId, { action: "SEND_TO_DELIVERY", requestId: randomUUID() }, users.advisor);
  const deliveryAction = async (jobId: string) =>
    (await stages.workspace(jobId, users.advisor)).actions.find((action) => action.action === "SEND_TO_DELIVERY");

  it("marks ready and notifies, counts storage, invoices with the storage decision, takes payment and sends to delivery", async () => {
    const jobId = await jobAtBilling();
    let view = await step.view(jobId, ADVISOR_ACTOR());
    expect(view).toMatchObject({ stage: "BILLING", status: "QC", notices: [], washed: null, invoice: null, paymentStatus: "NOT_INVOICED" });
    expect(view.storage).toEqual({ notifiedAt: null, freeHours: 48, dailyRate: "2000.00" });
    expect(view.access).toMatchObject({ canMarkReady: true, canNotify: false, canMarkWashed: true, canCreateInvoice: false, canRecordPayment: false });
    // Estimated and actual: the pads were approved but never issued by the store, so actual parts are lower.
    expect(view.comparison.rows!.find((row) => row.group === "PARTS")).toEqual({ group: "PARTS", estimated: "45000.00", actual: "0.00", difference: "-45000.00" });
    expect(view.comparison.rows!.find((row) => row.group === "LABOUR")).toMatchObject({ estimated: "15000.00", actual: "15000.00", difference: "0.00" });
    expect(view.comparison.rows!.find((row) => row.group === "TOTAL")).toMatchObject({ difference: "-45000.00" });

    // Only the service advisor marks ready; the input names the fix.
    const ready = { requestId: randomUUID(), channel: "PHONE_CALL" as const, note: "Customer will collect tomorrow morning." };
    await expect(step.markReady(jobId, managerActor(), ready)).rejects.toMatchObject({ statusCode: 403, code: "BILLING_FORBIDDEN" });
    await expect(step.notifyAgain(jobId, ADVISOR_ACTOR(), { ...ready, requestId: randomUUID() })).rejects.toMatchObject({
      statusCode: 409,
      message: "Mark the vehicle ready first. That records the first notice.",
    });
    view = await step.markReady(jobId, ADVISOR_ACTOR(), ready);
    await step.markReady(jobId, ADVISOR_ACTOR(), ready);
    expect(view).toMatchObject({ status: "READY", paymentStatus: "NOT_INVOICED" });
    expect(view.notices).toEqual([expect.objectContaining({ channel: "PHONE_CALL", phone: "0803 555 0142", note: ready.note, by: "advisor Synthetic" })]);
    expect(view.storage).toMatchObject({ days: 0, proposedAmount: "0.00", running: true, dailyRate: "2000.00", freeHours: 48 });
    expect(await db.customerContact.count({ where: { jobCardId: jobId } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "JOB_VEHICLE_READY_NOTIFIED", details: { contains: jobId } } })).toBe(1);
    expect(await db.jobCard.findUniqueOrThrow({ where: { id: jobId }, select: { stage: true, status: true, stageOwnerRole: true } })).toEqual({
      stage: "BILLING", status: "READY", stageOwnerRole: "BillingOfficer",
    });

    // Send again keeps the first notice for storage; the washed tick is stored with who.
    view = await step.notifyAgain(jobId, ADVISOR_ACTOR(), { requestId: randomUUID(), channel: "SMS", note: null });
    expect(view.notices.map((notice) => notice.channel)).toEqual(["SMS", "PHONE_CALL"]);
    view = await step.setWashed(jobId, ADVISOR_ACTOR(), true);
    expect(view.washed).toMatchObject({ by: "advisor Synthetic" });
    await expect(step.setWashed(jobId, tech(), false)).rejects.toMatchObject({ statusCode: 403 });

    // Not yet invoiced: delivery is blocked with the reason; the billing officer can invoice.
    expect(await deliveryAction(jobId)).toMatchObject({ enabled: false, reasons: ["Create the invoice before sending the job to delivery."] });
    expect((await step.view(jobId, billerActor())).access).toMatchObject({ canCreateInvoice: true, canMarkReady: false });

    // Four days after the first notice: two days of storage are proposed and need an answer.
    const first = await db.customerContact.findFirstOrThrow({ where: { jobCardId: jobId, channel: "PHONE_CALL" } });
    await db.customerContact.update({ where: { id: first.id }, data: { contactedAt: new Date(Date.now() - 4 * DAY - 60_000) } });
    view = await step.view(jobId, billerActor());
    expect(view.draft).toMatchObject({ blockers: [], storage: { days: 2, proposedAmount: "4000.00" } });
    await expect(bill(jobId)).rejects.toMatchObject({
      statusCode: 400,
      message: "Accept the storage charge of ₦4,000.00 (2 days), or remove it with a reason.",
      details: { field: "storageCharge" },
    });
    // ₦20,000.00 of the advance is still held, so a balance is left after it is applied.
    await db.receipt.updateMany({ where: { advanceJobCardId: jobId }, data: { advanceAmount: 20000 } });
    const requestId = randomUUID();
    const invoice = await bill(jobId, { requestId, storageCharge: { decision: "REMOVE", reason: "Customer was told late; waived by the service manager." } });
    expect((await bill(jobId, { requestId, storageCharge: { decision: "ACCEPT" } })).id).toBe(invoice.id);
    expect(invoice.lines.some((line) => line.description.startsWith("Storage charge"))).toBe(false);
    const removed = await db.auditLog.findFirstOrThrow({ where: { action: "JOB_STORAGE_CHARGE_REMOVED", details: { contains: invoice.id } } });
    expect(JSON.parse(removed.details!)).toMatchObject({ days: 2, amount: "4000.00", reason: "Customer was told late; waived by the service manager." });

    // Invoiced: the job stays at Billing with the advisor until it is paid.
    expect(await db.jobCard.findUniqueOrThrow({ where: { id: jobId }, select: { stage: true, status: true, stageOwnerId: true } })).toEqual({
      stage: "BILLING", status: "BILLED", stageOwnerId: users.advisor.id,
    });
    view = await step.view(jobId, cashierActor());
    expect(view.invoice).toMatchObject({ number: invoice.invoiceNumber, advancePaid: "20000.00", paymentsReceived: "0.00" });
    expect(view.paymentStatus).toBe("UNPAID");
    expect(view.access).toMatchObject({ canRecordPayment: true, canCreateInvoice: false });
    expect(view.storage).toMatchObject({ days: 2, running: false });
    const balance = view.invoice!.balanceDue;
    expect(Number(balance)).toBeGreaterThan(0);
    const due = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(Number(balance));
    expect(view.deliveryProblem).toBe(`Balance of ${due} not yet paid.`);
    expect(await deliveryAction(jobId)).toMatchObject({ enabled: false, reasons: [`Balance of ${due} not yet paid.`] });
    await expect(sendToDelivery(jobId)).rejects.toMatchObject({ statusCode: 409, code: "STAGE_ACTION_BLOCKED" });

    // The cashier records the rest through the existing receipt; then the advisor sends it to delivery.
    await receipts.createReceipt({
      customerId, branchId, issuedById: users.cashier.id, mode: "CASH", category: "SERVICE_PARTS", amount: Number(balance),
      idempotencyKey: randomUUID(), allocations: [{ invoiceId: invoice.id, amount: Number(balance) }],
    });
    view = await step.view(jobId, ADVISOR_ACTOR());
    expect(view).toMatchObject({ paymentStatus: "PAID", deliveryProblem: null, invoice: { balanceDue: "0.00" } });
    const workspace = await sendToDelivery(jobId);
    expect(workspace.stage).toBe("DELIVERY");
    expect(await db.jobCard.findUniqueOrThrow({ where: { id: jobId }, select: { stage: true, status: true, stageOwnerId: true } })).toEqual({
      stage: "DELIVERY", status: "BILLED", stageOwnerId: users.advisor.id,
    });
    expect(await db.jobStageEvent.count({ where: { jobCardId: jobId, action: "SEND_TO_DELIVERY" } })).toBe(1);
    // Washed is ticked on Billing only.
    await expect(step.setWashed(jobId, ADVISOR_ACTOR(), false)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("accepts a storage charge as a bill line, cancels the bill back to ready, and lets credit through unpaid", async () => {
    const jobId = await jobAtBilling();
    await step.markReady(jobId, ADVISOR_ACTOR(), { requestId: randomUUID(), channel: "SMS", note: null });
    await db.customerContact.updateMany({ where: { jobCardId: jobId }, data: { contactedAt: new Date(Date.now() - 3 * DAY - 60_000) } });
    // No advance held for this job, so its bill has nothing allocated and can be cancelled.
    await db.receipt.updateMany({ where: { advanceJobCardId: jobId }, data: { advanceAmount: 0 } });
    const invoice = await bill(jobId, { requestId: randomUUID(), storageCharge: { decision: "ACCEPT" } });
    const line = invoice.lines.find((row) => row.description.startsWith("Storage charge"));
    expect(line).toMatchObject({ type: "SERVICE", quantity: 1, rate: 2000, amount: 2000, customerPaid: true });
    expect(line!.description).toBe("Storage charge, 1 day at ₦2,000.00 per day (terms clause 3)");
    expect(await db.auditLog.count({ where: { action: "JOB_STORAGE_CHARGE_ADDED", details: { contains: invoice.id } } })).toBe(1);

    // The bill is cancelled: the job goes back to ready at Billing, and the screen says who and why.
    await billing.cancelJobBill(invoice.id, users.biller.id, "Wrong labour hours, rebilling.");
    let view = await step.view(jobId, ADVISOR_ACTOR());
    expect(view).toMatchObject({ status: "READY", invoice: null, cancelledBill: { number: invoice.invoiceNumber, reason: "Wrong labour hours, rebilling.", by: "biller Synthetic" } });
    expect(await db.jobCard.findUniqueOrThrow({ where: { id: jobId }, select: { stage: true } })).toEqual({ stage: "BILLING" });

    // Credit: the service manager approves; the screen names who and when; delivery is allowed unpaid.
    expect((await step.view(jobId, managerActor())).access.canApproveCredit).toBe(true);
    expect((await step.view(jobId, ADVISOR_ACTOR())).access.canApproveCredit).toBe(false);
    await workflow.approveCredit(jobId, users.manager.id, "Fleet customer on 30-day terms.");
    view = await step.view(jobId, ADVISOR_ACTOR());
    expect(view.credit).toMatchObject({ by: "manager Synthetic", role: "ServiceManager" });
    expect(view.credit!.at).toBeInstanceOf(Date);
    expect(view.deliveryProblem).toBeNull();
    const workspace = await sendToDelivery(jobId);
    expect(workspace.stage).toBe("DELIVERY");
    expect(await db.jobCard.findUniqueOrThrow({ where: { id: jobId }, select: { status: true } })).toEqual({ status: "READY" });
  });

  it("refuses ready and notice actions off the Billing step", async () => {
    const jobId = await jobAtQualityCheck();
    await expect(step.markReady(jobId, ADVISOR_ACTOR(), { requestId: randomUUID(), channel: "PHONE_CALL", note: null })).rejects.toMatchObject({
      statusCode: 409,
      code: "BILLING_BLOCKED",
    });
    expect((await step.view(jobId, ADVISOR_ACTOR())).access).toMatchObject({ canMarkReady: false, canMarkWashed: false });
  });
});

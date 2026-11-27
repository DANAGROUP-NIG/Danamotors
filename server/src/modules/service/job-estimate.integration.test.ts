import { randomUUID } from "node:crypto";
import type { FindingPayer, PrismaClient } from "@prisma/client";
import type { JobCardWorkflowService } from "./job-card-workflow.service";
import type { JobStageService } from "./job-stage.service";
import type { EstimateActor, JobEstimateService } from "./job-estimate.service";
import type { JobBillingService } from "../finance/job-billing.service";

const database = process.env.TEST_DATABASE_URL;
const describeDb = database ? describe : describe.skip;
jest.setTimeout(120000);

// A small valid PNG signature (the server checks the PNG header and size).
const SIGNATURE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";
const DAY = 86_400_000;

describeDb("Estimate, approval, advance and release on isolated local PostgreSQL (job card revamp phase 5)", () => {
  let db: PrismaClient;
  let workflow: JobCardWorkflowService;
  let stages: JobStageService;
  let estimates: JobEstimateService;
  let billing: JobBillingService;
  const run = `${Date.now()}`;
  let branchName: string;
  let branchId: string;
  let serviceTypeId: string;
  let customerId: string;
  let variantId: string;
  const parts: Record<"pads" | "filter" | "compressor", string> = {} as never;
  let labourId: string;
  type Key = "advisor" | "technician" | "manager" | "cashier" | "store";
  const users: Record<Key, { id: string; role: string }> = {} as never;
  const ADVISOR_PERMISSIONS = ["jobcard:read", "jobcard:update", "estimate:read", "estimate:create", "estimate:sign", "receipt:create"];
  const advisor = (): EstimateActor => ({ ...users.advisor, permissions: ADVISOR_PERMISSIONS });
  const manager = (): EstimateActor => ({ ...users.manager, permissions: ["jobcard:read", "jobcard:update", "estimate:read"] });

  beforeAll(async () => {
    if (!database || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(database).hostname))
      throw new Error("Estimate tests require a disposable localhost database");
    process.env.DATABASE_URL = database;
    db = require("../../prisma/client").default;
    workflow = new (require("./job-card-workflow.service").JobCardWorkflowService)();
    stages = new (require("./job-stage.service").JobStageService)();
    estimates = new (require("./job-estimate.service").JobEstimateService)();
    billing = new (require("../finance/job-billing.service").JobBillingService)();
    branchName = `Estimate fixture ${run}`;
    branchId = (await db.branch.create({ data: { name: branchName } })).id;
    const receiptCreate = await db.permission.upsert({ where: { name: "receipt:create" }, update: {}, create: { name: "receipt:create" } });
    const person = async (key: Key, role: string) => {
      const roleId = (await db.role.upsert({ where: { name: role }, update: {}, create: { name: role } })).id;
      if (key === "cashier")
        await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId, permissionId: receiptCreate.id } }, update: {}, create: { roleId, permissionId: receiptCreate.id } });
      const user = await db.user.create({
        data: { firstName: key, lastName: "Synthetic", email: `est-${key}-${run}@example.test`, passwordHash: "test-fixture-not-a-login-hash", roleId, branchId },
      });
      users[key] = { id: user.id, role };
    };
    await person("advisor", "ServiceAdviser");
    await person("technician", "Technician");
    await person("manager", "ServiceManager");
    await person("cashier", `Cashier ${run}`);
    customerId = (await db.customer.create({ data: { firstName: "Adaeze", lastName: "Synthetic", branchId } })).id;
    const modelId = (await db.workshopMaster.create({ data: { kind: "MODEL", code: `ES-M-${run}`, description: "Synthetic Sportage" } })).id;
    variantId = (await db.workshopMaster.create({ data: { kind: "VARIANT", code: `ES-V-${run}`, description: "Sportage 2.0", parentId: modelId } })).id;
    serviceTypeId = (await db.workshopMaster.create({ data: { kind: "SERVICE_TYPE", code: `ES-S-${run}`, description: "Periodic service" } })).id;
    await db.serviceTypeModelSetting.create({ data: { serviceTypeId, modelId, serviceCharge: 25000 } });
    labourId = (await db.labourItem.create({ data: { code: `ES-L-${run}`, description: "Brake pad replacement", rate: 15000 } })).id;
    parts.pads = (await db.sparePart.create({ data: { partNumber: `ES-P-${run}`, name: "Front brake pads set", taxCategory: "A", retailRate: 45000 } })).id;
    parts.filter = (await db.sparePart.create({ data: { partNumber: `ES-F-${run}`, name: "Air filter", taxCategory: "A", retailRate: 12000 } })).id;
    parts.compressor = (await db.sparePart.create({ data: { partNumber: `ES-C-${run}`, name: "AC compressor", taxCategory: "A", retailRate: 480000, warrantyApplicable: true } })).id;
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  /** A job at the estimate step with a technician and diagnosed items (who pays already decided). */
  async function jobAtEstimate(items: { kind: "PART" | "LABOUR"; ref: () => string; description: string; quantity: number; payer: FindingPayer }[]) {
    const vehicle = await db.vehicle.create({ data: { vin: `EST${run}${randomUUID().slice(0, 6)}`, customerId, catalogueId: variantId, customModel: "Synthetic Sportage", registrationNumber: `KJA-${randomUUID().slice(0, 4)}` } });
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
    for (const [index, item] of items.entries())
      await db.jobFindingItem.create({
        data: { findingId: finding.id, kind: item.kind, referenceId: item.ref(), description: item.description, quantity: item.quantity, sortOrder: index, payer: item.payer, decidedAt: new Date() },
      });
    return { id: job.id, vehicleId: vehicle.id };
  }

  const pads = { kind: "PART" as const, ref: () => parts.pads, description: "Front brake pads set", quantity: 1, payer: "CUSTOMER" as const };
  const labour = { kind: "LABOUR" as const, ref: () => labourId, description: "Brake pad replacement", quantity: 1, payer: "CUSTOMER" as const };
  const filter = { kind: "PART" as const, ref: () => parts.filter, description: "Air filter", quantity: 1, payer: "CUSTOMER" as const };
  const compressor = { kind: "PART" as const, ref: () => parts.compressor, description: "AC compressor", quantity: 1, payer: "WARRANTY" as const };
  const decide = (lines: { id: string; payer: string; description: string }[], declined: string[]) =>
    lines.filter((line) => line.payer === "CUSTOMER").map((line) => ({ lineId: line.id, decision: declined.includes(line.description) ? ("DECLINED" as const) : ("APPROVED" as const) }));

  it("prepares, approves partly with a signature, requests parts once, then releases after the advance", async () => {
    const job = await jobAtEstimate([pads, labour, filter, compressor]);
    const store = await db.user.create({
      data: { firstName: "Store", lastName: "Synthetic", email: `est-store-${run}@example.test`, passwordHash: "test-fixture-not-a-login-hash", branchId, roleId: (await db.role.upsert({ where: { name: "StoreOfficer" }, update: {}, create: { name: "StoreOfficer" } })).id },
    });

    // Prepare: service charge plus one line per item, priced from the catalogue, payer from the warranty check.
    let step = await estimates.prepare(job.id, advisor());
    const estimate = step.estimate!;
    expect(estimate.version).toBe(1);
    expect(estimate.lines.map((line) => [line.description, line.payer, line.amount])).toEqual([
      ["Periodic service", "CUSTOMER", "25000.00"],
      ["Front brake pads set", "CUSTOMER", "45000.00"],
      ["Brake pad replacement", "CUSTOMER", "15000.00"],
      ["Air filter", "CUSTOMER", "12000.00"],
      ["AC compressor", "WARRANTY", "480000.00"],
    ]);
    expect(estimate.totals).toMatchObject({ customerSubtotal: "97000.00", vat: "7275.00", customerTotal: "104275.00", otherPayerTotal: "480000.00" });
    // Repeating Prepare returns the same estimate.
    expect((await estimates.prepare(job.id, advisor())).estimate!.id).toBe(estimate.id);

    // Save the draft: two sets of pads and a 30% advance; a stale save is refused.
    const lines = estimate.lines.map((line) => ({
      type: line.type as "PART" | "LABOUR" | "SERVICE",
      referenceId: line.referenceId!,
      quantity: line.description === "Front brake pads set" ? 2 : Number(line.quantity),
      payer: line.payer,
      findingItemId: line.findingItemId,
      complaintId: line.complaintId,
    }));
    step = await estimates.saveDraft(job.id, advisor(), { estimateId: estimate.id, updatedAt: estimate.updatedAt.toISOString(), upfrontPaymentPercent: 30, lines });
    expect(step.estimate!.totals.customerSubtotal).toBe("142000.00");
    expect(step.estimate!.version).toBe(1);
    await expect(
      estimates.saveDraft(job.id, advisor(), { estimateId: estimate.id, updatedAt: estimate.updatedAt.toISOString(), upfrontPaymentPercent: 30, lines }),
    ).rejects.toThrow("Someone else saved this estimate");
    // A diagnosed warranty item cannot be switched to customer pay here.
    await expect(
      estimates.saveDraft(job.id, advisor(), {
        estimateId: estimate.id,
        updatedAt: step.estimate!.updatedAt.toISOString(),
        upfrontPaymentPercent: 30,
        lines: lines.map((line) => (line.payer === "WARRANTY" ? { ...line, payer: "CUSTOMER" as const } : line)),
      }),
    ).rejects.toThrow("Ask the warranty officer to change it");

    // Approval needs the estimate presented first; the technician cannot do it.
    const draft = step.estimate!;
    const approval = {
      estimateId: draft.id,
      expectedHash: draft.contentHash,
      decisions: decide(draft.lines, ["Air filter"]),
      signer: "OWNER" as const,
      signerName: "Adaeze Synthetic",
      signatureImage: SIGNATURE,
      consentAccepted: true as const,
      requestId: randomUUID(),
    };
    await expect(estimates.approve(job.id, advisor(), approval, "test")).rejects.toThrow("Present the estimate");
    await estimates.presentToCustomer(job.id, advisor(), draft.id);
    await expect(estimates.approve(job.id, { ...users.technician, permissions: ADVISOR_PERMISSIONS }, approval, "test")).rejects.toThrow("Only the service advisor");

    step = await estimates.approve(job.id, advisor(), approval, "test");
    expect(step.estimate!.outcome).toBe("PARTIAL");
    expect(step.estimate!.approval).toMatchObject({ channel: "COUNTER", signatureState: "valid", approvedCount: 4, declinedCount: 1 });
    // 142,000 - 12,000 = 130,000 + 7.5% VAT
    expect(step.estimate!.totals.approvedTotal).toBe("139750.00");
    const signature = await db.estimateSignature.findFirstOrThrow({ where: { estimateId: draft.id } });
    expect(signature.totalSigned.toFixed(2)).toBe("139750.00");
    expect(signature.hashVersion).toBe(2);
    // A retry of the same request returns the first decision.
    await estimates.approve(job.id, advisor(), approval, "test");
    expect(await db.customerApproval.count({ where: { estimateId: draft.id } })).toBe(1);

    // Parts request: once, approved parts only (pads x2 and the warranty compressor, not the declined filter).
    expect(step.partsRequest).toMatchObject({ needed: true, status: "SENT", itemCount: 2 });
    await estimates.retryPartsRequest(job.id, advisor());
    expect(await db.jobPartsRequest.count({ where: { jobCardId: job.id } })).toBe(1);
    const request = await db.jobPartsRequest.findFirstOrThrow({ where: { jobCardId: job.id } });
    expect(request.lines).toEqual([
      { sparePartId: parts.pads, description: "Front brake pads set", quantity: "2.00" },
      { sparePartId: parts.compressor, description: "AC compressor", quantity: "1.00" },
    ]);
    expect(await db.jobcardNotificationEvent.count({ where: { jobCardId: job.id, id: { contains: "PART_REQUESTED" } } })).toBe(1);
    // The request does not touch stock: no stock rows or movements, no requisition.
    expect(await db.stockTransaction.count({ where: { partId: { in: Object.values(parts) } } })).toBe(0);
    expect(await db.inventoryStock.count({ where: { partId: { in: Object.values(parts) } } })).toBe(0);
    expect(await db.partRequisition.count({ where: { jobCardId: job.id } })).toBe(0);

    // The declined filter is recommended work on the vehicle's next visit.
    const declined = await require("./job-estimate.service").vehicleDeclinedItems(db, job.vehicleId);
    expect(declined.map((item: { description: string }) => item.description)).toEqual(["Air filter"]);

    // Release is blocked until the cashier records the advance; the cashier is told.
    let workspace = await stages.workspace(job.id, users.advisor);
    let release = workspace.actions.find((action) => action.action === "RELEASE_TO_REPAIR")!;
    expect(release.enabled).toBe(false);
    expect(release.reasons).toEqual(["Ask the cashier to record the advance before work starts"]);
    expect(workspace.subStep).toBe("ADVANCE_PAYMENT");
    const notice = await estimates.notifyCashier(job.id, advisor(), { requestId: randomUUID() });
    expect(notice.notified).toEqual(["cashier Synthetic"]);
    expect(await db.notification.count({ where: { userId: users.cashier.id, type: "ADVANCE_REQUESTED" } })).toBe(1);

    await db.receipt.create({
      data: { receiptNumber: `RCT-${run}`, customerId, branchId, amount: 50000, advanceAmount: 50000, advanceJobCardId: job.id, issuedAt: new Date(Date.now() - 60_000) },
    });
    step = await estimates.view(job.id, advisor());
    expect(step.advance).toMatchObject({ required: true, payable: "139750.00", received: "50000.00", balance: "89750.00", suggestedAmount: "41925.00" });
    workspace = await stages.workspace(job.id, users.advisor);
    release = workspace.actions.find((action) => action.action === "RELEASE_TO_REPAIR")!;
    expect(release.enabled).toBe(true);

    workspace = await stages.act(job.id, { action: "RELEASE_TO_REPAIR", requestId: randomUUID() }, users.advisor);
    expect(workspace.stage).toBe("REPAIR");
    expect(workspace.status).toBe("IN_PROGRESS");
    expect(workspace.owner).toMatchObject({ id: users.technician.id, role: "Technician" });
    expect(await db.auditLog.count({ where: { action: { in: ["ESTIMATE_CREATED", "ESTIMATE_DRAFT_SAVED", "ESTIMATE_PRESENTED", "ESTIMATE_DECISION_RECORDED", "JOB_PARTS_REQUEST_SENT"] }, details: { contains: job.id } } })).toBe(5);
    void store;
  });

  it("everything declined: waiver declined by the manager, the charge goes to billing as the only bill line", async () => {
    const job = await jobAtEstimate([pads]);
    let step = await estimates.prepare(job.id, advisor());
    await estimates.presentToCustomer(job.id, advisor(), step.estimate!.id);
    step = await estimates.approve(
      job.id,
      advisor(),
      {
        estimateId: step.estimate!.id,
        expectedHash: step.estimate!.contentHash,
        decisions: decide(step.estimate!.lines, ["Periodic service", "Front brake pads set"]),
        signer: "REPRESENTATIVE",
        signerName: "Emeka Synthetic",
        signerPhone: "0803 555 0142",
        signatureImage: SIGNATURE,
        consentAccepted: true,
        requestId: randomUUID(),
      },
      "test",
    );
    expect(step.estimate!.outcome).toBe("ALL_DECLINED");
    expect(step.estimate!.approval).toMatchObject({ relationship: "Representative", signerPhone: "08035550142" });
    // 70,000 + VAT = 75,250; 10% is 7,525, so the 25,000 minimum applies.
    expect(step.estimationCharge).toMatchObject({ proposedAmount: "25000.00", record: null });
    expect(step.partsRequest.status).toBeNull();

    let workspace = await stages.workspace(job.id, users.advisor);
    expect(workspace.subStep).toBe("ESTIMATE_DECLINED");
    expect(workspace.actions.map((action) => action.action)).not.toContain("RELEASE_TO_REPAIR");
    expect(workspace.actions.find((action) => action.action === "SEND_DECLINED_TO_BILLING")?.reasons).toEqual(["Add the estimation charge, or request a waiver."]);

    await expect(estimates.requestWaiver(job.id, advisor(), { reason: "no", requestId: randomUUID() })).rejects.toThrow();
    step = await estimates.requestWaiver(job.id, advisor(), { reason: "Long-standing fleet customer", requestId: randomUUID() });
    expect(step.estimationCharge!.record).toMatchObject({ status: "WAIVER_REQUESTED", waiverReason: "Long-standing fleet customer" });
    expect(await db.notification.count({ where: { userId: users.manager.id, type: "ESTIMATION_WAIVER_REQUESTED" } })).toBe(1);
    await expect(estimates.decideWaiver(job.id, advisor(), { approve: true, requestId: randomUUID() })).rejects.toThrow("Only a service manager");
    step = await estimates.decideWaiver(job.id, manager(), { approve: false, note: "Policy applies to fleets too", requestId: randomUUID() });
    expect(step.estimationCharge!.record).toMatchObject({ status: "ADDED", amount: "25000.00", decidedBy: "manager Synthetic" });

    workspace = await stages.act(job.id, { action: "SEND_DECLINED_TO_BILLING", requestId: randomUUID() }, users.advisor);
    expect(workspace.stage).toBe("BILLING");
    expect(workspace.status).toBe("READY");
    const preview = await billing.previewJobBill({ jobCardId: job.id, partsDiscountPercent: 0, labourDiscountPercent: 0 });
    expect(preview.lines.map((line) => [line.description, line.amount])).toEqual([["Estimation charge (terms clause 4)", 25000]]);
    expect(await db.auditLog.count({ where: { action: { in: ["ESTIMATION_WAIVER_REQUESTED", "ESTIMATION_WAIVER_DECLINED"] }, details: { contains: job.id } } })).toBe(2);
  });

  it("phone approval for a warranty-only job: no advance needed, signature due at delivery; parts request fails then retries", async () => {
    await db.user.updateMany({ where: { branchId, role: { name: "StoreOfficer" } }, data: { isActive: false } });
    const job = await jobAtEstimate([compressor]);
    await db.jobCard.update({ where: { id: job.id }, data: { serviceTypeId: null, serviceCharge: null } });
    let step = await estimates.prepare(job.id, advisor());
    expect(step.estimate!.totals.customerTotal).toBe("0.00");
    step = await estimates.phoneApproval(job.id, advisor(), {
      estimateId: step.estimate!.id,
      expectedHash: step.estimate!.contentHash,
      approverName: "Adaeze Synthetic",
      approverPhone: "+234 803 555 0142",
      approvedAt: new Date(Date.now() - 60_000).toISOString(),
      approvedLineIds: [],
      requestId: randomUUID(),
    });
    expect(step.estimate!.approval).toMatchObject({ channel: "PHONE", signatureState: "phone", approverPhone: "08035550142", signatureDueAtDelivery: true });
    expect(step.advance).toMatchObject({ required: false, exemption: "WARRANTY_ONLY", automatic: true });
    expect(step.partsRequest).toMatchObject({ status: "FAILED" });
    expect(step.partsRequest.failure).toContain("No store manager is active in this branch");

    await db.user.updateMany({ where: { branchId, role: { name: "StoreOfficer" } }, data: { isActive: true } });
    step = await estimates.retryPartsRequest(job.id, advisor());
    expect(step.partsRequest).toMatchObject({ status: "SENT", itemCount: 1 });
    expect((await db.jobPartsRequest.findFirstOrThrow({ where: { jobCardId: job.id } })).attempts).toBe(2);

    const workspace = await stages.act(job.id, { action: "RELEASE_TO_REPAIR", requestId: randomUUID() }, users.advisor);
    expect(workspace.status).toBe("IN_PROGRESS");
  });

  it("a manager records that no advance is needed; the gate then lets work start", async () => {
    const job = await jobAtEstimate([pads]);
    let step = await estimates.prepare(job.id, advisor());
    await estimates.presentToCustomer(job.id, advisor(), step.estimate!.id);
    step = await estimates.approve(
      job.id,
      advisor(),
      { estimateId: step.estimate!.id, expectedHash: step.estimate!.contentHash, decisions: decide(step.estimate!.lines, []), signer: "OWNER", signerName: "Adaeze Synthetic", signatureImage: SIGNATURE, consentAccepted: true, requestId: randomUUID() },
      "test",
    );
    expect(step.advance.required).toBe(true);
    await expect(estimates.setExemption(job.id, advisor(), { exemption: "CREDIT_APPROVED", reason: "Fleet account" })).rejects.toThrow("Only a service manager");
    step = await estimates.setExemption(job.id, manager(), { exemption: "CREDIT_APPROVED", reason: "Fleet account on 30-day credit" });
    expect(step.advance).toMatchObject({ required: false, exemption: "CREDIT_APPROVED", exemptionReason: "Fleet account on 30-day credit", exemptedBy: "manager Synthetic" });
    const workspace = await stages.act(job.id, { action: "RELEASE_TO_REPAIR", requestId: randomUUID() }, users.advisor);
    expect(workspace.stage).toBe("REPAIR");
  });
});

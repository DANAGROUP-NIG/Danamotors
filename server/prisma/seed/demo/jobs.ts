import { WarrantyCaseAction } from "../../../src/modules/warranty/warranty.logic";
import prisma from "../../../src/prisma/client";
import { ServiceService } from "../../../src/modules/service/service.service";
import { JobCardWorkflowService, canonicalJobStatus } from "../../../src/modules/service/job-card-workflow.service";
import { LabourService } from "../../../src/modules/service/labour.service";
import { InventoryService } from "../../../src/modules/inventory/inventory.service";
import { JobCardLineService } from "../../../src/modules/job-card-line/jobCardLine.service";
import { WorkshopService } from "../../../src/modules/workshop/workshop.service";
import { JobBillingService } from "../../../src/modules/finance/job-billing.service";
import { ReceiptService } from "../../../src/modules/finance/receipt.service";
import { WarrantyCaseService } from "../../../src/modules/warranty/warrantyCase.service";
import { checkVehicleWarranty } from "../../../src/modules/warranty/warranty.coverage";
import { estimateContentHash } from "../../../src/modules/service/estimate-signature";
import { JobStageService } from "../../../src/modules/service/job-stage.service";
import { JobDiagnosisService } from "../../../src/modules/service/job-diagnosis.service";
import { decideCustomerPay } from "./warranty-check";
import { notifyStoreOfParts } from "../../../src/modules/service/jobcard-parts-request.service";
import { JobRepairService, type RepairActor } from "../../../src/modules/service/job-repair.service";
import { JobQualityCheckService } from "../../../src/modules/service/job-quality-check.service";
import { JobBillingStepService } from "../../../src/modules/service/job-billing-step.service";
import { JobDeliveryService } from "../../../src/modules/service/job-delivery.service";
import { QC_GENERAL_CHECKS } from "../../../src/modules/service/job-quality-check.logic";
import { demoSignaturePng } from "./check-in";
import { ROLES } from "../../../src/shared/constants/roles";
import type { StageAction } from "../../../src/modules/service/job-stage.logic";
import { upfrontAmount } from "../../../src/modules/service/estimate-advance";
import type { JobStage } from "@prisma/client";
import { DemoContext, Reference, seedLedger } from "./context";
import { Parties } from "./parties";
import {
  ClaimFixture,
  DEMO_TAG,
  DiagnosisFixture,
  FindingFixture,
  EstimateFixture,
  JobFixture,
  QualityCheckFixture,
  LABOUR,
  LabourKey,
  PARTS,
  PartKey,
  WARRANTY_LABOUR_RATE,
  demoUuid,
  jobKey,
} from "./fixtures";
import { needsRetime, retimeJob } from "./retime";
import { completeCheckIn } from "./check-in";
import { JobEstimateService, type EstimateActor } from "../../../src/modules/service/job-estimate.service";
import { estimateTotals } from "../../../src/modules/service/job-estimate.logic";

const services = {
  service: new ServiceService(),
  workflow: new JobCardWorkflowService(),
  labour: new LabourService(),
  inventory: new InventoryService(),
  lines: new JobCardLineService(),
  workshop: new WorkshopService(),
  billing: new JobBillingService(),
  receipts: new ReceiptService(),
  warranty: new WarrantyCaseService(),
  stages: new JobStageService(),
  diagnosis: new JobDiagnosisService(),
  estimates: new JobEstimateService(),
  repair: new JobRepairService(),
  qc: new JobQualityCheckService(),
  billingStep: new JobBillingStepService(),
  delivery: new JobDeliveryService(),
};

/** A workshop user with the permissions of their role, as the repair screens send them. */
async function repairActor(userId: string): Promise<RepairActor> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { role: { include: { permissions: { include: { permission: true } } } } } });
  return { id: user.id, role: user.role.name, branchId: user.branchId, permissions: user.role.permissions.map((row) => row.permission.name) };
}

/** The service advisor with the permissions of the role, as the estimate screens send them. */
async function estimateActor(userId: string): Promise<EstimateActor> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { role: { include: { permissions: { include: { permission: true } } } } } });
  return { id: user.id, role: user.role.name, permissions: user.role.permissions.map((row) => row.permission.name) };
}

const RANK: Record<string, number> = { OPEN: 0, IN_PROGRESS: 1, QC: 2, READY: 3, BILLED: 4, DELIVERED: 5 };
const TARGET_STATUS: Record<JobFixture["target"], string> = {
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  READY: "READY",
  BILLED: "BILLED",
  BILLED_PAID: "DELIVERED",
  BILLED_CREDIT: "DELIVERED",
};
const isPart = (key: string): key is PartKey => key in PARTS;

const loadJob = (id: string) =>
  prisma.jobCard.findUniqueOrThrow({
    where: { id },
    include: { invoices: { orderBy: { createdAt: "asc" } }, warrantyCase: { include: { lines: true } } },
  });

export interface JobResult {
  key: string;
  id: string;
  jobNumber: string;
}

/**
 * Builds one job card scenario through the app's own services. Each step checks the current
 * state first, so a run that stopped half way is completed by the next run. Once finished,
 * the scenario is re-dated into its window and recorded in the seed ledger; later runs leave
 * it alone, whatever testers have done to it since.
 */
export async function seedJob(ctx: DemoContext, ref: Reference, parties: Parties, fx: JobFixture, done: Map<string, JobResult>): Promise<JobResult> {
  const key = jobKey(fx.id);
  const existing = await prisma.jobCard.findFirst({ where: { customField1: key }, select: { id: true, jobNumber: true } });
  if (existing && (await seedLedger.done(key))) return { key: fx.id, ...existing };

  const branch = ctx.branches[fx.branch];
  const staff = ctx.staff[fx.branch];
  const id = existing?.id ?? (await openJob(ctx, ref, parties, fx, done));
  let job = await loadJob(id);
  const claimUsesJobLines = fx.claim?.lines.some((line) => line.fromJobCard) ?? false;

  // A claim that does not depend on work done (JC-05) is decided before the estimate.
  if (fx.claim && !claimUsesJobLines) await buildClaim(ctx, ref, job.id, fx.claim, true);

  for (const [index, estimate] of fx.estimates.entries()) await ensureEstimate(ref, job.id, job.customerId!, job.serviceTypeId!, index, estimate, staff.advisor.id);

  const target = RANK[TARGET_STATUS[fx.target]];
  await walkToEstimate(ctx, ref, fx, id, target);
  job = await loadJob(id);
  if (canonicalJobStatus(job.status) === "OPEN" && target >= RANK.IN_PROGRESS) {
    await recordAdvance(ctx, fx, id);
    await stageAction(fx, id, "RELEASE_TO_REPAIR", staff.advisor.id, "Work released to the technician");
  }

  job = await loadJob(id);
  if (["OPEN", "IN_PROGRESS"].includes(canonicalJobStatus(job.status)) && !job.billedAt) {
    for (const [labourKey, hours] of fx.labour) {
      const labourItemId = ref.labour[labourKey];
      if (await prisma.jobCardLabour.findFirst({ where: { jobCardId: id, labourItemId }, select: { id: true } })) continue;
      await services.labour.addJobCardLine(id, { labourItemId, hours, technicianId: fx.withTechnician ? staff.technician.id : undefined });
      await services.lines.list(id); // creates the charge line, in order
    }
    // The store is told the job needs parts before it issues them (the approved estimate does this on its
    // own; older scenarios priced outside the staged estimate ask here). Without a store officer, the
    // request time is recorded.
    if (fx.issues.length && !(await loadJob(id)).partsRequestedAt) {
      const storeOfficer = await prisma.user.findFirst({
        where: { branchId: branch.id, isActive: true, role: { name: ROLES.BRANCH_STORE_MANAGER }, id: { not: staff.technician.id } },
        select: { id: true },
      });
      if (storeOfficer)
        await prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "JobCard" WHERE id = ${id} FOR UPDATE`;
          await notifyStoreOfParts(tx, id, branch.id, staff.technician.id, `seed:${demoUuid(`parts:${fx.id}`)}`);
        });
      else await prisma.jobCard.update({ where: { id }, data: { partsRequestedAt: new Date() } });
    }
    for (const [partKey, quantity] of fx.issues) {
      const sparePartId = ref.parts[partKey];
      if (await prisma.partIssuance.findFirst({ where: { jobCardId: id, sparePartId }, select: { id: true } })) continue;
      // Later scenarios use more than the opening stock: the store receives what is missing first.
      const stock = await prisma.inventoryStock.findUnique({ where: { branchId_partId: { branchId: branch.id, partId: sparePartId } } });
      const short = quantity - ((stock?.quantity ?? 0) - (stock?.reservedQuantity ?? 0));
      if (short > 0)
        await services.inventory.adjustStock({
          branchId: branch.id, partId: sparePartId, quantity: short + 4, type: "RECEIVED", notes: `${DEMO_TAG} restock for ${fx.id}`, recordedById: staff.store.id,
        });
      await services.inventory.createPartIssuance({
        sparePartId, branchId: branch.id, jobCardId: id, issuedById: staff.store.id, quantity, notes: `Issued for job card ${job.jobNumber}`,
      });
      await services.lines.list(id);
    }
    for (const labourKey of fx.warrantyLabour ?? []) await chargeLabourToWarranty(ctx, ref, id, labourKey);
  }

  if (fx.claim && claimUsesJobLines) await buildClaim(ctx, ref, id, fx.claim, false);
  if (fx.repair) await workRepair(ctx, ref, fx, id);

  await advance(ctx, fx, id);
  await stopInWorkshop(ctx, ref, fx, id);

  if (fx.claim && claimUsesJobLines) await decideClaim(ctx, ref, id, fx.claim);

  job = await loadJob(id);
  if (needsRetime(job.createdAt, fx)) await retimeJob(id, fx, fx.spanHours + 6);
  // Delivery (phase 9): the promised time has passed while the vehicle waits for collection.
  if (fx.delivery?.late && job.stage === "DELIVERY")
    await prisma.jobCard.update({ where: { id }, data: { promisedAt: new Date(Date.now() - 3 * 3_600_000) } });
  await seedLedger.mark(key, staff.advisor.id);
  return { key: fx.id, id, jobNumber: job.jobNumber };
}

async function openJob(ctx: DemoContext, ref: Reference, parties: Parties, fx: JobFixture, done: Map<string, JobResult>) {
  const vehicle = parties.vehicles[fx.vehicle];
  const staff = ctx.staff[fx.branch];
  const previous = fx.repeatOf ? done.get(fx.repeatOf) : undefined;
  if (fx.repeatOf && !previous) throw new Error(`${fx.id} is a repeat of ${fx.repeatOf}, which has not been seeded.`);
  // A reading from an earlier visit elsewhere, about 3.5 months ago, so check-in can show "Last recorded".
  if (fx.priorMileage)
    await prisma.vehicle.updateMany({
      where: { id: vehicle.id, lastRecordedMileage: null },
      data: { lastRecordedMileage: fx.priorMileage, lastMileageAt: new Date(Date.now() - 106 * 86_400_000) },
    });
  // Testers may have recorded a higher reading on a demo vehicle since the last run. The scenario's own
  // reading is then entered through the audited odometer replacement, as staff would.
  const recorded = (await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id }, select: { lastRecordedMileage: true } })).lastRecordedMileage;
  const replaced = recorded != null && recorded > fx.mileage;
  // The adviser sees the warranty check first and acknowledges coverage and open campaigns.
  const check = await checkVehicleWarranty(vehicle.id, fx.mileage);
  const card = await services.service.createJobCard({
    serviceTypeId: ref.serviceTypes[fx.serviceType],
    customerId: vehicle.customerId,
    vehicleId: vehicle.id,
    branchName: ctx.branches[fx.branch].name,
    description: fx.description,
    mileage: fx.mileage,
    ...(replaced && { odometerReplaced: true, odometerReplacedReason: "Demo data: reading reset for the demo scenario" }),
    bayId: ref.bayId,
    serviceAdvisorId: staff.advisor.id,
    ...(fx.withTechnician ? { technicianId: staff.technician.id } : { teamId: ref.teamId }),
    promisedAt: new Date(Date.now() + (fx.delivery?.promiseDays ?? 2) * 86_400_000).toISOString(),
    complaints: fx.complaints.map((description) => ({ description })),
    warrantyAcknowledged: check.requiresAcknowledgement,
    acknowledgedCampaignIds: check.openCampaigns.map((c) => c.campaignId),
    ...(previous && { isRepeat: true, previousJobId: previous.id, repeatReason: fx.repeatReason }),
    customField1: jobKey(fx.id),
    createdById: staff.advisor.id,
  });
  return card.id;
}

async function ensureEstimate(ref: Reference, jobCardId: string, customerId: string, serviceTypeId: string, index: number, fx: EstimateFixture, actorId: string) {
  const revisions = await prisma.estimate.findMany({
    where: { jobCardId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { approvals: true },
  });
  let estimate = revisions[index];
  if (!estimate) {
    if (revisions.length !== index) return;
    const created = await services.service.addEstimate(
      jobCardId,
      {
        description: fx.description,
        lines: [
          { type: "SERVICE", referenceId: serviceTypeId, quantity: 1 },
          ...fx.parts.map(([part, quantity]) => ({ type: "PART" as const, referenceId: ref.parts[part], quantity })),
          ...fx.labour.map(([labour, hours]) => ({ type: "LABOUR" as const, referenceId: ref.labour[labour], quantity: hours })),
          ...(fx.notes ?? []).map((description) => ({ type: "COMPLAINT" as const, description, quantity: 1 })),
        ],
      },
      actorId,
      revisions[index - 1]?.id,
    );
    estimate = { ...created, approvals: [] };
  }
  if (fx.decision && estimate.approvals.length === 0) {
    // Decisions need the signed content's version and hash; demo data records them as an Admin override, not a fake signature.
    const signed = await prisma.estimate.findUniqueOrThrow({ where: { id: estimate.id }, include: { lines: true } });
    await services.service.addApproval(
      estimate.id,
      {
        customerId,
        approved: fx.decision.approved,
        comments: fx.decision.comments,
        expectedVersion: signed.version,
        expectedHash: estimateContentHash(signed),
        overrideReason: "Demo data: paper decision on file",
      },
      actorId,
      { deviceOrIp: "demo-seed", allowOverride: true },
    );
  }
}

async function chargeLabourToWarranty(ctx: DemoContext, ref: Reference, jobCardId: string, labourKey: LabourKey) {
  const line = await prisma.jobCardLine.findFirst({
    where: { jobCardId, kind: "LABOUR", jobCardLabour: { labourItemId: ref.labour[labourKey] } },
  });
  if (!line || line.chargeType === "WARRANTY") return;
  await services.lines.updateLine(
    jobCardId,
    line.id,
    { chargeType: "WARRANTY", reason: "Labour for the warranty repair" },
    { userId: ctx.warrantyOfficer.id, canChargeGoodwill: false },
  );
}

/** Moves the job card forward along its lifecycle to the fixture's target. Never moves it back. */
async function advance(ctx: DemoContext, fx: JobFixture, id: string) {
  const staff = ctx.staff[fx.branch];
  const target = RANK[TARGET_STATUS[fx.target]];
  for (;;) {
    const job = await loadJob(id);
    const status = canonicalJobStatus(job.status);
    if (RANK[status] === undefined || RANK[status] >= target) return;

    if (status === "IN_PROGRESS") {
      await finishWorkList(ctx, fx, id);
      await stageAction(fx, id, "SEND_TO_QC", staff.technician.id, "Work complete, sent for quality check");
    } else if (status === "QC") {
      await passQualityCheck(ctx, fx, id);
      // READY needs a done / not done answer for each linked campaign (FPC bulletins).
      if (fx.campaignWork) {
        const unanswered = await prisma.jobCardCampaign.findMany({ where: { jobCardId: id, attended: null }, select: { campaignId: true } });
        for (const { campaignId } of unanswered) await services.workflow.setCampaignAttendance(id, campaignId, fx.campaignWork, staff.advisor.id);
      }
      await markReady(fx, id, staff.advisor.id);
    } else if (status === "READY") {
      // A bill once created, even if a tester later cancelled it, is never created again.
      if (job.invoices.length > 0) return;
      await services.billing.createJobBill({
        jobCardId: id, partsDiscountPercent: 0, labourDiscountPercent: 0,
        serviceAdvisorId: staff.advisor.id, notes: `${DEMO_TAG} job bill`, actorId: staff.billing.id,
      });
    } else if (status === "BILLED") {
      const bill = job.invoices.find((invoice) => !/cancel|void/i.test(invoice.status));
      if (!bill) return;
      if (fx.target === "BILLED_PAID" && bill.outstandingAmount > 0) {
        await services.receipts.createReceipt({
          customerId: bill.customerId, branchId: job.branchId, idempotencyKey: demoUuid(`receipt:${fx.id}`),
          issuedById: staff.billing.id, mode: "CASH", category: "SERVICE_PARTS", amount: bill.outstandingAmount,
          narration: `Payment for job bill ${bill.invoiceNumber}`, allocations: [{ invoiceId: bill.id, amount: bill.outstandingAmount }],
        });
        continue;
      }
      if (fx.target === "BILLED_CREDIT" && !job.creditApprovedById) {
        await services.workflow.approveCredit(id, ctx.admin.id, "Fleet account on 30-day credit terms");
        continue;
      }
      // Billing (phase 8): an invoiced job waits at billing until the advisor sends it on, once paid or on credit.
      if (job.stage === "BILLING") {
        await stageAction(fx, id, "SEND_TO_DELIVERY", staff.advisor.id, "Paid, sent to delivery");
        continue;
      }
      // Delivery (phase 9): the delivery demo jobs wait at the Delivery step unless told to deliver.
      if (fx.delivery && !fx.delivery.deliver) {
        if (fx.delivery.phoneSigned) await signPhoneApprovals(fx, id, staff.advisor.id);
        return;
      }
      await deliverVehicle(fx, id, staff.advisor.id);
    } else {
      return;
    }
  }
}

/** Delivery (phase 9): the customer signs, at the counter, the estimates they approved on the phone. */
async function signPhoneApprovals(fx: JobFixture, id: string, advisorId: string) {
  const advisor = await repairActor(advisorId);
  const view = await services.delivery.view(id, advisor);
  if (!view.phoneApprovals.length) return view;
  return services.delivery.signPhoneApprovals(
    id,
    advisor,
    { requestId: demoUuid(`delivery-estimate:${fx.id}`), signerName: view.owner.name, accepted: true, signatureImage: demoSignaturePng() },
    "Demo data",
  );
}

/**
 * Delivery (phase 9), as the advisor does it on screen: the phone approvals signed, every belonging returned,
 * the owner collects and signs, with a late reason when the promised time has passed. Issues the gate pass.
 */
async function deliverVehicle(fx: JobFixture, id: string, advisorId: string) {
  const view = await signPhoneApprovals(fx, id, advisorId);
  const reasons = view.late
    ? await prisma.workshopMaster.findMany({ where: { kind: "LATE_REASON", active: true }, orderBy: [{ displayOrder: "asc" }, { code: "asc" }], take: 1, select: { id: true } })
    : [];
  await services.delivery.deliver(id, await repairActor(advisorId), {
    requestId: demoUuid(`delivery:${fx.id}`),
    collectorType: "OWNER",
    returnedCodes: view.belongings.map((item) => item.code),
    lateReasonIds: reasons.map((reason) => reason.id),
    lateRemarks: reasons.length ? "Collected after the promised time." : undefined,
    accepted: true,
    signatureImage: demoSignaturePng(),
  });
}

/**
 * Billing (phase 8): the advisor marks the vehicle ready and records that the customer was told, which
 * starts the storage counter. Work done is saved first. Jobs not on the staged billing step (older data)
 * keep the plain status move.
 */
async function markReady(fx: JobFixture, id: string, advisorId: string) {
  if (fx.workDone) await services.workflow.update(id, { workDone: fx.workDone }, advisorId);
  const { stage } = await prisma.jobCard.findUniqueOrThrow({ where: { id }, select: { stage: true } });
  if (stage !== "BILLING") {
    await services.workflow.update(id, { status: "READY", remarks: "Ready for delivery" }, advisorId);
    return;
  }
  const advisor = await repairActor(advisorId);
  await services.billingStep.markReady(id, advisor, {
    requestId: demoUuid(`ready:${fx.id}`),
    channel: "PHONE_CALL",
    note: "Told the customer the vehicle is ready for collection.",
  });
  if (fx.billing?.notifyAgain)
    await services.billingStep.notifyAgain(id, advisor, { requestId: demoUuid(`ready:${fx.id}:again`), channel: "SMS", note: "Reminder sent by SMS." });
  if (fx.billing?.washed) await services.billingStep.setWashed(id, advisor, true);
}

/** Runs one staged job card action as a seeded staff member. The request ID makes re-runs safe. */
async function stageAction(fx: JobFixture, id: string, action: StageAction, actorId: string, note?: string, attempt = "") {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actorId }, select: { id: true, role: { select: { name: true } } } });
  await services.stages.act(id, { action, note, requestId: demoUuid(`stage:${fx.id}:${action}${attempt}`) }, { id: user.id, role: user.role.name });
}

const PRE_REPAIR: JobStage[] = ["CHECK_IN", "DIAGNOSIS", "WARRANTY", "ESTIMATE"];

/**
 * Hands the job on through check-in, diagnosis and the warranty check (when the vehicle needs it)
 * to the estimate, or to the step the fixture stops at.
 */
async function walkToEstimate(ctx: DemoContext, ref: Reference, fx: JobFixture, id: string, target: number) {
  const staff = ctx.staff[fx.branch];
  const goal: JobStage = target >= RANK.IN_PROGRESS || fx.stop === "CANCELLED" ? "ESTIMATE" : ((fx.stop as JobStage | undefined) ?? "CHECK_IN");
  for (;;) {
    const job = await prisma.jobCard.findUniqueOrThrow({ where: { id }, select: { stage: true } });
    if (job.stage === goal || job.stage === "ESTIMATE" || !PRE_REPAIR.includes(job.stage)) {
      // A job that stops at diagnosis with a plan gets its findings, and is sent or returned as the fixture says.
      if (job.stage === "DIAGNOSIS" && fx.diagnosis && fx.diagnosis.stop !== "confirmed") await diagnose(ctx, ref, fx, id, fx.diagnosis);
      break;
    }
    if (job.stage === "CHECK_IN") {
      // Details, walk-around and the customer's signature, as the advisor records them on screen.
      await completeCheckIn(fx, id, staff.advisor.id, "signed");
      await stageAction(fx, id, "SEND_TO_SUPERVISOR", staff.advisor.id);
    } else if (job.stage === "DIAGNOSIS") {
      // Supervisor assigns, technician records findings, service engineer confirms (phase 3).
      await diagnose(ctx, ref, fx, id, fx.diagnosis?.stop === "confirmed" ? fx.diagnosis : null);
    } else {
      // The warranty officer decides who pays for every item first (phase 4).
      await decideCustomerPay(ctx, id, fx.diagnosis?.findings);
      const onWarranty = fx.diagnosis?.findings.some((finding) => finding.warranty?.length);
      await stageAction(fx, id, "WARRANTY_TO_ADVISOR", ctx.warrantyOfficer.id, onWarranty ? "AC compressor repair approved under warranty" : "No warranty items on this visit");
    }
  }
  // A job that stays at check-in shows the step the fixture names.
  if (goal === "CHECK_IN" && (await prisma.jobCard.findUniqueOrThrow({ where: { id }, select: { stage: true } })).stage === "CHECK_IN")
    await completeCheckIn(fx, id, staff.advisor.id, fx.checkIn ?? "opened");
  if (fx.stop === "CANCELLED" && (await prisma.jobCard.findUniqueOrThrow({ where: { id }, select: { stage: true } })).stage === "ESTIMATE")
    await stageAction(fx, id, "CANCEL", staff.advisor.id, "Customer took the vehicle elsewhere");
  // Phase 5: the advisor prepares the estimate from the findings, and presents it, as on screen.
  if (fx.estimateStep && (await prisma.jobCard.findUniqueOrThrow({ where: { id }, select: { stage: true } })).stage === "ESTIMATE") {
    const advisor = await estimateActor(staff.advisor.id);
    const step = await services.estimates.prepare(id, advisor);
    if (fx.estimateStep === "presented" && step.estimate && !step.estimate.presentedAt) await services.estimates.presentToCustomer(id, advisor, step.estimate.id);
    // The customer left and approved every item on the phone; they sign at delivery.
    if (fx.estimateStep === "approved" && step.estimate && !step.estimate.approval) {
      const customer = await prisma.jobCard.findUniqueOrThrow({ where: { id }, select: { customer: { select: { firstName: true, lastName: true, phoneNumber: true } } } });
      await services.estimates.phoneApproval(id, advisor, {
        estimateId: step.estimate.id,
        expectedHash: step.estimate.contentHash,
        approverName: `${customer.customer?.firstName ?? ""} ${customer.customer?.lastName ?? ""}`.trim() || "Vehicle owner",
        approverPhone: customer.customer?.phoneNumber || "08035550142",
        approvedAt: new Date().toISOString(),
        // Delivery (phase 9): declined parts become "Declined, recommended for next visit".
        approvedLineIds: step.estimate.lines
          .filter((line) => line.payer === "CUSTOMER" && !(fx.delivery?.declined ?? []).some((key) => ref.parts[key] === line.referenceId))
          .map((line) => line.id),
        note: fx.delivery?.declined?.length ? "Customer approved the work on the phone and declined the air filter for now." : "Customer approved all items on the phone.",
        requestId: demoUuid(`phone-approval:${fx.id}`),
      });
    }
  }
}

const actorOf = async (userId: string) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, role: { select: { name: true } } } });
  return { id: user.id, role: user.role.name };
};

/**
 * Diagnosis through the app's services, as staff would do it on screen. Without a plan the job goes
 * all the way: assigned, a finding per request, sent to the engineer and confirmed (routing decides
 * warranty or estimate). With a plan it stops where the fixture says. Safe to run again.
 */
async function diagnose(ctx: DemoContext, ref: Reference, fx: JobFixture, id: string, plan: DiagnosisFixture | null) {
  const staff = ctx.staff[fx.branch];
  let job = await prisma.jobCard.findUniqueOrThrow({
    where: { id },
    select: { technicianId: true, diagnosis: { select: { submittedAt: true, returnedAt: true } }, complaints: { select: { id: true, description: true }, orderBy: { id: "asc" } } },
  });
  if (!job.technicianId) {
    const supervisor = await actorOf(staff.supervisor.id);
    await services.workshop.assignTechnician(id, staff.technician.id, undefined, supervisor.id, {
      bayId: ref.bays[STAGE_INDEX(fx.id) % ref.bays.length],
      note: "Customer is waiting; please start with the first request.",
      requestId: demoUuid(`assign:${fx.id}`),
      actorRole: supervisor.role,
    });
  }
  const technician = await actorOf(staff.technician.id);
  const findings: FindingFixture[] = plan?.findings ?? job.complaints.map((_complaint, index) => ({ request: index, text: "", labour: ["service"] }));
  if (!job.diagnosis?.submittedAt && !job.diagnosis?.returnedAt) {
    for (const [index, finding] of findings.entries()) {
      const findingId = demoUuid(`finding:${fx.id}:${index}`);
      if (await prisma.jobFinding.findUnique({ where: { id: findingId }, select: { id: true } })) continue;
      const complaint = finding.request === null ? null : job.complaints[finding.request];
      await services.diagnosis.saveFinding(
        id,
        findingId,
        {
          complaintId: complaint?.id ?? null,
          causeAndDefect: finding.text || `Checked and confirmed: ${complaint?.description ?? "general inspection"}.`,
          possibleWarranty: !!finding.possibleWarranty,
          items: [
            ...(finding.labour ?? []).map((key) => ({ kind: "LABOUR" as const, referenceId: ref.labour[key], quantity: 1 })),
            ...(finding.parts ?? []).map(([key, quantity]) => ({ kind: "PART" as const, referenceId: ref.parts[key], quantity })),
          ],
          expectedVersion: 0,
        },
        technician,
      );
    }
  }
  if (plan?.stop === "findings") return;
  job = await prisma.jobCard.findUniqueOrThrow({ where: { id }, select: { technicianId: true, diagnosis: { select: { submittedAt: true, returnedAt: true } }, complaints: { select: { id: true, description: true }, orderBy: { id: "asc" } } } });
  if (job.diagnosis?.returnedAt) return; // Already returned on an earlier run.
  if (!job.diagnosis?.submittedAt) await stageAction(fx, id, "SEND_TO_ENGINEER", staff.technician.id);
  if (plan?.stop === "review") return;
  if (plan?.stop === "returned") {
    await stageAction(fx, id, "RETURN_TO_TECHNICIAN", staff.engineer.id, plan.returnNote ?? "Please check again.");
    return;
  }
  const engineer = await actorOf(staff.engineer.id);
  const workspace = await services.stages.workspace(id, engineer);
  const confirm = workspace.actions.find((view) => view.kind === "primary" && view.enabled)?.action;
  if (!confirm) throw new Error(`${fx.id}: diagnosis cannot be confirmed (${workspace.actions.flatMap((view) => view.reasons).join(" ")})`);
  await stageAction(fx, id, confirm, staff.engineer.id);
}

/** A stable small number per fixture, so seeded jobs spread over the bays. */
const STAGE_INDEX = (key: string) => [...key].reduce((sum, char) => sum + char.charCodeAt(0), 0);

/** A token deposit: any positive advance meets the existing rule, and the bills keep a balance to pay or put on credit. */
const DEMO_ADVANCE = 10_000;

/** The cashier records the advance the existing workflow needs before work starts: ₦10,000, or the suggested amount if lower. */
async function recordAdvance(ctx: DemoContext, fx: JobFixture, id: string) {
  if (await prisma.receipt.findFirst({ where: { advanceJobCardId: id, status: "ACTIVE" }, select: { id: true } })) return;
  const job = await loadJob(id);
  const estimate = await prisma.estimate.findFirst({
    where: { jobCardId: id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { vatRate: true, upfrontPaymentPercent: true, lines: { select: { payer: true, amount: true, customerDecision: true } } },
  });
  if (!estimate) throw new Error(`${fx.id} needs an estimate before work starts.`);
  const payable = Number(estimateTotals(estimate.lines, estimate.vatRate).approvedTotal);
  await services.receipts.createReceipt({
    customerId: job.customerId!, branchId: job.branchId, idempotencyKey: demoUuid(`advance:${fx.id}`),
    issuedById: ctx.staff[fx.branch].billing.id, mode: "CASH", category: "SERVICE_PARTS",
    amount: Math.min(DEMO_ADVANCE, upfrontAmount(payable, estimate.upfrontPaymentPercent)),
    narration: `Advance for job card ${job.jobNumber}`, advanceJobCardId: id, allocations: [],
  });
}

/**
 * The supervisor's quality check (phase 7) through the quality check service: every line passed,
 * the general checks, an 8 km road test from the check-in reading, and the signed certification.
 * A pass hands the job to the service advisor.
 */
async function passQualityCheck(ctx: DemoContext, fx: JobFixture, id: string) {
  const job = await prisma.jobCard.findUniqueOrThrow({ where: { id }, select: { stage: true, mileage: true } });
  if (job.stage !== "QUALITY_CHECK") return;
  const supervisor = await repairActor(ctx.staff[fx.branch].supervisor.id);
  const lines = await prisma.jobWorkLine.findMany({ where: { jobCardId: id }, select: { id: true } });
  const start = job.mileage ?? fx.mileage;
  await services.qc.record(id, supervisor, {
    requestId: demoUuid(`qc:${fx.id}:pass`),
    outcome: "PASS",
    lines: lines.map((line) => ({ workLineId: line.id, result: "PASS" as const })),
    general: QC_GENERAL_CHECKS.map((check) => ({ code: check.code, passed: true })),
    acOutletTempC: 6,
    roadTestStartKm: start,
    roadTestEndKm: start + 8,
    roadTestNotes: "Road test completed. No abnormal noise. Brakes performed as expected.",
    notes: null,
    signatureImage: demoSignaturePng(),
  });
}

/** A failed quality check: the fixture's lines fail with its note, and the job goes back to the technician. */
async function failQualityCheck(ctx: DemoContext, fx: JobFixture, id: string, plan: QualityCheckFixture, ref: Reference) {
  const failed = await prisma.inspection.count({ where: { jobCardId: id, result: "FAILED" } });
  const job = await prisma.jobCard.findUniqueOrThrow({ where: { id }, select: { stage: true, mileage: true } });
  if (failed || job.stage !== "QUALITY_CHECK") return;
  const supervisor = await repairActor(ctx.staff[fx.branch].supervisor.id);
  const lines = await prisma.jobWorkLine.findMany({ where: { jobCardId: id }, select: { id: true, kind: true, labourItemId: true } });
  const failing = new Set(
    plan.fail.lines.map((key) => lines.find((line) => (key === "serviceType" ? line.kind === "SERVICE" : line.labourItemId === ref.labour[key]))?.id),
  );
  const start = job.mileage ?? fx.mileage;
  await services.qc.record(id, supervisor, {
    requestId: demoUuid(`qc:${fx.id}:fail`),
    outcome: "FAIL",
    lines: lines.map((line) => ({ workLineId: line.id, result: failing.has(line.id) ? ("FAIL" as const) : ("PASS" as const) })),
    general: QC_GENERAL_CHECKS.map((check) => ({ code: check.code, passed: true })),
    acOutletTempC: null,
    roadTestStartKm: start,
    roadTestEndKm: start + 6,
    roadTestNotes: null,
    notes: plan.fail.note,
    signatureImage: null,
  });
}

/** Jobs left in the workshop: paused for parts, waiting for QC, or passed QC and waiting for the advisor. */
/** The work line of a fixture key: the service type's own line, or a labour operation. */
async function workLineFor(ref: Reference, id: string, key: LabourKey | "serviceType") {
  return prisma.jobWorkLine.findFirst({ where: { jobCardId: id, ...(key === "serviceType" ? { kind: "SERVICE" } : { labourItemId: ref.labour[key] }) } });
}

/**
 * Repair (phase 6) as the technician does it on the phone: Start and Done on the work list (Done records
 * the labour), Waiting parts, and a finding raised during repair; then the advisor prepares the
 * supplementary estimate and presents it. Every step is safe to run again.
 */
async function workRepair(ctx: DemoContext, ref: Reference, fx: JobFixture, id: string) {
  const plan = fx.repair!;
  if ((await loadJob(id)).stage !== "REPAIR") return;
  const technician = await repairActor(ctx.staff[fx.branch].technician.id);
  const move = async (key: LabourKey | "serviceType", action: "START" | "DONE" | "WAIT_PARTS") => {
    const line = await workLineFor(ref, id, key);
    if (!line) throw new Error(`${fx.id}: no work line for ${key}`);
    await services.repair.moveLine(id, line.id, technician, { action, requestId: demoUuid(`work:${fx.id}:${key}:${action}`) });
  };
  for (const key of plan.done ?? []) {
    const line = await workLineFor(ref, id, key);
    if (line?.status === "DONE") continue;
    if (line?.status !== "IN_PROGRESS") await move(key, "START");
    await move(key, "DONE");
  }
  for (const key of plan.started ?? []) if ((await workLineFor(ref, id, key))?.status === "NOT_STARTED") await move(key, "START");
  for (const key of plan.waiting ?? []) if ((await workLineFor(ref, id, key))?.status === "NOT_STARTED") await move(key, "WAIT_PARTS");
  if (plan.finding) {
    await services.repair.raiseFinding(id, technician, {
      requestId: demoUuid(`repair-finding:${fx.id}`),
      kind: "FINDING",
      description: plan.finding.text,
      items: [
        ...plan.finding.parts.map(([key, quantity]) => ({ kind: "PART" as const, referenceId: ref.parts[key], quantity })),
        ...(plan.finding.labour ?? []).map((key) => ({ kind: "LABOUR" as const, referenceId: ref.labour[key], quantity: 1 })),
      ],
    });
  }
  if (plan.supplementary) {
    const advisor = await estimateActor(ctx.staff[fx.branch].advisor.id);
    const step = await services.estimates.prepareSupplementary(id, advisor);
    if (plan.supplementary === "presented" && step.estimate && !step.estimate.presentedAt && !step.estimate.approval)
      await services.estimates.presentToCustomer(id, advisor, step.estimate.id);
    // The customer approved the extra work on the phone; the new lines join the technician's list.
    if (plan.supplementary === "approved" && step.estimate && !step.estimate.approval) {
      const { customer } = await prisma.jobCard.findUniqueOrThrow({ where: { id }, select: { customer: { select: { firstName: true, lastName: true, phoneNumber: true } } } });
      await services.estimates.phoneApproval(id, advisor, {
        estimateId: step.estimate.id,
        expectedHash: step.estimate.contentHash,
        approverName: `${customer?.firstName ?? ""} ${customer?.lastName ?? ""}`.trim() || "Vehicle owner",
        approverPhone: customer?.phoneNumber || "08035550142",
        approvedAt: new Date().toISOString(),
        approvedLineIds: step.estimate.lines.filter((line) => line.payer === "CUSTOMER" && !line.carriedOver).map((line) => line.id),
        note: "Customer approved the extra work on the phone.",
        requestId: demoUuid(`supplementary-approval:${fx.id}`),
      });
    }
  }
}

/**
 * Before the quality check every work line must be done. Older scenarios recorded their labour as job
 * lines rather than through the work list: those lines are linked to the work line they answer (demo data
 * only); the rest are started and finished through the repair service, as on the phone.
 */
async function finishWorkList(ctx: DemoContext, fx: JobFixture, id: string) {
  const technician = await repairActor(ctx.staff[fx.branch].technician.id);
  const lines = await prisma.jobWorkLine.findMany({ where: { jobCardId: id, status: { not: "DONE" } } });
  for (const line of lines) {
    const recorded = line.labourItemId
      ? await prisma.jobCardLabour.findFirst({ where: { jobCardId: id, labourItemId: line.labourItemId, workLine: null }, orderBy: { createdAt: "asc" } })
      : null;
    if (recorded) {
      await prisma.jobWorkLine.update({
        where: { id: line.id },
        data: { status: "DONE", startedAt: recorded.createdAt, doneAt: recorded.createdAt, resumedAt: null, labourLineId: recorded.id, workedSeconds: Math.round(recorded.hours * 3600) },
      });
      continue;
    }
    if (line.status !== "IN_PROGRESS")
      await services.repair.moveLine(id, line.id, technician, { action: "START", requestId: demoUuid(`work:${fx.id}:${line.id}:START`) });
    await services.repair.moveLine(id, line.id, technician, { action: "DONE", requestId: demoUuid(`work:${fx.id}:${line.id}:DONE`) });
  }
}

async function stopInWorkshop(ctx: DemoContext, ref: Reference, fx: JobFixture, id: string) {
  if (fx.target !== "IN_PROGRESS" || !fx.stop) return;
  const technician = ctx.staff[fx.branch].technician.id;
  const status = canonicalJobStatus((await loadJob(id)).status);
  if (fx.stop === "WAITING_PARTS" && status === "IN_PROGRESS") await stageAction(fx, id, "PAUSE_FOR_PARTS", technician, "Oil filter on order from the main store");
  if (["QUALITY_CHECK", "QC_PASSED"].includes(fx.stop) && status === "IN_PROGRESS") {
    await finishWorkList(ctx, fx, id);
    await stageAction(fx, id, "SEND_TO_QC", technician, "Work complete, sent for quality check");
  }
  if (fx.qualityCheck) {
    await failQualityCheck(ctx, fx, id, fx.qualityCheck, ref);
    const back = await prisma.jobCard.findUniqueOrThrow({ where: { id }, select: { stage: true } });
    if (fx.qualityCheck.redone && back.stage === "REPAIR") {
      await finishWorkList(ctx, fx, id);
      await stageAction(fx, id, "SEND_TO_QC", technician, "Caliper sliders cleaned and greased, sent for a second check", ":2");
    }
  }
  if (fx.stop === "QC_PASSED") await passQualityCheck(ctx, fx, id);
}

/** Claim lines, complaint code and officer. Only on a case still being drafted that has no lines yet. */
async function buildClaim(ctx: DemoContext, ref: Reference, jobCardId: string, claim: ClaimFixture, decide: boolean) {
  const wc = await prisma.warrantyCase.findUnique({ where: { jobCardId }, include: { lines: true } });
  if (!wc) throw new Error(`Job card ${jobCardId} has no warranty case. Is the vehicle under warranty?`);
  if (wc.status === "OPEN" && wc.lines.length === 0) {
    if (claim.lines.some((line) => line.fromJobCard)) await services.warranty.importFromJobCard(wc.id);
    const imported = await prisma.warrantyCaseLine.findMany({ where: { caseId: wc.id } });
    for (const line of claim.lines) {
      const codes = {
        defectCodeId: line.defect ? ref.codes.defect[line.defect] : null,
        positionCodeId: line.position ? ref.codes.position[line.position] : null,
      };
      if (line.fromJobCard) {
        const from = line.fromJobCard;
        const match = imported.find((l) => (isPart(from) ? l.sparePartId === ref.parts[from] : l.kind === "LABOUR" && l.operationCode === LABOUR[from as LabourKey].code));
        if (!match) throw new Error(`Claim line ${from} was not imported from the job card.`);
        await services.warranty.updateLine(wc.id, match.id, codes);
      } else if (line.part) {
        await services.warranty.addLine(wc.id, { kind: "PART", role: line.role, sparePartId: ref.parts[line.part], quantity: line.quantity ?? 1, ...codes });
      } else if (line.labour) {
        await services.warranty.addLine(wc.id, {
          kind: "LABOUR", operationCode: line.labour.operationCode, description: line.labour.description,
          quantity: line.labour.hours, rate: WARRANTY_LABOUR_RATE, ...codes,
        });
      }
    }
    await services.warranty.updateHeader(wc.id, { complaintCodeId: ref.codes.complaint[claim.complaintCode], assignedOfficerId: ctx.warrantyOfficer.id });
  }
  if (decide) await decideClaim(ctx, ref, jobCardId, claim);
}

/** Moves the case along OPEN → IN_REVIEW → SUBMITTED (→ REJECTED). Leaves any other status alone. */
async function decideClaim(ctx: DemoContext, ref: Reference, jobCardId: string, claim: ClaimFixture) {
  const actor = ctx.warrantyOfficer.id;
  for (;;) {
    const wc = await prisma.warrantyCase.findUniqueOrThrow({ where: { jobCardId } });
    let action: WarrantyCaseAction | null = null;
    if (claim.outcome === "OPEN") return;
    if (wc.status === "OPEN") action = "START_REVIEW";
    else if (wc.status === "IN_REVIEW") action = "SUBMIT";
    else if (wc.status === "SUBMITTED" && claim.outcome === "REJECTED") action = "REJECT";
    if (!action) return;
    await services.warranty.transition(
      wc.id,
      action,
      action === "SUBMIT"
        ? { manufacturerClaimNo: claim.manufacturerClaimNo, remarks: claim.remarks && claim.outcome === "SUBMITTED" ? claim.remarks : "Submitted to the manufacturer" }
        : action === "REJECT"
          ? { rejectReasonId: ref.codes.reject[claim.rejectReason!], remarks: claim.remarks }
          : { remarks: "Claim prepared from the job card" },
      actor,
    );
  }
}

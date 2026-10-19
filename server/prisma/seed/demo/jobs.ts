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
import { DemoContext, Reference, seedLedger } from "./context";
import { Parties } from "./parties";
import {
  ClaimFixture,
  DEMO_TAG,
  EstimateFixture,
  JobFixture,
  LABOUR,
  LabourKey,
  PARTS,
  PartKey,
  WARRANTY_LABOUR_RATE,
  demoUuid,
  jobKey,
} from "./fixtures";
import { needsRetime, retimeJob } from "./retime";

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
};

const RANK: Record<string, number> = { OPEN: 0, IN_PROGRESS: 1, QC: 2, READY: 3, BILLED: 4, DELIVERED: 5 };
const TARGET_STATUS: Record<JobFixture["target"], string> = {
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  READY: "READY",
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

  job = await loadJob(id);
  const target = RANK[TARGET_STATUS[fx.target]];
  if (canonicalJobStatus(job.status) === "OPEN" && target >= RANK.IN_PROGRESS) {
    await services.workflow.update(id, { status: "IN_PROGRESS", remarks: "Work started" }, staff.advisor.id);
  }

  job = await loadJob(id);
  if (["OPEN", "IN_PROGRESS"].includes(canonicalJobStatus(job.status)) && !job.billedAt) {
    for (const [labourKey, hours] of fx.labour) {
      const labourItemId = ref.labour[labourKey];
      if (await prisma.jobCardLabour.findFirst({ where: { jobCardId: id, labourItemId }, select: { id: true } })) continue;
      await services.labour.addJobCardLine(id, { labourItemId, hours, technicianId: fx.withTechnician ? staff.technician.id : undefined });
      await services.lines.list(id); // creates the charge line, in order
    }
    for (const [partKey, quantity] of fx.issues) {
      const sparePartId = ref.parts[partKey];
      if (await prisma.partIssuance.findFirst({ where: { jobCardId: id, sparePartId }, select: { id: true } })) continue;
      await services.inventory.createPartIssuance({
        sparePartId, branchId: branch.id, jobCardId: id, issuedById: staff.store.id, quantity, notes: `Issued for job card ${job.jobNumber}`,
      });
      await services.lines.list(id);
    }
    for (const labourKey of fx.warrantyLabour ?? []) await chargeLabourToWarranty(ctx, ref, id, labourKey);
  }

  if (fx.claim && claimUsesJobLines) await buildClaim(ctx, ref, id, fx.claim, false);

  await advance(ctx, fx, id);

  if (fx.claim && claimUsesJobLines) await decideClaim(ctx, ref, id, fx.claim);

  job = await loadJob(id);
  if (needsRetime(job.createdAt, fx)) await retimeJob(id, fx, fx.spanHours + 6);
  await seedLedger.mark(key, staff.advisor.id);
  return { key: fx.id, id, jobNumber: job.jobNumber };
}

async function openJob(ctx: DemoContext, ref: Reference, parties: Parties, fx: JobFixture, done: Map<string, JobResult>) {
  const vehicle = parties.vehicles[fx.vehicle];
  const staff = ctx.staff[fx.branch];
  const previous = fx.repeatOf ? done.get(fx.repeatOf) : undefined;
  if (fx.repeatOf && !previous) throw new Error(`${fx.id} is a repeat of ${fx.repeatOf}, which has not been seeded.`);
  // The adviser sees the warranty check first and acknowledges coverage and open campaigns.
  const check = await checkVehicleWarranty(vehicle.id, fx.mileage);
  const card = await services.service.createJobCard({
    serviceTypeId: ref.serviceTypes[fx.serviceType],
    customerId: vehicle.customerId,
    vehicleId: vehicle.id,
    branchName: ctx.branches[fx.branch].name,
    description: fx.description,
    mileage: fx.mileage,
    bayId: ref.bayId,
    serviceAdvisorId: staff.advisor.id,
    ...(fx.withTechnician ? { technicianId: staff.technician.id } : { teamId: ref.teamId }),
    promisedAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
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
    );
    estimate = { ...created, approvals: [] };
  }
  if (fx.decision && estimate.approvals.length === 0) {
    await services.service.addApproval(estimate.id, { customerId, approved: fx.decision.approved, comments: fx.decision.comments }, actorId);
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
      await services.workflow.update(id, { status: "QC", remarks: "Work complete, sent for quality check" }, staff.advisor.id);
    } else if (status === "QC") {
      if (job.qcStatus?.toUpperCase() !== "PASSED") await services.workshop.updateQC(id, "PASSED", "Road test passed");
      await services.workflow.update(id, { status: "READY", workDone: fx.workDone, remarks: "Ready for delivery" }, staff.advisor.id);
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
      await services.workflow.update(id, { status: "DELIVERED", deliveryAdvisorId: staff.advisor.id, remarks: "Vehicle handed over" }, staff.advisor.id);
    } else {
      return;
    }
  }
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

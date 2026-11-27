import { Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../../shared/errors/appError";
import { money } from "../finance/money";
import {
  lockParty,
  withPartyTransaction,
} from "../finance/party-account.service";
import {
  advanceReceiptDateLimit,
  lockAdvanceJob,
  prepareJobAdvance,
} from "../finance/job-advance";
import { lagosDay } from "../finance/credit-terms";

import { advanceRequirement, estimateTotals } from "./job-estimate.logic";

export { upfrontAmount } from "./estimate-advance";

export async function assertDepositPaid(
  tx: Prisma.TransactionClient,
  jobCardId: string,
) {
  // Every entry into work, including rework, requires money received. The estimate's
  // percentage is a suggestion and even a zero-percent target cannot bypass this gate.
  const receipt = await tx.receipt.findFirst({
    where: {
      advanceJobCardId: jobCardId,
      status: "ACTIVE",
      category: "SERVICE_PARTS",
      mode: { not: "CHEQUE" },
      advanceAmount: { gte: 0.01 },
      issuedAt: { lte: advanceReceiptDateLimit() },
    },
    select: { id: true },
  });
  if (!receipt)
    throw new BadRequestError(
      "Ask the cashier to record the advance before work starts",
    );
}

/**
 * Whether this job needs an advance before work, from the latest estimate and any recorded exemption.
 * Pure rule: advanceRequirement (job-estimate.logic.ts).
 */
export async function loadAdvanceRequirement(tx: Prisma.TransactionClient, jobCardId: string) {
  const [job, estimate] = await Promise.all([
    tx.jobCard.findUniqueOrThrow({ where: { id: jobCardId }, select: { advanceExemption: true, advanceExemptionReason: true, serviceType: { select: { chargedTo: true } } } }),
    tx.estimate.findFirst({
      where: { jobCardId },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: { vatRate: true, lines: { select: { payer: true, amount: true, customerDecision: true } } },
    }),
  ]);
  const approvedLines = (estimate?.lines ?? []).filter((line) => line.customerDecision !== "DECLINED");
  return advanceRequirement({
    approvedTotal: estimate ? estimateTotals(estimate.lines, estimate.vatRate).approvedTotal : "0",
    approvedPayers: approvedLines.map((line) => line.payer),
    recorded: job.advanceExemption ? { exemption: job.advanceExemption, reason: job.advanceExemptionReason ?? "" } : null,
    freeService: job.serviceType?.chargedTo === "COMPANY",
  });
}

/** The work-start payment gate: a positive eligible advance, unless the job is exempt. */
export async function assertAdvanceOrExempt(tx: Prisma.TransactionClient, jobCardId: string) {
  const requirement = await loadAdvanceRequirement(tx, jobCardId);
  if (requirement.required) await assertDepositPaid(tx, jobCardId);
}

export async function recordJobDeposit(
  jobCardId: string,
  receiptId: string,
  actorId: string,
) {
  const owner = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: { customerId: true },
  });
  if (!owner?.customerId) throw new NotFoundError("Job customer not found");
  return withPartyTransaction(async (tx) => {
    await lockParty(tx, owner.customerId!);
    await lockAdvanceJob(tx, jobCardId);
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "Receipt" WHERE id = ${receiptId} FOR UPDATE`,
    );
    const receipt = await tx.receipt.findUnique({ where: { id: receiptId } });
    const card = await tx.jobCard.findUniqueOrThrow({
      where: { id: jobCardId },
    });
    if (
      !receipt ||
      receipt.status !== "ACTIVE" ||
      receipt.customerId !== card.customerId ||
      receipt.branchId !== card.branchId ||
      receipt.category !== "SERVICE_PARTS"
    )
      throw new BadRequestError(
        "Choose an active service receipt for this customer and branch",
      );
    if (receipt.mode === "CHEQUE")
      throw new BadRequestError(
        "Uncleared cheques cannot be used as job advances",
      );
    if (receipt.issuedAt && lagosDay(receipt.issuedAt) > lagosDay(new Date()))
      throw new BadRequestError(
        "A future-dated receipt cannot be used as an advance",
      );
    if (receipt.advanceJobCardId && receipt.advanceJobCardId !== jobCardId)
      throw new ConflictError("Receipt is reserved for another job");
    if (receipt.advanceJobCardId === jobCardId) return { receiptId };
    if (
      money(receipt.advanceAmount) <= 0 ||
      money(receipt.advanceAmount) !== money(receipt.amount)
    )
      throw new BadRequestError("Choose a positive, fully unallocated receipt");
    const advanceSnapshot = await prepareJobAdvance(
      tx,
      jobCardId,
      receipt.customerId,
      card.branchId,
      receipt.advanceAmount,
    );
    await tx.receipt.update({
      where: { id: receiptId },
      data: { advanceJobCardId: jobCardId, advanceSnapshot },
    });
    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: "JOB_DEPOSIT_RECORDED",
        details: JSON.stringify({
          jobCardId,
          receiptId,
          amount: receipt.amount,
        }),
      },
    });
    return { receiptId };
  });
}

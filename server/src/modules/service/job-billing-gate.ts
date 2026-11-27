import type { Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { AppError } from "../../shared/errors/appError";
import { JobBillingService } from "../finance/job-billing.service";
import { sumMoney } from "../finance/money";
import { deliveryPaymentProblem, type DeliveryPaymentFacts } from "./job-billing-step.logic";

type Db = Prisma.TransactionClient | typeof prisma;

export const activeBill = (status: string) => !["CANCELLED", "CANCELED", "VOID"].includes(status.toUpperCase());

const billing = new JobBillingService();

/**
 * What the customer is charged on the job so far (before VAT), or null when the lines cannot be priced
 * yet (for example a part without a retail rate): then the job is not treated as "nothing to pay".
 */
export async function actualCustomerTotal(db: Db, jobCardId: string): Promise<number | null> {
  try {
    const lines = await billing.actualCustomerLines(jobCardId, db);
    return sumMoney(lines.map((line) => line.amount));
  } catch (error) {
    if (error instanceof AppError && error.statusCode < 500) return null;
    throw error;
  }
}

/** The job's active bill: its own, or a consolidated bill it is part of. */
export async function activeBillFor(db: Db, jobCardId: string) {
  const bills = await db.invoice.findMany({
    where: { OR: [{ jobCardId }, { jobCards: { some: { id: jobCardId } } }] },
    orderBy: [{ issuedDate: "desc" }, { id: "desc" }],
    select: { id: true, status: true, total: true, outstandingAmount: true },
  });
  return bills.find((bill) => activeBill(bill.status)) ?? null;
}

/** The facts behind "payment comes before delivery" (deliveryPaymentProblem). */
export async function loadDeliveryPaymentFacts(db: Db, jobCardId: string): Promise<DeliveryPaymentFacts> {
  const job = await db.jobCard.findUniqueOrThrow({
    where: { id: jobCardId },
    select: { creditApprovedById: true, billedAt: true, estimationCharge: { select: { status: true } } },
  });
  const bill = await activeBillFor(db, jobCardId);
  const billed = !!bill || !!job.billedAt;
  const charged = billed || job.estimationCharge?.status === "ADDED" ? null : await actualCustomerTotal(db, jobCardId);
  return {
    billed,
    balanceDue: bill ? bill.outstandingAmount : null,
    creditApproved: !!job.creditApprovedById,
    nothingToPay: !billed && charged === 0,
  };
}

export async function loadDeliveryPaymentProblem(db: Db, jobCardId: string): Promise<string | null> {
  return deliveryPaymentProblem(await loadDeliveryPaymentFacts(db, jobCardId));
}

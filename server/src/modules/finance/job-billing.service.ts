import { latestEstimateQuery, reviewApprovedScope } from '../service/estimate-approval';
import { serviceChargeDescription, serviceChargeReference } from '../service/job-service-charge';
import { Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../../shared/errors/appError";
import { ROLES } from "../../shared/constants/roles";
import { config } from "../../config";
import { calculateJobBillTotals } from "./job-bill-calculator";
import { nextDocumentNumber } from "./document-number";
import { lineAmount, money, sumMoney } from "./money";

const BILLABLE_STATUSES = ["READY", "Ready", "Completed"];
const VAT_RATE = config.JOB_BILL_VAT_RATE;

function isActiveBillStatus(status: string) {
  return !["CANCELLED", "CANCELED", "VOID"].includes(status.toUpperCase());
}

export class JobBillingService {
  private async loadJobCard(
    jobCardId: string,
    transaction: Prisma.TransactionClient | typeof prisma = prisma,
  ) {
    const jobCard = await transaction.jobCard.findUnique({
      where: { id: jobCardId },
      include: {
        estimates: latestEstimateQuery,
        customer: true,
        serviceType: true,
        service: { select: { name: true } },
        appointment: { select: { customerId: true } },
        vehicle: true,
        branch: true,
        partIssuances: { include: { sparePart: true, returns: true, jobCardLine: { select: { chargeType: true } } } },
        labourLines: { include: { chargeLine: { select: { chargeType: true } } } },
        invoices: {
          where: { status: { notIn: ["Cancelled", "CANCELLED", "Canceled", "CANCELED", "VOID", "Void"] } },
        },
      },
    });
    if (!jobCard) throw new NotFoundError("Job card not found");
    return jobCard;
  }

  private assertBillable(
    jobCard: Awaited<ReturnType<JobBillingService["loadJobCard"]>>,
  ) {
    if (
      !BILLABLE_STATUSES.includes(jobCard.status) &&
      !(
        ["DELIVERED", "Closed"].includes(jobCard.status) &&
        jobCard.creditApprovedById
      )
    ) {
      throw new BadRequestError(
        "Only ready jobs or jobs delivered on approved credit can be billed",
      );
    }
    if (
      jobCard.billedAt ||
      jobCard.invoices.some((invoice) => isActiveBillStatus(invoice.status))
    ) {
      throw new ConflictError("This job card already has an active bill");
    }
  }

  private getBillLines(
    jobCard: Awaited<ReturnType<JobBillingService["loadJobCard"]>>,
  ) {
    // The customer pays a line unless the service type is company-paid or the line's
    // charge type (job card lines: warranty, campaign, goodwill, internal) says otherwise.
    const companyPaid = jobCard.serviceType?.chargedTo === "COMPANY";
    const customerPays = (chargeLine: { chargeType: string } | null) =>
      !companyPaid && (chargeLine?.chargeType ?? "CUSTOMER") === "CUSTOMER";
    const partLines = jobCard.partIssuances.flatMap((issuance) => {
      const quantity =
        issuance.quantity -
        issuance.returns.reduce(
          (sum, partReturn) =>
            sum +
            (partReturn.status.toUpperCase() === "REJECTED"
              ? 0
              : partReturn.quantity),
          0,
        );
      if (quantity <= 0) return [];
      if (issuance.sparePart.retailRate == null) {
        throw new BadRequestError(
          `Retail rate is not set for ${issuance.sparePart.partNumber}`,
        );
      }
      return [
        {
          type: "PART",
          partId: issuance.sparePartId,
          referenceId: issuance.sparePartId,
          description: issuance.sparePart.name,
          quantity,
          rate: issuance.sparePart.retailRate,
          amount: lineAmount(quantity, issuance.sparePart.retailRate),
          customerPaid: customerPays(issuance.jobCardLine),
        },
      ];
    });
    const labourLines = jobCard.labourLines.map((line) => ({
      type: "LABOUR",
      jobCardLabourId: line.id,
      referenceId: line.labourItemId,
      description: line.description,
      quantity: line.hours,
      rate: line.rate,
      amount: money(line.amount),
      customerPaid: customerPays(line.chargeLine),
    }));
    const serviceLines = jobCard.serviceCharge == null ? [] : [{
      type: "SERVICE", referenceId: serviceChargeReference(jobCard), description: jobCard.service?.name ? `${jobCard.service.name} ? service charge` : serviceChargeDescription(jobCard), quantity: 1, rate: money(jobCard.serviceCharge),
      amount: money(jobCard.serviceCharge), customerPaid: !companyPaid,
    }];
    const lines = [...partLines, ...labourLines, ...serviceLines];
    if (!lines.some((line) => line.customerPaid)) throw new BadRequestError("Record customer-paid parts, labour or a service charge before creating a job bill");
    if (lines.some((line) => line.amount < 0 || !Number.isFinite(line.amount))) throw new BadRequestError("Invalid job-card line amount");
    return lines;
  }

  private pricedScope(jobCard: Awaited<ReturnType<JobBillingService["loadJobCard"]>>) {
    const rawLines = this.getBillLines(jobCard).filter(line => line.customerPaid);
    const review = reviewApprovedScope(jobCard.estimates?.[0], rawLines, jobCard.customerId ?? jobCard.appointment?.customerId);
    const lines = rawLines.map(line => {
      const row = review.rows.find(row => row.type === line.type && row.referenceId === line.referenceId);
      return row?.included ? { ...line, rate: 0, amount: 0, description: `${line.description} (included in service charge)` } : line;
    });
    return { lines, review };
  }

  async listBillableJobCards(branchId?: string) {
    return prisma.jobCard.findMany({
      where: {
        OR: [
          { status: { in: BILLABLE_STATUSES } },
          {
            status: { in: ["DELIVERED", "Closed"] },
            creditApprovedById: { not: null },
          },
        ],
        billedAt: null,
        ...(branchId ? { branchId } : {}),
        invoices: {
          none: { status: { notIn: ["Cancelled", "CANCELLED", "Canceled", "CANCELED", "VOID", "Void"] } },
        },
      },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, companyName: true } },
        vehicle: {
          select: {
            id: true,
            make: true,
            model: true,
            registrationNumber: true,
          },
        },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  async previewJobBill(input: {
    jobCardId: string;
    partsDiscountPercent: number;
    labourDiscountPercent: number;
  }) {
    const jobCard = await this.loadJobCard(input.jobCardId);
    this.assertBillable(jobCard);
    const { lines, review } = this.pricedScope(jobCard);
    const partsTotal = lines
      .filter((line) => line.type === "PART")
      .reduce((sum, line) => sumMoney([sum, line.amount]), 0);
    const labourTotal = lines
      .filter((line) => line.type === "LABOUR")
      .reduce((sum, line) => sumMoney([sum, line.amount]), 0);
    const totals = calculateJobBillTotals({
      partsTotal,
      labourTotal,
      partsDiscountPercent: input.partsDiscountPercent,
      labourDiscountPercent: input.labourDiscountPercent,
      serviceTotal: sumMoney(lines.filter((line) => line.type === "SERVICE").map((line) => line.amount)),
      vatRate: VAT_RATE,
    });
    return {
      jobCard,
      review,
      lines,
      totals: { ...totals, subtotal: sumMoney([totals.partsTotal, totals.labourTotal, totals.serviceTotal]) },
    };
  }

  async createJobBill(input: {
    jobCardId: string;
    partsDiscountPercent: number;
    labourDiscountPercent: number;
    serviceAdvisorId: string;
    notes?: string;
    actorId?: string;
  }) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await prisma.$transaction(
          async (transaction) => {
            await transaction.$queryRaw<Array<{ id: string }>>(
              Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${input.jobCardId} FOR UPDATE`,
            );
            const jobCard = await this.loadJobCard(input.jobCardId, transaction);
            this.assertBillable(jobCard);
            const customerId =
              jobCard.customerId ?? jobCard.appointment?.customerId;
            if (!customerId)
              throw new BadRequestError("The job card does not have a customer");

            const advisor = await transaction.user.findUnique({
              where: { id: input.serviceAdvisorId },
              include: { role: true },
            });
            if (!advisor || advisor.role.name !== ROLES.SERVICE_ADVISOR) {
              throw new BadRequestError("Select an active service advisor");
            }
            if (!advisor.isActive)
              throw new BadRequestError(
                "The selected service advisor is inactive",
              );
            if (advisor.branchId !== jobCard.branchId)
              throw new BadRequestError(
                "The service advisor must belong to the job card branch",
              );

            const { lines, review } = this.pricedScope(jobCard);
            if (!review.canBill) throw new BadRequestError(review.issues.join(' '));
            const partsTotal = lines
              .filter((line) => line.type === "PART")
              .reduce((sum, line) => sumMoney([sum, line.amount]), 0);
            const labourTotal = lines
              .filter((line) => line.type === "LABOUR")
              .reduce((sum, line) => sumMoney([sum, line.amount]), 0);
            const totals = calculateJobBillTotals({
              partsTotal,
              labourTotal,
              partsDiscountPercent: input.partsDiscountPercent,
              labourDiscountPercent: input.labourDiscountPercent,
              serviceTotal: sumMoney(lines.filter((line) => line.type === "SERVICE").map((line) => line.amount)),
              vatRate: VAT_RATE,
            });
            const invoiceNumber = await nextDocumentNumber(
              transaction,
              "JOB_BILL",
            );
            const invoice = await transaction.invoice.create({
              data: {
                customerId,
                jobCardId: jobCard.id,
                invoiceNumber,
                subtotal: sumMoney([totals.partsTotal, totals.labourTotal, totals.serviceTotal]),
                tax: totals.vatAmount,
                total: totals.total,
                outstandingAmount: totals.total,
                partsTotal: totals.partsTotal,
                labourTotal: totals.labourTotal,
                serviceTotal: totals.serviceTotal,
                partsDiscountPercent: input.partsDiscountPercent,
                labourDiscountPercent: input.labourDiscountPercent,
                partsDiscountAmount: totals.partsDiscountAmount,
                labourDiscountAmount: totals.labourDiscountAmount,
                vatRate: totals.vatRate,
                vatAmount: totals.vatAmount,
                roundOff: totals.roundOff,
                serviceAdvisorId: advisor.id,
                notes: input.notes,
                status: totals.total === 0 ? "Paid" : "Unpaid",
                // Batch line snapshots to avoid one insert round trip per line.
                lines: { createMany: { data: lines.map(({ referenceId: _referenceId, ...line }) => line) } },
              },
              include: {
                lines: true,
                customer: true,
                jobCard: true,
                serviceAdvisor: true,
              },
            });
            await transaction.jobCard.update({
              where: { id: jobCard.id },
              data: {
                billedAt: new Date(),
                status: ["DELIVERED", "Closed"].includes(jobCard.status)
                  ? "DELIVERED"
                  : "BILLED",
                statusHistory: {
                  create: {
                    fromStatus: jobCard.status,
                    toStatus: ["DELIVERED", "Closed"].includes(jobCard.status)
                      ? "DELIVERED"
                      : "BILLED",
                    actorId: input.actorId ?? input.serviceAdvisorId,
                    remarks: `Job bill ${invoiceNumber} created against approved estimate ${review.estimateId}`,
                  },
                },
              },
            });
            return invoice;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 5_000,
            timeout: 15_000,
          },
        );
      } catch (error) {
        // P2034 guarantees an aborted transaction. Re-read and revalidate on retry;
        // never replay timeouts/connection errors with an uncertain outcome.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt + Math.floor(Math.random() * 100)));
          continue;
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2028", "P2024"].includes(error.code)) {
          throw new AppError("Billing could not finish while the database was busy. Refresh the job card to check whether a bill exists before trying again.", 503);
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ["P2002", "P2034"].includes(error.code)
        ) {
          throw new ConflictError(
            error.code === "P2034" ? "The job card changed during billing. Refresh the preview and retry." : "This job card has already been billed. Refresh the billable job list.",
          );
        }
        throw error;
      }
    }
  }

  async cancelJobBill(id: string, cancelledById: string, remark: string) {
    return prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT id FROM "Invoice" WHERE id = ${id} FOR UPDATE`,
        );
        const invoice = await transaction.invoice.findUnique({ where: { id } });
        if (!invoice) throw new NotFoundError("Invoice not found");
        if (!invoice.jobCardId) throw new BadRequestError("Only job bills can be cancelled through this action");
        if (!remark.trim()) throw new BadRequestError("A cancellation remark is required");
        if (!isActiveBillStatus(invoice.status))
          throw new BadRequestError("This bill is already cancelled");
        if (
          invoice.tallyPostedAt ||
          (await transaction.tallyPostingLog.findFirst({
            where: {
              documentType: "JOB_BILL",
              documentId: id,
              status: { in: ["EXPORTED", "POSTED"] },
            },
          }))
        ) {
          throw new BadRequestError(
            "A bill exported or posted to Tally cannot be cancelled",
          );
        }
        await transaction.tallyPostingLog.updateMany({
          where: {
            documentType: "JOB_BILL",
            documentId: id,
            status: "EXPORTED",
          },
          data: { status: "INVALIDATED" },
        });
        const [paymentCount, legacyReceiptCount, allocationCount] =
          await Promise.all([
            transaction.payment.count({
              where: { invoiceId: id, receiptId: null },
            }),
            transaction.receipt.count({
              where: { invoiceId: id, status: "ACTIVE" },
            }),
            transaction.receiptAllocation.count({
              where: { invoiceId: id, receipt: { status: "ACTIVE" } },
            }),
          ]);
        if (paymentCount + legacyReceiptCount + allocationCount > 0) {
          throw new ConflictError(
            "A bill with allocated receipts or payments cannot be cancelled",
          );
        }

        const cancelled = await transaction.invoice.update({
          where: { id },
          data: {
            status: "Cancelled",
            cancelledAt: new Date(),
            cancelledById,
            cancelRemark: remark,
          },
        });
        if (invoice.jobCardId) {
          await transaction.$queryRaw(
            Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${invoice.jobCardId} FOR UPDATE`,
          );
          const card = await transaction.jobCard.findUnique({
            where: { id: invoice.jobCardId },
          });
          if (card?.deliveredAt || (card && ["DELIVERED", "Closed"].includes(card.status)))
            throw new ConflictError("A delivered job bill cannot be cancelled");
          await transaction.jobCardStatusHistory.create({
            data: {
              jobCardId: invoice.jobCardId,
              fromStatus: "BILLED",
              toStatus: "READY",
              actorId: cancelledById,
              remarks: remark,
            },
          });
          await transaction.jobCard.updateMany({
            where: { id: invoice.jobCardId, billedAt: { not: null } },
            data: { billedAt: null, status: "READY" },
          });
        }
        return cancelled;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

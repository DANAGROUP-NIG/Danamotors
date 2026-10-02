import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/appError';
import { ROLES } from '../../shared/constants/roles';
import { config } from '../../config';
import { calculateJobBillTotals } from './job-bill-calculator';
import { nextDocumentNumber } from './document-number';

const BILLABLE_STATUSES = ['READY', 'Ready', 'Completed'];
const VAT_RATE = config.JOB_BILL_VAT_RATE;

function isActiveBillStatus(status: string) {
  return !['CANCELLED', 'CANCELED', 'VOID'].includes(status.toUpperCase());
}

export class JobBillingService {
  private async loadJobCard(jobCardId: string, transaction: Prisma.TransactionClient | typeof prisma = prisma) {
    const jobCard = await transaction.jobCard.findUnique({
      where: { id: jobCardId },
      include: {
        customer: true,
        serviceType: true,
        appointment: { include: { customer: true } },
        vehicle: true,
        branch: true,
        partIssuances: { include: { sparePart: true, returns: true } },
        labourLines: { include: { labourItem: true, technician: true } },
        invoices: { where: { status: { notIn: ['Cancelled', 'CANCELLED', 'VOID'] } } },
      },
    });
    if (!jobCard) throw new NotFoundError('Job card not found');
    return jobCard;
  }

  private assertBillable(jobCard: Awaited<ReturnType<JobBillingService['loadJobCard']>>) {
    if (!BILLABLE_STATUSES.includes(jobCard.status)) {
      throw new BadRequestError('Only ready or completed job cards can be billed');
    }
    if (jobCard.billedAt || jobCard.invoices.some((invoice) => isActiveBillStatus(invoice.status))) {
      throw new ConflictError('This job card already has an active bill');
    }
  }

  private getBillLines(jobCard: Awaited<ReturnType<JobBillingService['loadJobCard']>>) {
    const partLines = jobCard.partIssuances.flatMap((issuance) => {
      const quantity = issuance.quantity - issuance.returns.reduce((sum, partReturn) => sum + (partReturn.status.toUpperCase() === 'REJECTED' ? 0 : partReturn.quantity), 0);
      if (quantity <= 0) return [];
      return [{
        type: 'PART',
        partId: issuance.sparePartId,
        description: issuance.sparePart.name,
        quantity,
        rate: issuance.sparePart.unitPrice,
        amount: quantity * issuance.sparePart.unitPrice,
        customerPaid: jobCard.serviceType?.chargedTo !== 'COMPANY',
      }];
    });
    const labourLines = jobCard.labourLines.map((line) => ({
      type: 'LABOUR',
      jobCardLabourId: line.id,
      description: line.description,
      quantity: line.hours,
      rate: line.rate,
      amount: line.amount,
      customerPaid: jobCard.serviceType?.chargedTo !== 'COMPANY',
    }));
    return [...partLines, ...labourLines];
  }

  async listBillableJobCards(branchId?: string) {
    return prisma.jobCard.findMany({
      where: {
        status: { in: BILLABLE_STATUSES },
        billedAt: null,
        ...(branchId ? { branchId } : {}),
        invoices: { none: { status: { notIn: ['Cancelled', 'CANCELLED', 'VOID'] } } },
      },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true } },
        vehicle: { select: { id: true, make: true, model: true, registrationNumber: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async previewJobBill(input: {
    jobCardId: string;
    partsDiscountPercent: number;
    labourDiscountPercent: number;
  }) {
    const jobCard = await this.loadJobCard(input.jobCardId);
    this.assertBillable(jobCard);
    const lines = this.getBillLines(jobCard).filter((line) => line.customerPaid);
    const partsTotal = lines.filter((line) => line.type === 'PART').reduce((sum, line) => sum + line.amount, 0);
    const labourTotal = lines.filter((line) => line.type === 'LABOUR').reduce((sum, line) => sum + line.amount, 0);
    const totals = calculateJobBillTotals({
      partsTotal,
      labourTotal,
      partsDiscountPercent: input.partsDiscountPercent,
      labourDiscountPercent: input.labourDiscountPercent,
      vatRate: VAT_RATE,
    });
    return {
      jobCard,
      lines,
      totals: { ...totals, subtotal: totals.partsTotal + totals.labourTotal },
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
    try {
      return await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${input.jobCardId} FOR UPDATE`);
        const jobCard = await this.loadJobCard(input.jobCardId, transaction);
        this.assertBillable(jobCard);
        const customerId = jobCard.customerId ?? jobCard.appointment?.customerId;
        if (!customerId) throw new BadRequestError('The job card does not have a customer');

        const advisor = await transaction.user.findUnique({
          where: { id: input.serviceAdvisorId },
          include: { role: true },
        });
        if (!advisor || advisor.role.name !== ROLES.SERVICE_ADVISOR) {
          throw new BadRequestError('Select an active service advisor');
        }
        if (!advisor.isActive) throw new BadRequestError('The selected service advisor is inactive');
        if (advisor.branchId !== jobCard.branchId) throw new BadRequestError('The service advisor must belong to the job card branch');

        const lines = this.getBillLines(jobCard).filter((line) => line.customerPaid);
        const partsTotal = lines.filter((line) => line.type === 'PART').reduce((sum, line) => sum + line.amount, 0);
        const labourTotal = lines.filter((line) => line.type === 'LABOUR').reduce((sum, line) => sum + line.amount, 0);
        const totals = calculateJobBillTotals({
          partsTotal,
          labourTotal,
          partsDiscountPercent: input.partsDiscountPercent,
          labourDiscountPercent: input.labourDiscountPercent,
          vatRate: VAT_RATE,
        });
        const invoiceNumber = await nextDocumentNumber(transaction, 'JOB_BILL');
        const invoice = await transaction.invoice.create({
          data: {
            customerId,
            jobCardId: jobCard.id,
            invoiceNumber,
            subtotal: totals.partsTotal + totals.labourTotal,
            tax: totals.vatAmount,
            total: totals.total,
            outstandingAmount: totals.total,
            partsTotal: totals.partsTotal,
            labourTotal: totals.labourTotal,
            partsDiscountPercent: input.partsDiscountPercent,
            labourDiscountPercent: input.labourDiscountPercent,
            partsDiscountAmount: totals.partsDiscountAmount,
            labourDiscountAmount: totals.labourDiscountAmount,
            vatRate: totals.vatRate,
            vatAmount: totals.vatAmount,
            roundOff: totals.roundOff,
            serviceAdvisorId: advisor.id,
            notes: input.notes,
            status: 'Unpaid',
            lines: { create: lines },
          },
          include: { lines: true, customer: true, jobCard: true, serviceAdvisor: true },
        });
        await transaction.jobCard.update({
          where: { id: jobCard.id },
          data: { billedAt: new Date(), status: 'BILLED', statusHistory: { create: { fromStatus: jobCard.status, toStatus: 'BILLED', actorId: input.actorId ?? input.serviceAdvisorId } } },
        });
        return invoice;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
        throw new ConflictError('This job card has already been billed. Refresh the billable job list.');
      }
      throw error;
    }
  }

  async cancelJobBill(id: string, cancelledById: string, remark: string) {
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM "Invoice" WHERE id = ${id} FOR UPDATE`);
      const invoice = await transaction.invoice.findUnique({ where: { id } });
      if (!invoice) throw new NotFoundError('Invoice not found');
      if (!isActiveBillStatus(invoice.status)) throw new BadRequestError('This bill is already cancelled');
      if (invoice.tallyPostedAt || await transaction.tallyPostingLog.findFirst({ where: { documentType: 'JOB_BILL', documentId: id, status: 'POSTED' } })) {
        throw new BadRequestError('A bill exported or posted to Tally cannot be cancelled');
      }
      await transaction.tallyPostingLog.updateMany({
        where: { documentType: 'JOB_BILL', documentId: id, status: 'EXPORTED' },
        data: { status: 'INVALIDATED' },
      });
      const [paymentCount, legacyReceiptCount, allocationCount] = await Promise.all([
        transaction.payment.count({ where: { invoiceId: id, receiptId: null } }),
        transaction.receipt.count({ where: { invoiceId: id, status: 'ACTIVE' } }),
        transaction.receiptAllocation.count({ where: { invoiceId: id, receipt: { status: 'ACTIVE' } } }),
      ]);
      if (paymentCount + legacyReceiptCount + allocationCount > 0) {
        throw new ConflictError('A bill with allocated receipts or payments cannot be cancelled');
      }

      const cancelled = await transaction.invoice.update({
        where: { id },
        data: { status: 'Cancelled', cancelledAt: new Date(), cancelledById, cancelRemark: remark },
      });
      if (invoice.jobCardId) {
        await transaction.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${invoice.jobCardId} FOR UPDATE`);
        const card = await transaction.jobCard.findUnique({ where: { id: invoice.jobCardId } });
        if (card?.deliveredAt) throw new ConflictError('A delivered job bill cannot be cancelled');
        await transaction.jobCardStatusHistory.create({ data: { jobCardId: invoice.jobCardId, fromStatus: 'BILLED', toStatus: 'READY', actorId: cancelledById, remarks: remark } });
        await transaction.jobCard.updateMany({
          where: { id: invoice.jobCardId, billedAt: { not: null } },
          data: { billedAt: null, status: 'READY' },
        });
      }
      return cancelled;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
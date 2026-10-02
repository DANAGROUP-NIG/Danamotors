import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/appError';
import { nextDocumentNumber } from './document-number';
import { recalculateReceiptAllocations } from './receipt-allocation';

type ReceiptAllocationInput = { invoiceId: string; amount: number };
type ReceiptMode = 'POS' | 'BANK_TRANSFER' | 'CASH';
type ReceiptCategory = 'SERVICE_PARTS' | 'SALES_ENQUIRY';

const money = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;

async function lockInvoices(transaction: Prisma.TransactionClient, invoiceIds: string[]) {
  const ids = [...new Set(invoiceIds)].sort();
  if (ids.length === 0) return [];
  await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM "Invoice" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`,
  );
  return transaction.invoice.findMany({ where: { id: { in: ids } } });
}

async function updateInvoiceBalance(
  transaction: Prisma.TransactionClient,
  invoiceId: string,
  outstandingAmount: number,
  total: number,
) {
  const balance = money(Math.max(outstandingAmount, 0));
  await transaction.invoice.update({
    where: { id: invoiceId },
    data: {
      outstandingAmount: balance,
      status: balance <= 0 ? 'Paid' : balance < total ? 'Partially Paid' : 'Unpaid',
    },
  });
}

export class ReceiptService {
  async listBanks() {
    return prisma.bank.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  }

  async createReceipt(input: {
    customerId: string;
    issuedById: string;
    mode: ReceiptMode;
    category: ReceiptCategory;
    bankId?: string;
    amount: number;
    reference?: string;
    narration?: string;
    issuedAt?: string;
    allocations: ReceiptAllocationInput[];
  }) {
    if (input.mode !== 'CASH' && !input.bankId) {
      throw new BadRequestError('Select a receiving bank for POS or bank transfer receipts');
    }
    if (input.mode === 'CASH' && input.bankId) {
      throw new BadRequestError('Cash receipts must not specify a bank');
    }
    if (new Set(input.allocations.map((item) => item.invoiceId)).size !== input.allocations.length) {
      throw new BadRequestError('Each invoice can only appear once in a receipt allocation');
    }

    return prisma.$transaction(async (transaction) => {
      const customer = await transaction.customer.findUnique({ where: { id: input.customerId } });
      if (!customer) throw new NotFoundError('Customer not found');
      if (input.bankId) {
        const bank = await transaction.bank.findFirst({ where: { id: input.bankId, active: true } });
        if (!bank) throw new BadRequestError('Select an active receiving bank');
      }
      const invoiceIds = input.allocations.map((item) => item.invoiceId);
      const invoices = await lockInvoices(transaction, invoiceIds);
      if (invoices.length !== new Set(invoiceIds).size) throw new NotFoundError('One or more invoices were not found');
      const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
      let allocatedAmount = 0;
      for (const allocation of input.allocations) {
        const invoice = invoiceById.get(allocation.invoiceId)!;
        if (invoice.customerId !== customer.id) throw new BadRequestError('All allocated invoices must belong to the selected customer');
        if (['CANCELLED', 'CANCELED', 'VOID'].includes(invoice.status.toUpperCase())) {
          throw new BadRequestError(`Invoice ${invoice.invoiceNumber} is cancelled`);
        }
        if (allocation.amount > invoice.outstandingAmount + 0.000001) {
          throw new ConflictError(`Allocation exceeds the outstanding amount for invoice ${invoice.invoiceNumber}`);
        }
        allocatedAmount += allocation.amount;
      }
      if (input.allocations.some((allocation) => invoiceById.get(allocation.invoiceId)!.jobCardId) && input.category !== 'SERVICE_PARTS') {
        throw new BadRequestError('Receipts allocated to job bills belong to the Service and parts register');
      }
      if (allocatedAmount > input.amount + 0.000001) {
        throw new BadRequestError('Receipt allocations cannot exceed the receipt amount');
      }

      const receiptNumber = await nextDocumentNumber(transaction, 'RECEIPT', input.issuedAt ? new Date(input.issuedAt) : new Date());
      const receipt = await transaction.receipt.create({
        data: {
          receiptNumber,
          customerId: customer.id,
          issuedById: input.issuedById,
          mode: input.mode,
          category: input.category,
          bankId: input.bankId,
          amount: money(input.amount),
          reference: input.reference,
          advanceAmount: money(input.amount - allocatedAmount),
          notes: input.narration,
          issuedAt: input.issuedAt ? new Date(input.issuedAt) : undefined,
          allocations: { create: input.allocations },
        },
        include: { allocations: { include: { invoice: true } }, bank: true, customer: true },
      });

      for (const allocation of input.allocations) {
        const invoice = invoiceById.get(allocation.invoiceId)!;
        await updateInvoiceBalance(transaction, invoice.id, invoice.outstandingAmount - allocation.amount, invoice.total);
      }
      return receipt;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async getReceipt(id: string) {
    const receipt = await prisma.receipt.findUnique({
      where: { id },
      include: {
        customer: true,
        bank: true,
        issuedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        allocations: { include: { invoice: { include: { jobCard: true } } } },
        editLogs: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!receipt) throw new NotFoundError('Receipt not found');
    return receipt;
  }

  async listReceipts(params: {
    branchId?: string;
    from?: string;
    to?: string;
    category?: 'ALL' | 'SERVICE_PARTS' | 'SALES_ENQUIRY';
  }) {
    const where: Prisma.ReceiptWhereInput = { status: { not: 'CANCELLED' } };
    if (params.branchId) where.customer = { branchId: params.branchId };
    if (params.from || params.to) {
      where.issuedAt = {};
      if (params.from) where.issuedAt.gte = new Date(`${params.from}T00:00:00.000Z`);
      if (params.to) {
        const end = new Date(`${params.to}T00:00:00.000Z`);
        end.setUTCDate(end.getUTCDate() + 1);
        where.issuedAt.lt = end;
      }
    }
    if (params.category === 'SERVICE_PARTS') {
      where.category = 'SERVICE_PARTS';
    } else if (params.category === 'SALES_ENQUIRY') {
      where.category = 'SALES_ENQUIRY';
    }

    const receipts = await prisma.receipt.findMany({
      where,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, branchId: true } },
        bank: true,
        allocations: { include: { invoice: { select: { id: true, invoiceNumber: true, jobCardId: true } } } },
        issuedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ issuedAt: 'desc' }, { receiptNumber: 'desc' }],
    });
    const totalsByMode = receipts.reduce<Record<string, number>>((totals, receipt) => {
      totals[receipt.mode] = money((totals[receipt.mode] ?? 0) + receipt.amount);
      return totals;
    }, {});
    return {
      receipts,
      totalsByMode,
      grandTotal: money(receipts.reduce((sum, receipt) => sum + receipt.amount, 0)),
    };
  }

  async updateReceipt(id: string, input: { amount?: number; narration?: string; editedById: string }) {
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM "Receipt" WHERE id = ${id} FOR UPDATE`);
      const receipt = await transaction.receipt.findUnique({
        where: { id },
        include: { allocations: { orderBy: { createdAt: 'asc' } } },
      });
      if (!receipt) throw new NotFoundError('Receipt not found');
      if (receipt.status !== 'ACTIVE') throw new BadRequestError('Only active receipts can be edited');
      if (receipt.tallyPostedAt || await transaction.tallyPostingLog.findFirst({ where: { documentType: 'RECEIPT', documentId: id, status: 'POSTED' } })) {
        throw new BadRequestError('A receipt posted to Tally cannot be edited');
      }
      const oldAmount = receipt.amount;
      const oldNarration = receipt.notes;
      const newAmount = money(input.amount ?? oldAmount);
      const newNarration = input.narration ?? oldNarration;
      await transaction.tallyPostingLog.updateMany({
        where: { documentType: 'RECEIPT', documentId: id, status: 'EXPORTED' },
        data: { status: 'INVALIDATED' },
      });
      const invoiceIds = receipt.allocations.map((allocation) => allocation.invoiceId);
      const invoices = await lockInvoices(transaction, invoiceIds);
      const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));

      for (const allocation of receipt.allocations) {
        const invoice = invoiceById.get(allocation.invoiceId);
        if (!invoice) throw new ConflictError('An allocated invoice no longer exists');
        await transaction.invoice.update({
          where: { id: invoice.id },
          data: { outstandingAmount: money(invoice.outstandingAmount + allocation.amount), status: 'Unpaid' },
        });
      }
      await transaction.receiptAllocation.deleteMany({ where: { receiptId: id } });

      const allocationPlan = recalculateReceiptAllocations(newAmount, receipt.allocations.map((allocation) => {
        const invoice = invoiceById.get(allocation.invoiceId)!;
        return { invoiceId: allocation.invoiceId, amount: allocation.amount, outstandingAmount: invoice.outstandingAmount };
      }));
      for (const allocation of allocationPlan.allocations) {
        const invoice = invoiceById.get(allocation.invoiceId)!;
        const previousAmount = receipt.allocations.find((item) => item.invoiceId === allocation.invoiceId)!.amount;
        const available = money(invoice.outstandingAmount + previousAmount);
        await transaction.receiptAllocation.create({ data: { receiptId: id, invoiceId: invoice.id, amount: allocation.amount } });
        await updateInvoiceBalance(transaction, invoice.id, available - allocation.amount, invoice.total);
      }

      await transaction.receiptEditLog.create({
        data: { receiptId: id, editedById: input.editedById, oldAmount, newAmount, oldNarration, newNarration },
      });
      return transaction.receipt.update({
        where: { id },
        data: { amount: newAmount, advanceAmount: allocationPlan.advanceAmount, notes: newNarration },
        include: { allocations: { include: { invoice: true } }, bank: true, customer: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async cancelReceipt(id: string, remark: string) {
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM "Receipt" WHERE id = ${id} FOR UPDATE`);
      const receipt = await transaction.receipt.findUnique({ where: { id }, include: { allocations: true } });
      if (!receipt) throw new NotFoundError('Receipt not found');
      if (receipt.status !== 'ACTIVE') throw new BadRequestError('Only active receipts can be cancelled');
      if (receipt.tallyPostedAt || await transaction.tallyPostingLog.findFirst({ where: { documentType: 'RECEIPT', documentId: id, status: 'POSTED' } })) {
        throw new BadRequestError('A receipt posted to Tally cannot be cancelled');
      }
      await transaction.tallyPostingLog.updateMany({
        where: { documentType: 'RECEIPT', documentId: id, status: 'EXPORTED' },
        data: { status: 'INVALIDATED' },
      });
      const invoices = await lockInvoices(transaction, receipt.allocations.map((allocation) => allocation.invoiceId));
      const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
      for (const allocation of receipt.allocations) {
        const invoice = invoiceById.get(allocation.invoiceId);
        if (!invoice) throw new ConflictError('An allocated invoice no longer exists');
        await updateInvoiceBalance(transaction, invoice.id, invoice.outstandingAmount + allocation.amount, invoice.total);
      }
      return transaction.receipt.update({ where: { id }, data: { status: 'CANCELLED', cancelRemark: remark } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
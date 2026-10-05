import { createHash } from 'crypto';
import { createReceiptSchema } from './finance.validation';
import { money, sumMoney } from './money';
import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { AppError, BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/appError';
import { nextDocumentNumber } from './document-number';
import { recalculateReceiptAllocations } from './receipt-allocation';

type ReceiptAllocationInput = { invoiceId: string; amount: number };
type ReceiptMode = 'POS' | 'BANK_TRANSFER' | 'CHEQUE' | 'CASH';
type ReceiptCategory = 'SERVICE_PARTS' | 'SALES_ENQUIRY';


async function lockInvoices(transaction: Prisma.TransactionClient, invoiceIds: string[]) {
  const ids = [...new Set(invoiceIds)].sort();
  if (ids.length === 0) return [];
  await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM "Invoice" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`,
  );
  return transaction.invoice.findMany({ where: { id: { in: ids } }, include: { jobCard: { select: { branchId: true } }, customer: { select: { branchId: true } } } });
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
    branchId?: string;
    idempotencyKey?: string;
    chequeNumber?: string;
    chequeDate?: string;
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
    const { issuedById, ...body } = input;
    const validated = createReceiptSchema.parse({ body }).body;
    input = { ...validated, issuedById };
    const requestHash = createHash('sha256').update(JSON.stringify({ ...validated, issuedById, allocations: [...validated.allocations].sort((a, b) => a.invoiceId.localeCompare(b.invoiceId)) })).digest('hex');

    for (let attempt = 0; ; attempt += 1) {
      try {
      return await prisma.$transaction(async (transaction) => {
        if (input.idempotencyKey) {
          // Serialize retries before checking or changing any invoice balance.
          await transaction.$queryRaw(Prisma.sql`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`);
          const existing = await transaction.receipt.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { allocations: { include: { invoice: true } }, bank: true, customer: true } });
          if (existing) {
            if (existing.requestHash !== requestHash) throw new ConflictError('This receipt request was already used with different details');
            return existing;
          }
        }
        const customer = await transaction.customer.findUnique({ where: { id: input.customerId } });
        if (!customer || customer.mergedIntoId) throw new NotFoundError('Customer not found');
        const branchId = input.branchId ?? customer.branchId;
        if (!branchId || !(await transaction.branch.findFirst({ where: { id: branchId, isActive: true } }))) throw new BadRequestError('Select an active receiving branch');
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
          if ((invoice.jobCard?.branchId ?? invoice.customer.branchId) !== branchId) throw new BadRequestError('Allocated bills must belong to the receiving branch');
          if (invoice.customerId !== customer.id) throw new BadRequestError('All allocated invoices must belong to the selected customer');
          if (['CANCELLED', 'CANCELED', 'VOID'].includes(invoice.status.toUpperCase())) {
            throw new BadRequestError(`Invoice ${invoice.invoiceNumber} is cancelled`);
          }
          if (allocation.amount > invoice.outstandingAmount + 0.000001) {
            throw new ConflictError(`Allocation exceeds the outstanding amount for invoice ${invoice.invoiceNumber}`);
          }
          allocatedAmount = sumMoney([allocatedAmount, allocation.amount]);
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
            branchId,
            idempotencyKey: input.idempotencyKey,
            requestHash,
            chequeNumber: input.chequeNumber,
            chequeDate: input.chequeDate ? new Date(`${input.chequeDate}T00:00:00.000Z`) : undefined,
            customerId: customer.id,
            issuedById: input.issuedById,
            mode: input.mode,
            category: input.category,
            bankId: input.bankId,
            amount: money(input.amount),
            reference: input.reference || (input.mode === 'POS' ? 'POS' : input.mode === 'BANK_TRANSFER' ? '0' : undefined),
            advanceAmount: money(input.amount - allocatedAmount),
            notes: input.narration,
            issuedAt: input.issuedAt ? new Date(input.issuedAt) : undefined,
            allocations: { createMany: { data: input.allocations } },
          },
          include: { allocations: { include: { invoice: true } }, bank: true, customer: true },
        });

        for (const allocation of input.allocations) {
          const invoice = invoiceById.get(allocation.invoiceId)!;
          await updateInvoiceBalance(transaction, invoice.id, invoice.outstandingAmount - allocation.amount, invoice.total);
        }
        // Return invoice balances after their updates, not the pre-payment snapshot.
        return { ...receipt, allocations: receipt.allocations.map((allocation) => {
          const original = invoiceById.get(allocation.invoiceId)!;
          const balance = money(original.outstandingAmount - allocation.amount);
          return { ...allocation, invoice: { ...allocation.invoice, outstandingAmount: balance, status: balance <= 0 ? 'Paid' : balance < original.total ? 'Partially Paid' : 'Unpaid' } };
        }) };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 15_000 });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt + Math.floor(Math.random() * 100)));
          continue;
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2028', 'P2024', 'P2034'].includes(error.code)) {
          throw new AppError('The database is busy. Retry this receipt with the same details; its request key prevents duplicate payment.', 503);
        }
        throw error;
      }
    }
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
    if (params.branchId) where.branchId = params.branchId;
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
        customer: { select: { id: true, firstName: true, lastName: true, companyName: true, branchId: true } },
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
      if (receipt.tallyPostedAt || await transaction.tallyPostingLog.findFirst({ where: { documentType: 'RECEIPT', documentId: id, status: { in: ['EXPORTED', 'POSTED'] } } })) {
        throw new BadRequestError('A receipt exported or posted to Tally cannot be edited');
      }
      const oldAmount = receipt.amount;
      const oldNarration = receipt.notes;
      const newAmount = money(input.amount ?? oldAmount);
      const newNarration = input.narration ?? oldNarration;
      await transaction.tallyPostingLog.updateMany({
        where: { documentType: 'RECEIPT', documentId: id, status: 'EXPORTED' },
        data: { status: 'INVALIDATED' },
      });
      if (newAmount === oldAmount) {
        await transaction.receiptEditLog.create({ data: { receiptId: id, editedById: input.editedById, oldAmount, newAmount, oldNarration, newNarration } });
        return transaction.receipt.update({ where: { id }, data: { notes: newNarration }, include: { allocations: { include: { invoice: true } }, bank: true, customer: true } });
      }
      const invoiceIds = receipt.allocations.map((allocation) => allocation.invoiceId);
      const invoices = await lockInvoices(transaction, invoiceIds);
      const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));

      for (const allocation of receipt.allocations) {
        const invoice = invoiceById.get(allocation.invoiceId);
        if (!invoice) throw new ConflictError('An allocated invoice no longer exists');
        await updateInvoiceBalance(transaction, invoice.id, invoice.outstandingAmount + allocation.amount, invoice.total);
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

  async cancelReceipt(id: string, remark: string, actorId?: string) {
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM "Receipt" WHERE id = ${id} FOR UPDATE`);
      const receipt = await transaction.receipt.findUnique({ where: { id }, include: { allocations: true } });
      if (!receipt) throw new NotFoundError('Receipt not found');
      if (receipt.status !== 'ACTIVE') throw new BadRequestError('Only active receipts can be cancelled');
      if (receipt.tallyPostedAt || await transaction.tallyPostingLog.findFirst({ where: { documentType: 'RECEIPT', documentId: id, status: { in: ['EXPORTED', 'POSTED'] } } })) {
        throw new BadRequestError('A receipt exported or posted to Tally cannot be cancelled');
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
      if (actorId) await transaction.auditLog.create({ data: { userId: actorId, action: 'RECEIPT_CANCELLED', details: JSON.stringify({ receiptId: id, remark, amount: receipt.amount }) } });
      return transaction.receipt.update({ where: { id }, data: { status: 'CANCELLED', cancelRemark: remark } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
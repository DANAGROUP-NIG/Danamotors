import prisma from '../../prisma/client';
import { Invoice, Receipt, Prisma } from '@prisma/client';

type AllocatedPayment = Prisma.ReceiptAllocationGetPayload<{
  include: {
    invoice: { include: { customer: true; jobCard: true } };
    receipt: { include: { issuedBy: { select: { id: true; email: true; firstName: true; lastName: true } } } };
  };
}>;

function paymentFromAllocation(allocation: AllocatedPayment) {
  const receipt = allocation.receipt!;
  return {
    id: 'receipt-allocation:' + allocation.id,
    invoiceId: allocation.invoiceId!, invoice: allocation.invoice,
    receiptId: receipt.id, recordedById: receipt.issuedById, recordedBy: receipt.issuedBy,
    amount: allocation.amount, method: receipt.mode, paymentDate: receipt.issuedAt,
    reference: receipt.reference, notes: receipt.notes,
    createdAt: allocation.createdAt, updatedAt: receipt.updatedAt,
  };
}

export class FinanceRepository {
  async listInvoices(params?: { branchId?: string; customerId?: string }): Promise<Invoice[]> {
    const where: Record<string, any> = {};

    if (params?.customerId) {
      where.customerId = params.customerId;
    }

    if (params?.branchId) {
      where.OR = [
        { jobCard: { is: { branchId: params.branchId } } },
        { jobCardId: null, customer: { is: { branchId: params.branchId } } },
      ];
    }

    return prisma.invoice.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            branchId: true,
            companyName: true,
            phoneNumber: true,
          },
        },
        jobCard: { include: { branch: true, vehicle: true } },
        payments: true,
        receipts: true,
        lines: true,
        allocations: { where: { reversedAt: null }, include: { receipt: true, creditNote: true } },
        serviceAdvisor: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { issuedDate: 'desc' },
    });
  }

  async findInvoiceById(id: string): Promise<Invoice | null> {
    return prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            branchId: true,
            companyName: true,
            phoneNumber: true,
          },
        },
        jobCard: { include: { branch: true, vehicle: true } },
        payments: true,
        receipts: true,
        lines: true,
        allocations: { where: { reversedAt: null }, include: { receipt: true, creditNote: true } },
        serviceAdvisor: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async updateInvoice(id: string, data: { dueDate?: Date; notes?: string }) {
    return prisma.invoice.update({ where: { id }, data });
  }

  async listPayments(params?: { branchId?: string }) {
    const invoiceScope = params?.branchId ? { OR: [
      { jobCard: { is: { branchId: params.branchId } } },
      { jobCardId: null, customer: { is: { branchId: params.branchId } } },
    ] } : {};
    const [legacyPayments, allocations] = await Promise.all([
      prisma.payment.findMany({
        // Linked receipts are represented by their current allocations below.
        where: { receiptId: null, invoice: invoiceScope },
        include: { invoice: { include: { customer: true, jobCard: true } }, recordedBy: { select: { id: true, email: true, firstName: true, lastName: true } } },
      }),
      prisma.receiptAllocation.findMany({
        where: {
          reversedAt: null,
          invoiceId: { not: null },
          invoice: invoiceScope,
          receipt: { is: { status: 'ACTIVE', ...(params?.branchId ? { branchId: params.branchId } : {}) } },
        },
        include: {
          invoice: { include: { customer: true, jobCard: true } },
          receipt: { include: { issuedBy: { select: { id: true, email: true, firstName: true, lastName: true } } } },
        },
      }),
    ]);
    return [...legacyPayments, ...allocations.map(paymentFromAllocation)]
      .sort((a, b) => b.paymentDate.getTime() - a.paymentDate.getTime());
  }

  async findPaymentById(id: string) {
    if (id.startsWith('receipt-allocation:')) {
      const allocation = await prisma.receiptAllocation.findFirst({
        where: { id: id.slice('receipt-allocation:'.length), reversedAt: null, invoiceId: { not: null }, receipt: { is: { status: 'ACTIVE' } } },
        include: {
          invoice: { include: { customer: true, jobCard: true } },
          receipt: { include: { issuedBy: { select: { id: true, email: true, firstName: true, lastName: true } } } },
        },
      });
      return allocation ? paymentFromAllocation(allocation) : null;
    }
    return prisma.payment.findFirst({
      where: { id, receiptId: null },
      include: {
        invoice: { include: { customer: true, jobCard: true } },
        recordedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
  }

  async listReceipts(params?: { branchId?: string }): Promise<Receipt[]> {
    const where: Record<string, any> = {};

    if (params?.branchId) {
      where.invoice = { jobCard: { branchId: params.branchId } };
    }

    return prisma.receipt.findMany({
      where,
      include: {
        invoice: true,
        issuedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async findReceiptById(id: string): Promise<Receipt | null> {
    return prisma.receipt.findUnique({
      where: { id },
      include: {
        invoice: true,
        issuedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }

}

export default FinanceRepository;

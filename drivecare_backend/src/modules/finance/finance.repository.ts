import prisma from '../../prisma/client';
import { Invoice, Payment, Receipt } from '@prisma/client';

export class FinanceRepository {
  async listInvoices(params?: { branchId?: string }): Promise<Invoice[]> {
    const where: Record<string, any> = {};

    if (params?.branchId) {
      where.jobCard = { branchId: params.branchId };
    }

    return prisma.invoice.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            user: {
              select: { email: true, firstName: true, lastName: true },
            },
          },
        },
        jobCard: true,
        payments: true,
        receipts: true,
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
            user: {
              select: { email: true, firstName: true, lastName: true },
            },
          },
        },
        jobCard: true,
        payments: true,
        receipts: true,
      },
    });
  }

  async createInvoice(data: {
    customerId: string;
    jobCardId?: string;
    invoiceNumber: string;
    issuedDate?: Date;
    dueDate?: Date;
    subtotal: number;
    tax?: number;
    total: number;
    status?: string;
    notes?: string;
  }): Promise<Invoice> {
    return prisma.invoice.create({ data });
  }

  async updateInvoice(id: string, data: Partial<Invoice>) {
    return prisma.invoice.update({ where: { id }, data });
  }

  async deleteInvoice(id: string) {
    return prisma.invoice.delete({ where: { id } });
  }

  async listPayments(params?: { branchId?: string }): Promise<Payment[]> {
    const where: Record<string, any> = {};

    if (params?.branchId) {
      where.invoice = { jobCard: { branchId: params.branchId } };
    }

    return prisma.payment.findMany({
      where,
      include: {
        invoice: true,
        recordedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
      orderBy: { paymentDate: 'desc' },
    });
  }

  async findPaymentById(id: string): Promise<Payment | null> {
    return prisma.payment.findUnique({
      where: { id },
      include: {
        invoice: true,
        recordedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }

  async createPayment(data: {
    invoiceId: string;
    recordedById: string;
    amount: number;
    method: string;
    paymentDate?: Date;
    reference?: string;
    notes?: string;
  }): Promise<Payment> {
    return prisma.payment.create({ data });
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

  async createReceipt(data: {
    invoiceId: string;
    issuedById: string;
    amount: number;
    issuedAt?: Date;
    reference?: string;
    notes?: string;
  }): Promise<Receipt> {
    return prisma.receipt.create({ data });
  }
}

export default FinanceRepository;

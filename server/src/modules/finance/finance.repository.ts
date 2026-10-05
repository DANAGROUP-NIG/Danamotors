import prisma from '../../prisma/client';
import { Invoice, Payment, Receipt } from '@prisma/client';

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
        allocations: { include: { receipt: true } },
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
        allocations: { include: { receipt: true } },
        serviceAdvisor: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async updateInvoice(id: string, data: { dueDate?: Date; notes?: string }) {
    return prisma.invoice.update({ where: { id }, data });
  }

  async listPayments(params?: { branchId?: string }): Promise<Payment[]> {
    const where: Record<string, any> = {};

    if (params?.branchId) {
      where.invoice = { OR: [
        { jobCard: { is: { branchId: params.branchId } } },
        { jobCardId: null, customer: { is: { branchId: params.branchId } } },
      ] };
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

import prisma from '../../prisma/client';
import { FinanceRepository } from './finance.repository';
import { NotFoundError } from '../../shared/errors/appError';

export class FinanceService {
  private financeRepository: FinanceRepository;

  constructor() {
    this.financeRepository = new FinanceRepository();
  }

  async listInvoices(params?: { branchId?: string; customerId?: string }) {
    return this.financeRepository.listInvoices(params);
  }

  async getInvoice(id: string) {
    const invoice = await this.financeRepository.findInvoiceById(id);
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }
    return invoice;
  }

  async updateInvoice(id: string, data: {
    dueDate?: string;
    notes?: string;
  }) {
    const invoice = await this.financeRepository.findInvoiceById(id);
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    return this.financeRepository.updateInvoice(id, {
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      notes: data.notes,
    });
  }

  async listPayments(params?: { branchId?: string }) {
    return this.financeRepository.listPayments(params);
  }

  async getPayment(id: string) {
    const payment = await this.financeRepository.findPaymentById(id);
    if (!payment) {
      throw new NotFoundError('Payment not found');
    }
    return payment;
  }

  async getSummaryReport(params: {
    startDate?: string;
    endDate?: string;
    branchId?: string;
  }) {
    const dateFilter: Record<string, Date> = {};
    if (params.startDate) dateFilter.gte = new Date(params.startDate);
    if (params.endDate) dateFilter.lte = new Date(params.endDate);
    const hasDateFilter = Object.keys(dateFilter).length > 0;

    const invoiceWhere: Record<string, any> = {};
    const receiptWhere: Record<string, any> = {};
    if (hasDateFilter) invoiceWhere.issuedDate = dateFilter;
    if (hasDateFilter) receiptWhere.issuedAt = dateFilter;
    if (params.branchId) {
      invoiceWhere.customer = { branchId: params.branchId };
      receiptWhere.customer = { branchId: params.branchId };
    }

    const activeInvoiceWhere = { ...invoiceWhere, status: { notIn: ['Cancelled', 'CANCELLED', 'VOID'] } };
    const [invoiceCount, totalInvoiced, totalOutstanding, receiptCount] = await Promise.all([
      prisma.invoice.count({ where: invoiceWhere }),
      prisma.invoice.aggregate({ where: activeInvoiceWhere, _sum: { total: true } }),
      prisma.invoice.aggregate({ where: activeInvoiceWhere, _sum: { outstandingAmount: true } }),
      prisma.receipt.count({ where: receiptWhere }),
    ]);

    return {
      totalInvoices: invoiceCount,
      totalInvoiced: totalInvoiced._sum.total ?? 0,
      totalPaid: (totalInvoiced._sum.total ?? 0) - (totalOutstanding._sum.outstandingAmount ?? 0),
      totalReceipts: receiptCount,
    };
  }

  async getInvoiceReport(params: { startDate?: string; endDate?: string; branchId?: string }) {
    const where: any = {};
    if (params.branchId) where.customer = { branchId: params.branchId };
    if (params.startDate || params.endDate) {
      where.issuedDate = {};
      if (params.startDate) where.issuedDate.gte = new Date(params.startDate);
      if (params.endDate) where.issuedDate.lte = new Date(params.endDate);
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
          },
        },
        payments: true,
        receipts: true,
      },
      orderBy: { issuedDate: 'desc' },
    });
  }

  async getDashboardOverview(branchId?: string) {
    const invoiceScope = branchId ? { customer: { branchId } } : {};
    const [openInvoices, overdueInvoices, paidInvoices, totalOutstanding] = await Promise.all([
      prisma.invoice.count({ where: { ...invoiceScope, status: 'Unpaid' } }),
      prisma.invoice.count({ where: { ...invoiceScope, status: 'Overdue' } }),
      prisma.invoice.count({ where: { ...invoiceScope, status: 'Paid' } }),
      prisma.invoice.aggregate({ where: { ...invoiceScope, status: { in: ['Unpaid', 'Partially Paid', 'Overdue'] } }, _sum: { outstandingAmount: true } }),
    ]);

    return {
      openInvoices,
      overdueInvoices,
      paidInvoices,
      totalOutstanding: totalOutstanding._sum.outstandingAmount ?? 0,
    };
  }
}

export default FinanceService;

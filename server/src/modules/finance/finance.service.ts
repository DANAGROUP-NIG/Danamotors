import prisma from '../../prisma/client';
import { FinanceRepository } from './finance.repository';
import { NotFoundError } from '../../shared/errors/appError';
import { ROLES } from '../../shared/constants/roles';
import { NotificationService } from '../notification/notification.service';

export class FinanceService {
  private financeRepository: FinanceRepository;

  constructor() {
    this.financeRepository = new FinanceRepository();
  }

  async createInvoice(data: {
    customerId: string;
    jobCardId?: string;
    invoiceNumber: string;
    issuedDate?: string;
    dueDate?: string;
    subtotal: number;
    tax?: number;
    total: number;
    status?: string;
    notes?: string;
  }) {
    const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    if (data.jobCardId) {
      const jobCard = await prisma.jobCard.findUnique({ where: { id: data.jobCardId } });
      if (!jobCard) {
        throw new NotFoundError('Job card not found');
      }
    }

    return this.financeRepository.createInvoice({
      customerId: data.customerId,
      jobCardId: data.jobCardId,
      invoiceNumber: data.invoiceNumber,
      issuedDate: data.issuedDate ? new Date(data.issuedDate) : undefined,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      subtotal: data.subtotal,
      tax: data.tax,
      total: data.total,
      status: data.status,
      notes: data.notes,
    });
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
    subtotal?: number;
    tax?: number;
    total?: number;
    status?: string;
    notes?: string;
  }) {
    const invoice = await this.financeRepository.findInvoiceById(id);
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    return this.financeRepository.updateInvoice(id, {
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      subtotal: data.subtotal,
      tax: data.tax,
      total: data.total,
      status: data.status,
      notes: data.notes,
    });
  }

  async deleteInvoice(id: string) {
    const invoice = await this.financeRepository.findInvoiceById(id);
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }
    return this.financeRepository.deleteInvoice(id);
  }

  async createPayment(data: {
    invoiceId: string;
    recordedById: string;
    amount: number;
    method: string;
    paymentDate?: string;
    reference?: string;
    notes?: string;
  }) {
    const invoice = await this.financeRepository.findInvoiceById(data.invoiceId);
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    const user = await prisma.user.findUnique({ where: { id: data.recordedById } });
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const payment = await this.financeRepository.createPayment({
      invoiceId: data.invoiceId,
      recordedById: data.recordedById,
      amount: data.amount,
      method: data.method,
      paymentDate: data.paymentDate ? new Date(data.paymentDate) : undefined,
      reference: data.reference,
      notes: data.notes,
    });

    const paidAmountResult = await prisma.payment.aggregate({
      where: { invoiceId: data.invoiceId },
      _sum: { amount: true },
    });
    const paidAmount = paidAmountResult._sum.amount ?? 0;
    const newStatus = paidAmount >= invoice.total ? 'Paid' : 'Partially Paid';

    await prisma.invoice.update({
      where: { id: data.invoiceId },
      data: { status: newStatus },
    });

    if (newStatus === 'Paid') {
      const [customer, jobCard] = await Promise.all([
        prisma.customer.findUnique({
          where: { id: invoice.customerId },
          select: { firstName: true, lastName: true, branchId: true },
        }),
        invoice.jobCardId
          ? prisma.jobCard.findUnique({ where: { id: invoice.jobCardId }, select: { branchId: true } })
          : null,
      ]);
      const branchId = jobCard?.branchId ?? customer?.branchId ?? undefined;
      const notificationService = new NotificationService();
      const payload = {
        type: 'INVOICE_PAID',
        title: 'Invoice paid',
        message: `Invoice ${invoice.invoiceNumber} for ${customer?.firstName ?? ''} ${customer?.lastName ?? ''} is now fully paid.`,
        link: `/invoices/${invoice.id}`,
      };
      if (branchId) {
        await notificationService.notifyRole(ROLES.WORKSHOP_MANAGER, branchId, payload);
        await notificationService.notifyRole(ROLES.SERVICE_ADVISOR, branchId, payload);
      } else {
        await notificationService.notifyUsers([data.recordedById], {
          ...payload,
          branchId,
        });
      }
    }

    return payment;
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

  async createReceipt(data: {
    invoiceId: string;
    issuedById: string;
    amount: number;
    issuedAt?: string;
    reference?: string;
    notes?: string;
  }) {
    const invoice = await this.financeRepository.findInvoiceById(data.invoiceId);
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    const user = await prisma.user.findUnique({ where: { id: data.issuedById } });
    if (!user) {
      throw new NotFoundError('User not found');
    }

    return this.financeRepository.createReceipt({
      invoiceId: data.invoiceId,
      issuedById: data.issuedById,
      amount: data.amount,
      issuedAt: data.issuedAt ? new Date(data.issuedAt) : undefined,
      reference: data.reference,
      notes: data.notes,
    });
  }

  async listReceipts(params?: { branchId?: string }) {
    return this.financeRepository.listReceipts(params);
  }

  async getReceipt(id: string) {
    const receipt = await this.financeRepository.findReceiptById(id);
    if (!receipt) {
      throw new NotFoundError('Receipt not found');
    }
    return receipt;
  }

  async getSummaryReport(params: {
    startDate?: string;
    endDate?: string;
  }) {
    const dateFilter: Record<string, Date> = {};
    if (params.startDate) dateFilter.gte = new Date(params.startDate);
    if (params.endDate) dateFilter.lte = new Date(params.endDate);
    const hasDateFilter = Object.keys(dateFilter).length > 0;

    const invoiceWhere = hasDateFilter ? { createdAt: dateFilter } : {};
    const paymentWhere = hasDateFilter ? { paymentDate: dateFilter } : {};
    const receiptWhere = hasDateFilter ? { issuedAt: dateFilter } : {};

    const [invoiceCount, totalInvoiced, totalPaid, receiptCount] = await Promise.all([
      prisma.invoice.count({ where: invoiceWhere }),
      prisma.invoice.aggregate({ where: invoiceWhere, _sum: { total: true } }),
      prisma.payment.aggregate({ where: paymentWhere, _sum: { amount: true } }),
      prisma.receipt.count({ where: receiptWhere }),
    ]);

    return {
      totalInvoices: invoiceCount,
      totalInvoiced: totalInvoiced._sum.total ?? 0,
      totalPaid: totalPaid._sum.amount ?? 0,
      totalReceipts: receiptCount,
    };
  }

  async getInvoiceReport(params: { startDate?: string; endDate?: string }) {
    const where: any = {};
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

  async getDashboardOverview() {
    const [openInvoices, overdueInvoices, paidInvoices, totalOutstanding] = await Promise.all([
      prisma.invoice.count({ where: { status: 'Unpaid' } }),
      prisma.invoice.count({ where: { status: 'Overdue' } }),
      prisma.invoice.count({ where: { status: 'Paid' } }),
      prisma.invoice.aggregate({ where: { status: { in: ['Unpaid', 'Partially Paid'] } }, _sum: { total: true } }),
    ]);

    return {
      openInvoices,
      overdueInvoices,
      paidInvoices,
      totalOutstanding: totalOutstanding._sum.total ?? 0,
    };
  }
}

export default FinanceService;

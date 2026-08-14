import prisma from "../../prisma/client";
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
} from "../../shared/errors/appError";
import { NotificationService } from "../notification/notification.service";
import { ROLES } from "../../shared/constants/roles";

const APPLICATION_INCLUDE = {
  customer: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      branchId: true,
    },
  },
  invoice: {
    select: {
      id: true,
      invoiceNumber: true,
      total: true,
      status: true,
    },
  },
  requestedBy: {
    select: { id: true, firstName: true, lastName: true },
  },
} as const;

export class CreditService {
  private notificationService: NotificationService;

  constructor() {
    this.notificationService = new NotificationService();
  }

  /**
   * Staff adjusts a customer's credit balance.
   * amount is positive to add credit, negative to deduct/adjust down.
   */
  async adjustCredit(data: {
    customerId: string;
    amount: number;
    description?: string;
    recordedById: string;
  }) {
    if (!Number.isFinite(data.amount) || data.amount === 0) {
      throw new BadRequestError("Amount must be a non-zero number");
    }

    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
    });
    if (!customer) {
      throw new NotFoundError("Customer not found");
    }

    const newBalance = customer.creditBalance + data.amount;
    if (newBalance < 0) {
      throw new BadRequestError(
        "Cannot deduct more credit than the customer's current balance",
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.customer.update({
        where: { id: customer.id },
        data: { creditBalance: newBalance },
      });
      await tx.customerCreditTransaction.create({
        data: {
          customerId: customer.id,
          amount: data.amount,
          balanceAfter: newBalance,
          type: data.amount > 0 ? "CREDIT_IN" : "ADJUSTMENT",
          description: data.description,
          recordedById: data.recordedById,
        },
      });
      return result;
    });

    return updated;
  }

  async getCustomerCredit(customerId: string) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        branchId: true,
        creditBalance: true,
      },
    });
    if (!customer) {
      throw new NotFoundError("Customer not found");
    }

    const transactions = await prisma.customerCreditTransaction.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      include: {
        recordedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    return { customer, transactions };
  }

  async listApplications(params?: { status?: string; branchId?: string }) {
    const where: Record<string, unknown> = {};
    if (params?.status) where.status = params.status;
    if (params?.branchId) where.customer = { branchId: params.branchId };

    return prisma.customerCreditApplication.findMany({
      where,
      include: APPLICATION_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  async getApplication(id: string) {
    const application = await prisma.customerCreditApplication.findUnique({
      where: { id },
      include: APPLICATION_INCLUDE,
    });
    if (!application) {
      throw new NotFoundError("Credit application not found");
    }
    return application;
  }

  /**
   * Service advisor requests that a customer's credit be used against an
   * approved/outstanding invoice. The customer must accept it on the portal.
   */
  async createApplication(data: {
    customerId: string;
    invoiceId: string;
    amount: number;
    comments?: string;
    requestedById: string;
  }) {
    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
    });
    if (!customer) {
      throw new NotFoundError("Customer not found");
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: data.invoiceId },
      include: { payments: true },
    });
    if (!invoice) {
      throw new NotFoundError("Invoice not found");
    }
    if (invoice.customerId !== customer.id) {
      throw new BadRequestError(
        "Invoice does not belong to the selected customer",
      );
    }

    const paidAmount = invoice.payments.reduce(
      (sum, payment) => sum + payment.amount,
      0,
    );
    const outstanding = invoice.total - paidAmount;
    if (outstanding <= 0) {
      throw new BadRequestError("This invoice has no outstanding balance");
    }
    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      throw new BadRequestError("Amount must be a positive number");
    }
    if (data.amount > outstanding) {
      throw new BadRequestError(
        "Amount exceeds the outstanding balance of the invoice",
      );
    }
    if (data.amount > customer.creditBalance) {
      throw new BadRequestError(
        "Amount exceeds the customer's available credit balance",
      );
    }

    const existingPending = await prisma.customerCreditApplication.findFirst({
      where: {
        customerId: customer.id,
        invoiceId: invoice.id,
        status: "Pending",
      },
    });
    if (existingPending) {
      throw new ConflictError(
        "A pending credit application already exists for this invoice",
      );
    }

    return prisma.customerCreditApplication.create({
      data: {
        customerId: customer.id,
        invoiceId: invoice.id,
        amount: data.amount,
        comments: data.comments,
        requestedById: data.requestedById,
      },
      include: APPLICATION_INCLUDE,
    });
  }

  /**
   * The customer decides on a pending credit application from the portal.
   * On approval: a 'Credit' payment is recorded against the invoice and the
   * customer's credit balance is debited atomically.
   */
  async decideApplication(
    customerId: string,
    applicationId: string,
    data: { approved: boolean; comments?: string },
  ) {
    const application = await prisma.customerCreditApplication.findUnique({
      where: { id: applicationId },
      include: {
        invoice: true,
        customer: { select: { branchId: true } },
      },
    });
    if (!application || application.customerId !== customerId) {
      throw new NotFoundError("Credit application not found");
    }
    if (application.status !== "Pending") {
      throw new ConflictError(
        "This credit application has already been decided",
      );
    }

    const decisionDate = new Date();

    if (!data.approved) {
      const declined = await prisma.customerCreditApplication.update({
        where: { id: applicationId },
        data: { status: "Declined", decisionDate, comments: data.comments },
      });

      await this.notificationService.notifyUsers([application.requestedById], {
        type: "CREDIT_DECLINED",
        title: "Credit application declined",
        message: `Customer declined the credit application of ${new Intl.NumberFormat("en-NG", {
          style: "currency",
          currency: "NGN",
        }).format(application.amount)} on invoice ${application.invoice.invoiceNumber}.`,
        link: `/invoices/${application.invoiceId}`,
        branchId: application.customer?.branchId ?? null,
      });

      return declined;
    }

    const approved = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
      });
      if (!customer) {
        throw new NotFoundError("Customer not found");
      }
      if (customer.creditBalance < application.amount) {
        throw new ConflictError(
          "Insufficient credit balance to approve this application",
        );
      }

      const invoice = await tx.invoice.findUnique({
        where: { id: application.invoiceId },
        include: { payments: true },
      });
      if (!invoice) {
        throw new NotFoundError("Invoice not found");
      }

      const paidBefore = invoice.payments.reduce(
        (sum, payment) => sum + payment.amount,
        0,
      );
      const paidAfter = paidBefore + application.amount;
      const newStatus = paidAfter >= invoice.total ? "Paid" : "Partially Paid";
      const newBalance = customer.creditBalance - application.amount;

      await tx.customer.update({
        where: { id: customerId },
        data: { creditBalance: newBalance },
      });

      await tx.customerCreditTransaction.create({
        data: {
          customerId,
          amount: -application.amount,
          balanceAfter: newBalance,
          type: "USED",
          description: `Credit applied to invoice ${invoice.invoiceNumber}`,
          referenceId: applicationId,
        },
      });

      await tx.payment.create({
        data: {
          invoiceId: application.invoiceId,
          amount: application.amount,
          method: "Credit",
          reference: `CREDIT-${applicationId.slice(0, 8).toUpperCase()}`,
          notes: data.comments ?? "Customer credit application approved",
        },
      });

      await tx.invoice.update({
        where: { id: application.invoiceId },
        data: { status: newStatus },
      });

      return tx.customerCreditApplication.update({
        where: { id: applicationId },
        data: { status: "Approved", decisionDate, comments: data.comments },
        include: APPLICATION_INCLUDE,
      });
    });

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { branchId: true, firstName: true, lastName: true },
    });

    await this.notificationService.notifyRole(
      ROLES.SERVICE_ADVISOR,
      customer?.branchId,
      {
        type: "CREDIT_APPLIED",
        title: "Credit applied to invoice",
        message: `${customer?.firstName ?? ""} ${customer?.lastName ?? ""} approved using credit on invoice ${application.invoice.invoiceNumber}.`,
        link: `/invoices/${application.invoiceId}`,
      },
    );
    await this.notificationService.notifyRole(
      ROLES.ACCOUNTANT,
      customer?.branchId,
      {
        type: "CREDIT_APPLIED",
        title: "Credit applied to invoice",
        message: `${customer?.firstName ?? ""} ${customer?.lastName ?? ""} approved using credit on invoice ${application.invoice.invoiceNumber}.`,
        link: `/invoices/${application.invoiceId}`,
      },
    );

    return approved;
  }
}

export default CreditService;

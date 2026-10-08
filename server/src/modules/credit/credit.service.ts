import { Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { money } from "../finance/money";
import { PartyAccountService, availablePartyCredit, lockParty, withPartyTransaction } from "../finance/party-account.service";
import { fifoAdjustments } from "../finance/party-adjustment";
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

  async adjustCredit(_data: { customerId: string; amount: number; description?: string; recordedById: string }) {
    throw new BadRequestError("Credit is derived from receipts and credit notes. Record a receipt, credit note, or admin opening balance instead.");
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

    const creditBalance = await availablePartyCredit(prisma, customerId);
    return { customer: { ...customer, creditBalance }, transactions };
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
      include: { jobCard: { select: { branchId: true } } },
    });
    if (!invoice) {
      throw new NotFoundError("Invoice not found");
    }
    if (invoice.customerId !== customer.id) {
      throw new BadRequestError(
        "Invoice does not belong to the selected customer",
      );
    }

    const outstanding = money(invoice.outstandingAmount);
    if (outstanding <= 0) {
      throw new BadRequestError("This invoice has no outstanding balance");
    }
    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      throw new BadRequestError("Amount must be a positive number");
    }
    const amount = money(data.amount);
    if (amount <= 0) throw new BadRequestError("Amount must be at least 0.01");
    if (["CANCELLED", "CANCELED", "VOID"].includes(invoice.status.toUpperCase())) {
      throw new BadRequestError("Cannot apply credit to a cancelled invoice");
    }
    if (amount > outstanding) {
      throw new BadRequestError(
        "Amount exceeds the outstanding balance of the invoice",
      );
    }
    const availableCredit = await availablePartyCredit(prisma, customer.id, invoice.jobCard?.branchId ?? customer.branchId);
    if (amount > availableCredit) {
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
        amount,
        comments: data.comments,
        requestedById: data.requestedById,
      },
      include: APPLICATION_INCLUDE,
    });
  }

  /**
   * The customer decides on a pending credit application from the portal.
   * On approval: dated adjustments consume the party's oldest available
   * credits and reduce invoice outstanding atomically.
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
      const declined = await prisma.$transaction(async (tx) => {
        const decision = await tx.customerCreditApplication.updateMany({
          where: { id: applicationId, customerId, status: "Pending" },
          data: { status: "Declined", decisionDate, comments: data.comments },
        });
        if (decision.count !== 1) throw new ConflictError("This credit application has already been decided");
        return tx.customerCreditApplication.findUniqueOrThrow({ where: { id: applicationId } });
      });

      await this.notificationService.notifyUsers([application.requestedById], {
        type: "CREDIT_DECLINED",
        title: "Credit application declined",
        message: `Customer declined the credit application of ${new Intl.NumberFormat("en-NG", {
          style: "currency",
          currency: "NGN",
        }).format(application.amount)} on invoice ${application.invoice.invoiceNumber}.`,
        link: `/invoices`,
        branchId: application.customer?.branchId ?? null,
      });

      return declined;
    }

    const approved = await withPartyTransaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${applicationId},0))`);
      const customer = await lockParty(tx,customerId);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "CustomerCreditApplication" WHERE id = ${applicationId} FOR UPDATE`);
      const currentApplication = await tx.customerCreditApplication.findUnique({ where: { id: applicationId } });
      if (!currentApplication || currentApplication.customerId !== customerId) throw new NotFoundError("Credit application not found");
      if (currentApplication.status !== "Pending") throw new ConflictError("This credit application has already been decided");
      const amount = money(currentApplication.amount);
      if (amount <= 0) throw new BadRequestError("Amount must be at least 0.01");
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Invoice" WHERE id = ${currentApplication.invoiceId} FOR UPDATE`);
      const invoice = await tx.invoice.findUnique({ where: { id: currentApplication.invoiceId }, include: { jobCard: { select: { branchId: true } } } });
      if (!invoice) throw new NotFoundError("Invoice not found");
      if (invoice.customerId !== customerId || ["CANCELLED","CANCELED","VOID"].includes(invoice.status.toUpperCase())) throw new BadRequestError("Cannot apply credit to this invoice");
      if (amount > money(invoice.outstandingAmount)) throw new ConflictError("Amount exceeds the outstanding balance of the invoice");
      const branchId = invoice.jobCard?.branchId ?? customer.branchId;
      const partyAccount = new PartyAccountService();
      const credits = await partyAccount.fundingCredits(tx,customerId,branchId,decisionDate);
      const plan = fifoAdjustments([{ id: invoice.id, kind: 'INVOICE', number: invoice.invoiceNumber, date: invoice.issuedDate, amount: invoice.total, balance: amount }],credits);
      if (plan.amount !== amount) throw new ConflictError("Insufficient credit balance to approve this application; adjust older credits first if more than 200 credits are needed");
      const batch = await partyAccount.applyAdjustment(tx,{
        customerId, branchId, date: decisionDate.toISOString(), source: 'CREDIT_APPLICATION', idempotencyKey: applicationId,
        debits: plan.debits, credits: plan.credits,
      });
      const balanceAfter = await availablePartyCredit(tx,customerId);
      await tx.customerCreditTransaction.create({ data: { customerId, amount: -amount, balanceAfter, type: "USED", description: `Credit applied to invoice ${invoice.invoiceNumber}`, referenceId: applicationId } });
      await tx.auditLog.create({ data: { action: "CREDIT_APPLICATION_APPROVED", details: JSON.stringify({ customerId,applicationId,batchId: batch.id,invoiceId: invoice.id,amount,outstandingBefore: invoice.outstandingAmount,outstandingAfter: money(invoice.outstandingAmount-amount) }) } });
      return tx.customerCreditApplication.update({ where: { id: applicationId }, data: { status: "Approved",decisionDate,comments: data.comments,batchId: batch.id }, include: APPLICATION_INCLUDE });
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
        link: `/invoices`,
      },
    );
    await this.notificationService.notifyRole(
      ROLES.ACCOUNTANT,
      customer?.branchId,
      {
        type: "CREDIT_APPLIED",
        title: "Credit applied to invoice",
        message: `${customer?.firstName ?? ""} ${customer?.lastName ?? ""} approved using credit on invoice ${application.invoice.invoiceNumber}.`,
        link: `/invoices`,
      },
    );

    return approved;
  }
}

export default CreditService;

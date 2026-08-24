import { Request, Response, NextFunction } from 'express';
import { FinanceService } from './finance.service';
import { assertBranchOwnership } from '../../middleware/authorize';
import prisma from '../../prisma/client';
import { ROLES } from '../../shared/constants/roles';

export class FinanceController {
  private financeService: FinanceService;

  constructor() {
    this.financeService = new FinanceService();
  }

  createInvoice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: req.body.customerId },
        select: { branchId: true },
      });
      let branchId = customer?.branchId ?? undefined;
      if (req.body.jobCardId) {
        const jobCard = await prisma.jobCard.findUnique({
          where: { id: req.body.jobCardId },
          select: { branchId: true },
        });
        branchId = jobCard?.branchId ?? branchId;
      }
      assertBranchOwnership(req, branchId);
      const result = await this.financeService.createInvoice(req.body);
      res.status(201).json({ status: 'success', statusCode: 201, message: 'Invoice created successfully', data: { invoice: result } });
    } catch (error) {
      next(error);
    }
  };

  listInvoices = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let branchId = req.query.branchId as string | undefined;
      const customerId = req.query.customerId as string | undefined;
      if (req.user && req.user.role !== ROLES.SUPER_ADMIN) {
        branchId = req.user.branchId ?? undefined;
      }
      const result = await this.financeService.listInvoices({ branchId, customerId });
      res.status(200).json({ status: 'success', statusCode: 200, data: { invoices: result } });
    } catch (error) {
      next(error);
    }
  };

  getInvoice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.financeService.getInvoice(id);
      const branchId = (result as any).jobCard?.branchId ?? (result as any).customer?.branchId;
      assertBranchOwnership(req, branchId);
      res.status(200).json({ status: 'success', statusCode: 200, data: { invoice: result } });
    } catch (error) {
      next(error);
    }
  };

  updateInvoice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const invoice = await this.financeService.getInvoice(id);
      const branchId = (invoice as any).jobCard?.branchId ?? (invoice as any).customer?.branchId;
      assertBranchOwnership(req, branchId);
      const result = await this.financeService.updateInvoice(id, req.body);
      res.status(200).json({ status: 'success', statusCode: 200, message: 'Invoice updated successfully', data: { invoice: result } });
    } catch (error) {
      next(error);
    }
  };

  deleteInvoice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const invoice = await this.financeService.getInvoice(id);
      const branchId = (invoice as any).jobCard?.branchId ?? (invoice as any).customer?.branchId;
      assertBranchOwnership(req, branchId);
      await this.financeService.deleteInvoice(id);
      res.status(200).json({ status: 'success', statusCode: 200, message: 'Invoice deleted successfully' });
    } catch (error) {
      next(error);
    }
  };

  createPayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.body.invoiceId },
        select: {
          jobCard: { select: { branchId: true } },
          customer: { select: { branchId: true } },
        },
      });
      assertBranchOwnership(
        req,
        invoice?.jobCard?.branchId ?? invoice?.customer?.branchId,
      );
      const result = await this.financeService.createPayment({
        ...req.body,
        recordedById: req.user!.userId,
      });
      res.status(201).json({ status: 'success', statusCode: 201, message: 'Payment recorded successfully', data: { payment: result } });
    } catch (error) {
      next(error);
    }
  };

  listPayments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let branchId = req.query.branchId as string | undefined;
      if (req.user && req.user.role !== ROLES.SUPER_ADMIN) {
        branchId = req.user.branchId ?? undefined;
      }
      const result = await this.financeService.listPayments({ branchId });
      res.status(200).json({ status: 'success', statusCode: 200, data: { payments: result } });
    } catch (error) {
      next(error);
    }
  };

  getPayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.financeService.getPayment(id);
      const payment = await prisma.payment.findUnique({
        where: { id },
        select: {
          invoice: {
            select: {
              jobCard: { select: { branchId: true } },
              customer: { select: { branchId: true } },
            },
          },
        },
      });
      assertBranchOwnership(
        req,
        payment?.invoice?.jobCard?.branchId ?? payment?.invoice?.customer?.branchId,
      );
      res.status(200).json({ status: 'success', statusCode: 200, data: { payment: result } });
    } catch (error) {
      next(error);
    }
  };

  createReceipt = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.body.invoiceId },
        select: {
          jobCard: { select: { branchId: true } },
          customer: { select: { branchId: true } },
        },
      });
      assertBranchOwnership(
        req,
        invoice?.jobCard?.branchId ?? invoice?.customer?.branchId,
      );
      const result = await this.financeService.createReceipt({
        ...req.body,
        issuedById: req.user!.userId,
      });
      res.status(201).json({ status: 'success', statusCode: 201, message: 'Receipt issued successfully', data: { receipt: result } });
    } catch (error) {
      next(error);
    }
  };

  listReceipts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let branchId = req.query.branchId as string | undefined;
      if (req.user && req.user.role !== ROLES.SUPER_ADMIN) {
        branchId = req.user.branchId ?? undefined;
      }
      const result = await this.financeService.listReceipts({ branchId });
      res.status(200).json({ status: 'success', statusCode: 200, data: { receipts: result } });
    } catch (error) {
      next(error);
    }
  };

  getReceipt = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.financeService.getReceipt(id);
      const receipt = await prisma.receipt.findUnique({
        where: { id },
        select: {
          invoice: {
            select: {
              jobCard: { select: { branchId: true } },
              customer: { select: { branchId: true } },
            },
          },
        },
      });
      assertBranchOwnership(
        req,
        receipt?.invoice?.jobCard?.branchId ?? receipt?.invoice?.customer?.branchId,
      );
      res.status(200).json({ status: 'success', statusCode: 200, data: { receipt: result } });
    } catch (error) {
      next(error);
    }
  };

  getSummaryReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.financeService.getSummaryReport(req.query as any);
      res.status(200).json({ status: 'success', statusCode: 200, data: { summary: result } });
    } catch (error) {
      next(error);
    }
  };

  getInvoiceReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.financeService.getInvoiceReport(req.query as any);
      res.status(200).json({ status: 'success', statusCode: 200, data: { report: result } });
    } catch (error) {
      next(error);
    }
  };

  getDashboardOverview = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.financeService.getDashboardOverview();
      res.status(200).json({ status: 'success', statusCode: 200, data: { overview: result } });
    } catch (error) {
      next(error);
    }
  };
}

export default FinanceController;

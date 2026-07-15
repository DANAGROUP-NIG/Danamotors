import { Request, Response, NextFunction } from 'express';
import { FinanceService } from './finance.service';

export class FinanceController {
  private financeService: FinanceService;

  constructor() {
    this.financeService = new FinanceService();
  }

  createInvoice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.financeService.createInvoice(req.body);
      res.status(201).json({ status: 'success', statusCode: 201, message: 'Invoice created successfully', data: { invoice: result } });
    } catch (error) {
      next(error);
    }
  };

  listInvoices = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.financeService.listInvoices();
      res.status(200).json({ status: 'success', statusCode: 200, data: { invoices: result } });
    } catch (error) {
      next(error);
    }
  };

  getInvoice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.financeService.getInvoice(id);
      res.status(200).json({ status: 'success', statusCode: 200, data: { invoice: result } });
    } catch (error) {
      next(error);
    }
  };

  updateInvoice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.financeService.updateInvoice(id, req.body);
      res.status(200).json({ status: 'success', statusCode: 200, message: 'Invoice updated successfully', data: { invoice: result } });
    } catch (error) {
      next(error);
    }
  };

  deleteInvoice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      await this.financeService.deleteInvoice(id);
      res.status(200).json({ status: 'success', statusCode: 200, message: 'Invoice deleted successfully' });
    } catch (error) {
      next(error);
    }
  };

  createPayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.financeService.createPayment(req.body);
      res.status(201).json({ status: 'success', statusCode: 201, message: 'Payment recorded successfully', data: { payment: result } });
    } catch (error) {
      next(error);
    }
  };

  listPayments = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.financeService.listPayments();
      res.status(200).json({ status: 'success', statusCode: 200, data: { payments: result } });
    } catch (error) {
      next(error);
    }
  };

  getPayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.financeService.getPayment(id);
      res.status(200).json({ status: 'success', statusCode: 200, data: { payment: result } });
    } catch (error) {
      next(error);
    }
  };

  createReceipt = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.financeService.createReceipt(req.body);
      res.status(201).json({ status: 'success', statusCode: 201, message: 'Receipt issued successfully', data: { receipt: result } });
    } catch (error) {
      next(error);
    }
  };

  listReceipts = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.financeService.listReceipts();
      res.status(200).json({ status: 'success', statusCode: 200, data: { receipts: result } });
    } catch (error) {
      next(error);
    }
  };

  getReceipt = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.financeService.getReceipt(id);
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

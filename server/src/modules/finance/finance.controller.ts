import { assertNotePermission,noteScope } from './party-note.controller';
import type { TallyDocumentType } from './tally-xml';
import { Request, Response, NextFunction } from 'express';
import { FinanceService } from './finance.service';
import prisma from '../../prisma/client';
import { ROLES, PERMISSIONS } from '../../shared/constants/roles';
import { JobBillingService } from './job-billing.service';
import { ReceiptService } from './receipt.service';
import { TallyService } from './tally.service';
import { NotificationService } from '../notification/notification.service';
import { ForbiddenError } from '../../shared/errors/appError';

export class FinanceController {
  private financeService: FinanceService;
  private jobBillingService: JobBillingService;
  private receiptService: ReceiptService;
  private tallyService: TallyService;

  constructor() {
    this.financeService = new FinanceService();
    this.jobBillingService = new JobBillingService();
    this.receiptService = new ReceiptService();
    this.tallyService = new TallyService();
  }

  listBillableJobCards = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const branchId = req.user?.role === ROLES.SUPER_ADMIN ? req.query.branchId as string | undefined : req.user?.branchId ?? undefined;
      if (req.user?.role !== ROLES.SUPER_ADMIN && !branchId) throw new ForbiddenError('Your account must be assigned to a branch');
      const jobCards = await this.jobBillingService.listBillableJobCards(branchId);
      res.status(200).json({ status: 'success', statusCode: 200, data: { jobCards } });
    } catch (error) {
      next(error);
    }
  };

  previewJobBill = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const preview = await this.jobBillingService.previewJobBill(req.body);
      assertBillingBranch(req, preview.jobCard.branchId);
      res.status(200).json({ status: 'success', statusCode: 200, data: { preview } });
    } catch (error) {
      next(error);
    }
  };

  createJobBill = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const preview = await this.jobBillingService.previewJobBill(req.body);
      assertBillingBranch(req, preview.jobCard.branchId);
      const invoice = await this.jobBillingService.createJobBill({ ...req.body, actorId: req.user?.userId });
      if (invoice.serviceAdvisorId) {
        void new NotificationService().notifyUsers([invoice.serviceAdvisorId], {
          type: 'JOB_BILL_CREATED',
          title: 'Job bill created',
          message: `Job bill ${invoice.invoiceNumber} was created for ${preview.jobCard.jobNumber}.`,
          link: `/invoices/${invoice.id}`,
          branchId: preview.jobCard.branchId,
        }).catch(() => undefined);
      }
      res.status(201).json({ status: 'success', statusCode: 201, message: 'Job bill created', data: { invoice } });
    } catch (error) {
      next(error);
    }
  };

  cancelJobBill = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const invoice = await this.financeService.getInvoice(req.params.id);
      const branchId = (invoice as any).jobCard?.branchId ?? (invoice as any).customer?.branchId;
      assertBillingBranch(req, branchId);
      const result = await this.jobBillingService.cancelJobBill(req.params.id, req.user!.userId, req.body.remark);
      res.status(200).json({ status: 'success', statusCode: 200, message: 'Job bill cancelled', data: { invoice: result } });
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
        if (!branchId) throw new ForbiddenError('Your account must be assigned to a branch');
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
      assertBillingBranch(req, branchId);
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
      assertBillingBranch(req, branchId);
      const result = await this.financeService.updateInvoice(id, req.body);
      res.status(200).json({ status: 'success', statusCode: 200, message: 'Invoice updated successfully', data: { invoice: result } });
    } catch (error) {
      next(error);
    }
  };

  listPayments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let branchId = req.query.branchId as string | undefined;
      if (req.user && req.user.role !== ROLES.SUPER_ADMIN) {
        branchId = req.user.branchId ?? undefined;
        if (!branchId) throw new ForbiddenError('Your account must be assigned to a branch');
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
      assertBillingBranch(req, payment?.invoice?.jobCard?.branchId ?? payment?.invoice?.customer?.branchId);
      res.status(200).json({ status: 'success', statusCode: 200, data: { payment: result } });
    } catch (error) {
      next(error);
    }
  };

  createReceipt = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const branchId = req.user?.role === ROLES.SUPER_ADMIN ? req.body.branchId : req.user?.branchId;
      assertBillingBranch(req, branchId);
      if (!branchId) throw new ForbiddenError('Select the receiving branch');
      for (const allocation of req.body.allocations as Array<{ invoiceId: string }>) {
        const invoice = await prisma.invoice.findUnique({
          where: { id: allocation.invoiceId },
          select: { jobCard: { select: { branchId: true } }, customer: { select: { branchId: true } } },
        });
        assertBillingBranch(req, invoice?.jobCard?.branchId ?? invoice?.customer.branchId);
      }
      const result = await this.receiptService.createReceipt({
        ...req.body,
        branchId,
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
        if (!branchId) throw new ForbiddenError('Your account must be assigned to a branch');
      }
      const result = await this.receiptService.listReceipts({
        branchId,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        category: req.query.category as 'ALL' | 'SERVICE_PARTS' | 'SALES_ENQUIRY' | undefined,
      });
      res.status(200).json({ status: 'success', statusCode: 200, data: result });
    } catch (error) {
      next(error);
    }
  };

  getReceipt = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.receiptService.getReceipt(id);
      assertBillingBranch(req, result.branchId);
      res.status(200).json({ status: 'success', statusCode: 200, data: { receipt: result } });
    } catch (error) {
      next(error);
    }
  };

  updateReceipt = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const existing = await this.receiptService.getReceipt(req.params.id);
      assertBillingBranch(req, existing.branchId);
      const result = await this.receiptService.updateReceipt(req.params.id, {
        ...req.body,
        editedById: req.user!.userId,
      });
      res.status(200).json({ status: 'success', statusCode: 200, message: 'Receipt updated', data: { receipt: result } });
    } catch (error) {
      next(error);
    }
  };

  cancelReceipt = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const existing = await this.receiptService.getReceipt(req.params.id);
      assertBillingBranch(req, existing.branchId);
      const result = await this.receiptService.cancelReceipt(req.params.id, req.body.remark, req.user!.userId);
      res.status(200).json({ status: 'success', statusCode: 200, message: 'Receipt cancelled', data: { receipt: result } });
    } catch (error) {
      next(error);
    }
  };

  listBanks = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const banks = await this.receiptService.listBanks();
      res.status(200).json({ status: 'success', statusCode: 200, data: { banks } });
    } catch (error) {
      next(error);
    }
  };

  listTallyLedgers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ledgers = await this.tallyService.listLedgers(req.query.search as string | undefined);
      res.status(200).json({ status: 'success', statusCode: 200, data: { ledgers } });
    } catch (error) {
      next(error);
    }
  };

  listServiceAdvisors = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const branchId = req.user?.role === ROLES.SUPER_ADMIN ? req.query.branchId as string | undefined : req.user?.branchId ?? undefined;
      if (req.user?.role !== ROLES.SUPER_ADMIN && !branchId) throw new ForbiddenError('Your account must be assigned to a branch');
      const advisors = await prisma.user.findMany({
        where: { isActive: true, role: { name: ROLES.SERVICE_ADVISOR }, ...(branchId ? { branchId } : {}) },
        select: { id: true, firstName: true, lastName: true, email: true, branchId: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      });
      res.status(200).json({ status: 'success', statusCode: 200, data: { advisors } });
    } catch (error) {
      next(error);
    }
  };

  importTallyLedgers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.tallyService.importLedgers(req.body.ledgers);
      res.status(200).json({ status: 'success', statusCode: 200, data: result });
    } catch (error) {
      next(error);
    }
  };

  pendingTallyBatches = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const branchId = req.user?.role === ROLES.SUPER_ADMIN ? req.query.branchId as string | undefined : req.user?.branchId;
      if (req.user?.role !== ROLES.SUPER_ADMIN && !branchId) throw new ForbiddenError('Your account must be assigned to a branch');
      const noteDirections: Array<'DEBIT'|'CREDIT'>=[];
      if(req.user?.permissions?.includes(PERMISSIONS.DEBIT_NOTE_READ))noteDirections.push('DEBIT');
      if(req.user?.permissions?.includes(PERMISSIONS.CREDIT_NOTE_READ))noteDirections.push('CREDIT');
      const batches = await this.tallyService.pendingBatches(branchId ?? undefined,noteDirections);
      res.json({ status: 'success', data: { batches } });
    } catch (error) { next(error); }
  };

  listTallyDocuments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const noteType=req.query.type==='DEBIT_NOTE'||req.query.type==='CREDIT_NOTE';
      if(noteType)assertNotePermission(req,req.query.type==='DEBIT_NOTE'?'DEBIT':'CREDIT','read');
      const branchId = noteType?noteScope(req,req.query.branchId as string|undefined):req.user?.role === ROLES.SUPER_ADMIN ? req.query.branchId as string | undefined : req.user?.branchId ?? undefined;
      if (!noteType && req.user?.role !== ROLES.SUPER_ADMIN && !branchId) throw new ForbiddenError('Your account must be assigned to a branch');
      const documents = await this.tallyService.listDocuments({
        date: req.query.date as string,
        type: req.query.type as TallyDocumentType,
        branchId,
      });
      res.status(200).json({ status: 'success', statusCode: 200, data: { documents } });
    } catch (error) {
      next(error);
    }
  };

  exportTallyBatch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const documents = req.body.documents as Array<{ type: TallyDocumentType; id: string }>;
      for (const document of documents) {
        if(document.type==='DEBIT_NOTE'||document.type==='CREDIT_NOTE')assertNotePermission(req,document.type==='DEBIT_NOTE'?'DEBIT':'CREDIT','read');
      }
      if (req.user?.role !== ROLES.SUPER_ADMIN) {
        for (const document of documents) {
          const branchId = document.type === 'JOB_BILL'
            ? (await prisma.invoice.findUnique({ where: { id: document.id }, select: { jobCard: { select: { branchId: true } }, customer: { select: { branchId: true } } } }))?.jobCard?.branchId
              ?? (await prisma.invoice.findUnique({ where: { id: document.id }, select: { customer: { select: { branchId: true } } } }))?.customer.branchId
            : document.type === 'RECEIPT' ? (await prisma.receipt.findUnique({ where: { id: document.id }, select: { branchId: true } }))?.branchId : (await prisma.partyNote.findUnique({where:{id:document.id},select:{branchId:true}}))?.branchId;
          if(document.type==='DEBIT_NOTE'||document.type==='CREDIT_NOTE')noteScope(req,branchId??undefined);else assertBillingBranch(req, branchId);
        }
      }
      const result = await this.tallyService.exportBatch({ documents, postedById: req.user!.userId });
      if (result.skipped.length > 0) {
        const skippedList = result.skipped.map((document) => `${document.documentNumber ?? document.id}: ${document.reason}`).join('; ');
        void new NotificationService().notifyUsers([req.user!.userId], {
          type: 'TALLY_BATCH_SKIPPED_DOCUMENTS',
          title: 'Tally export has skipped documents',
          message: skippedList,
          link: '/finance/tally',
        }).catch(() => undefined);
      }
      res.status(200).json({ status: 'success', statusCode: 200, data: result });
    } catch (error) {
      next(error);
    }
  };

  confirmTallyBatch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const documents = req.body.documents as Array<{ type: TallyDocumentType; id: string; voucherNumber: string }>;
      for (const document of documents) {
        if(document.type==='DEBIT_NOTE'||document.type==='CREDIT_NOTE')assertNotePermission(req,document.type==='DEBIT_NOTE'?'DEBIT':'CREDIT','read');
      }
      if (req.user?.role !== ROLES.SUPER_ADMIN) {
        for (const document of documents) {
          const branchId = document.type === 'JOB_BILL'
            ? (await prisma.invoice.findUnique({ where: { id: document.id }, select: { jobCard: { select: { branchId: true } }, customer: { select: { branchId: true } } } }))?.jobCard?.branchId
              ?? (await prisma.invoice.findUnique({ where: { id: document.id }, select: { customer: { select: { branchId: true } } } }))?.customer.branchId
            : document.type === 'RECEIPT' ? (await prisma.receipt.findUnique({ where: { id: document.id }, select: { branchId: true } }))?.branchId : (await prisma.partyNote.findUnique({where:{id:document.id},select:{branchId:true}}))?.branchId;
          if(document.type==='DEBIT_NOTE'||document.type==='CREDIT_NOTE')noteScope(req,branchId??undefined);else assertBillingBranch(req, branchId);
        }
      }
      const result = await this.tallyService.confirmBatch({ ...req.body, postedById: req.user!.userId });
      res.status(200).json({ status: 'success', statusCode: 200, data: result });
    } catch (error) {
      next(error);
    }
  };

  getTallyAccountMappings = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const mappings = await this.tallyService.listAccountMappings();
      res.status(200).json({ status: 'success', statusCode: 200, data: { mappings } });
    } catch (error) {
      next(error);
    }
  };

  saveTallyAccountMappings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const mappings = await this.tallyService.saveAccountMappings(req.body.mappings);
      res.status(200).json({ status: 'success', statusCode: 200, data: { mappings } });
    } catch (error) {
      next(error);
    }
  };

  getSummaryReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const branchId = req.user?.role === ROLES.SUPER_ADMIN ? req.query.branchId as string | undefined : req.user?.branchId ?? undefined;
      if (req.user?.role !== ROLES.SUPER_ADMIN && !branchId) throw new ForbiddenError('Your account must be assigned to a branch');
      const result = await this.financeService.getSummaryReport({ ...(req.query as any), branchId });
      res.status(200).json({ status: 'success', statusCode: 200, data: { summary: result } });
    } catch (error) {
      next(error);
    }
  };

  getInvoiceReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const branchId = req.user?.role === ROLES.SUPER_ADMIN ? req.query.branchId as string | undefined : req.user?.branchId ?? undefined;
      if (req.user?.role !== ROLES.SUPER_ADMIN && !branchId) throw new ForbiddenError('Your account must be assigned to a branch');
      const result = await this.financeService.getInvoiceReport({ ...(req.query as any), branchId });
      res.status(200).json({ status: 'success', statusCode: 200, data: { report: result } });
    } catch (error) {
      next(error);
    }
  };

  getDashboardOverview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const branchId = req.user?.role === ROLES.SUPER_ADMIN ? req.query.branchId as string | undefined : req.user?.branchId ?? undefined;
      if (req.user?.role !== ROLES.SUPER_ADMIN && !branchId) throw new ForbiddenError('Your account must be assigned to a branch');
      const result = await this.financeService.getDashboardOverview(branchId);
      res.status(200).json({ status: 'success', statusCode: 200, data: { overview: result } });
    } catch (error) {
      next(error);
    }
  };
}

function assertBillingBranch(req: Request, branchId?: string | null): void {
  if (!req.user) throw new ForbiddenError('Authentication is required');
  if (req.user.role === ROLES.SUPER_ADMIN) return;
  if (!req.user.branchId || !branchId || req.user.branchId !== branchId) {
    throw new ForbiddenError('Billing access is restricted to your assigned branch');
  }
}

export default FinanceController;

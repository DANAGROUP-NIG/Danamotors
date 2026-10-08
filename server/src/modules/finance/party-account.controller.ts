import { Request, Response, NextFunction } from 'express';
import prisma from '../../prisma/client';
import { ROLES } from '../../shared/constants/roles';
import { ForbiddenError, NotFoundError } from '../../shared/errors/appError';
import { PartyAccountService } from './party-account.service';

function scopedBranch(req: Request, selected?: string) {
  if (req.user?.role === ROLES.SUPER_ADMIN || req.user?.role === ROLES.ADMIN) return selected;
  if (!req.user?.branchId) throw new ForbiddenError('Your account must be assigned to a branch');
  if (selected && selected !== req.user.branchId) throw new ForbiddenError('You can only access your own branch');
  return req.user.branchId;
}

async function assertPartyAccess(req: Request, customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { branchId: true, mergedIntoId: true, type: true } });
  if (!customer || customer.mergedIntoId || customer.type?.toUpperCase() === 'VENDOR') throw new NotFoundError('Customer not found');
  scopedBranch(req,customer.branchId);
}

export class PartyAccountController {
  private service = new PartyAccountService();
  search = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const customers = await this.service.search(scopedBranch(req, req.query.branchId as string | undefined), req.query.search as string, req.query.order as "name" | "code", Number(req.query.limit));
      res.json({ status: "success", statusCode: 200, data: { customers } });
    } catch (error) { next(error); }
  };
  account = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await assertPartyAccess(req,req.params.customerId);
      const branchId = scopedBranch(req,req.query.branchId as string | undefined);
      const account = await this.service.account(req.params.customerId,branchId);
      res.json({ status: 'success', statusCode: 200, data: { account } });
    } catch(error) { next(error); }
  };
  documents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await assertPartyAccess(req,req.params.customerId);
      const branchId = scopedBranch(req,req.query.branchId as string | undefined);
      const result = await this.service.documents(req.params.customerId,{ branchId, side: req.query.side as 'DEBIT' | 'CREDIT', openOnly: req.query.openOnly === 'true', page: Number(req.query.page), pageSize: Number(req.query.pageSize) });
      res.json({ status: 'success', statusCode: 200, data: result });
    } catch(error) { next(error); }
  };
  fifo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await assertPartyAccess(req,req.body.customerId);
      const branchId = scopedBranch(req,req.body.branchId)!;
      const preview = await this.service.fifo(req.body.customerId,branchId,new Date(req.body.date));
      res.json({ status: 'success', statusCode: 200, data: { preview } });
    } catch(error) { next(error); }
  };
  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await assertPartyAccess(req,req.body.customerId);
      scopedBranch(req,req.body.branchId);
      const batch = await this.service.createAdjustment(req.body,req.user!.userId);
      res.status(201).json({ status: 'success', statusCode: 201, message: 'Adjustment saved', data: { batch } });
    } catch(error) { next(error); }
  };
  batches = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await assertPartyAccess(req,req.params.customerId);
      const branchId = scopedBranch(req,req.query.branchId as string | undefined);
      const batches = await this.service.batches(req.params.customerId,branchId);
      res.json({ status: 'success', statusCode: 200, data: { batches } });
    } catch(error) { next(error); }
  };
  reverse = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const existing = await prisma.partyAdjustmentBatch.findUnique({ where: { id: req.params.id } });
      if (!existing) throw new NotFoundError('Adjustment batch not found');
      scopedBranch(req,existing.branchId);
      const batch = await this.service.reverse(req.params.id,req.body.remark,req.user!.userId);
      res.json({ status: 'success', statusCode: 200, message: 'Adjustment reversed', data: { batch } });
    } catch(error) { next(error); }
  };
  opening = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await assertPartyAccess(req,req.body.customerId);
      scopedBranch(req,req.body.branchId);
      const note = await this.service.openingBalance(req.body,req.user!.userId);
      res.status(201).json({ status: 'success', statusCode: 201, message: 'Opening balance recorded', data: { note } });
    } catch(error) { next(error); }
  };
}

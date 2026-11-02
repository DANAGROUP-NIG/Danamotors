import { Request, Response, NextFunction } from 'express';
import { canAccessAllBranches } from '../../middleware/authorize';
import { UnauthorizedError } from '../../shared/errors/appError';
import { PERMISSIONS, ROLES } from '../../shared/constants/roles';
import { LabourSlipActor } from './labour-slip.logic';
import { LabourSlipService } from './labour-slip.service';
import { listLabourSlipsSchema } from './labour-slip.validation';

export function labourSlipActor(req: Request): LabourSlipActor {
  if (!req.user) throw new UnauthorizedError();
  return { userId: req.user.userId, branchId: req.user.branchId, allBranches: canAccessAllBranches(req.user), goodwill: req.user.role === ROLES.SUPER_ADMIN || req.user.permissions.includes(PERMISSIONS.WARRANTY_UPDATE) };
}

export class LabourSlipController {
  private service = new LabourSlipService();

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { const slips = await this.service.list(listLabourSlipsSchema.parse({ query: req.query }).query, labourSlipActor(req)); res.status(200).json({ status: 'success', statusCode: 200, data: { labourSlips: slips } }); }
    catch (error) { next(error); }
  };
  get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { const slip = await this.service.get(req.params.id, labourSlipActor(req)); res.status(200).json({ status: 'success', statusCode: 200, data: { labourSlip: slip } }); }
    catch (error) { next(error); }
  };
  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { const slip = await this.service.create(req.body, labourSlipActor(req)); res.status(201).json({ status: 'success', statusCode: 201, data: { labourSlip: slip } }); }
    catch (error) { next(error); }
  };
  addLine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { const slip = await this.service.save(req.params.id, req.body, labourSlipActor(req)); res.status(201).json({ status: 'success', statusCode: 201, data: { labourSlip: slip } }); }
    catch (error) { next(error); }
  };
  updateLine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { const slip = await this.service.save(req.params.id, req.body, labourSlipActor(req), req.params.lineId); res.status(200).json({ status: 'success', statusCode: 200, data: { labourSlip: slip } }); }
    catch (error) { next(error); }
  };
}

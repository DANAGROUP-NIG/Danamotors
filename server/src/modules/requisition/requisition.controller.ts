import { Request, Response, NextFunction } from 'express';
import { canAccessAllBranches } from '../../middleware/authorize';
import { UnauthorizedError } from '../../shared/errors/appError';
import { PERMISSIONS, ROLES } from '../../shared/constants/roles';
import { RequisitionService } from './requisition.service';
import { RequisitionActor } from './requisition.logic';
import { listRequisitionsSchema } from './requisition.validation';

export function requisitionActor(req: Request): RequisitionActor {
  if (!req.user) throw new UnauthorizedError();
  return {
    userId: req.user.userId, branchId: req.user.branchId,
    allBranches: canAccessAllBranches(req.user),
    goodwill: req.user.role === ROLES.SUPER_ADMIN || req.user.permissions.includes(PERMISSIONS.REQUISITION_GOODWILL),
  };
}

export class RequisitionController {
  private service = new RequisitionService();

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.list(listRequisitionsSchema.parse({ query: req.query }).query, requisitionActor(req));
      res.status(200).json({ status: 'success', statusCode: 200, data: { requisitions: data } });
    } catch (error) { next(error); }
  };

  get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.get(req.params.id, requisitionActor(req));
      res.status(200).json({ status: 'success', statusCode: 200, data: { requisition: data } });
    } catch (error) { next(error); }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.create(req.body, requisitionActor(req));
      res.status(201).json({ status: 'success', statusCode: 201, data: { requisition: data } });
    } catch (error) { next(error); }
  };

  cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.cancel(req.params.id, req.body.reason, requisitionActor(req));
      res.status(200).json({ status: 'success', statusCode: 200, data: { requisition: data } });
    } catch (error) { next(error); }
  };
}

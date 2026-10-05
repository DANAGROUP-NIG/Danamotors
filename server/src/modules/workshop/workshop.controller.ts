import { Request, Response, NextFunction } from 'express';
import { WorkshopService } from './workshop.service';
import { ROLES } from '../../shared/constants/roles';
import { assertBranchOwnership } from '../../middleware/authorize';
import prisma from '../../prisma/client';
import { ForbiddenError, NotFoundError } from '../../shared/errors/appError';

async function assertJobAccess(req: Request) {
  const card = await prisma.jobCard.findUnique({ where: { id: req.params.id }, select: { branchId: true } });
  if (!card) throw new NotFoundError('Job card not found');
  if (req.user?.role !== ROLES.SUPER_ADMIN && !req.user?.branchId) throw new ForbiddenError('Your account is not assigned to a branch');
  assertBranchOwnership(req, card.branchId);
}

export class WorkshopController {
  private workshopService: WorkshopService;

  constructor() {
    this.workshopService = new WorkshopService();
  }

  listTechnicians = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;
      const search = req.query.search as string | undefined;
      let branchId = req.query.branchId as string | undefined;

      if (req.user && req.user.role !== ROLES.SUPER_ADMIN && req.user.role !== ROLES.WORKSHOP_MANAGER && req.user.role !== ROLES.RECEPTION_MANAGER) {
        branchId = req.user.branchId ?? undefined;
      }

      const result = await this.workshopService.listTechnicians({ page, limit, branchId, search });
      res.status(200).json({ status: 'success', statusCode: 200, data: result });
    } catch (error) {
      next(error);
    }
  };

  assignTechnician = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { technicianId, qualityInspectorId } = req.body;
      await assertJobAccess(req);
      const result = await this.workshopService.assignTechnician(id, technicianId, qualityInspectorId);
      res.status(200).json({ status: 'success', statusCode: 200, message: 'Technician assigned successfully', data: { jobCard: result } });
    } catch (error) {
      next(error);
    }
  };

  updateProgress = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { progress, status } = req.body;
      await assertJobAccess(req);
      const result = await this.workshopService.updateProgress(id, progress, status, req.user?.userId);
      res.status(200).json({ status: 'success', statusCode: 200, message: 'Job progress updated successfully', data: { jobCard: result } });
    } catch (error) {
      next(error);
    }
  };

  updateQC = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { qcStatus, qcNotes } = req.body;
      await assertJobAccess(req);
      const result = await this.workshopService.updateQC(id, qcStatus, qcNotes);
      res.status(200).json({ status: 'success', statusCode: 200, message: 'QC status updated successfully', data: { jobCard: result } });
    } catch (error) {
      next(error);
    }
  };
}

export default WorkshopController;

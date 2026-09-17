import { Request, Response, NextFunction } from 'express';
import { AuditService } from './audit.service';
import { ROLES } from '../../shared/constants/roles';

export class AuditController {
  private auditService: AuditService;

  constructor() {
    this.auditService = new AuditService();
  }

  listLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit, userId, action, search, dateFrom, dateTo } = req.query as any;

      let branchId: string | undefined;
      if (req.user && req.user.role !== ROLES.SUPER_ADMIN) {
        branchId = req.user.branchId ?? undefined;
      }

      const result = await this.auditService.listLogs({
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        userId,
        action,
        search,
        dateFrom: dateFrom ? new Date(dateFrom) : undefined,
        dateTo: dateTo ? new Date(dateTo) : undefined,
        branchId,
      });

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  getLog = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.auditService.getLog(id);

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        data: {
          log: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  getStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let branchId: string | undefined;
      if (req.user && req.user.role !== ROLES.SUPER_ADMIN) {
        branchId = req.user.branchId ?? undefined;
      }

      const result = await this.auditService.getStats(branchId);

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}

export default AuditController;

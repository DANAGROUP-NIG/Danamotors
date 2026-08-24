import { Request, Response, NextFunction } from 'express';
import { DashboardService } from './dashboard.service';
import { ROLES } from '../../shared/constants/roles';
import { ForbiddenError } from '../../shared/errors/appError';

// Roles allowed to view dashboard stats for any branch. Everyone else is
// scoped to their assigned branch.
const CROSS_BRANCH_ROLES = new Set<string>([
  ROLES.SUPER_ADMIN,
  ROLES.GENERAL_STORE_MANAGER,
  ROLES.RECEPTION_MANAGER,
]);

export class DashboardController {
  private dashboardService: DashboardService;

  constructor() {
    this.dashboardService = new DashboardService();
  }

  getStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { branchId } = req.query as { branchId?: string };

      if (
        branchId &&
        !CROSS_BRANCH_ROLES.has(req.user!.role) &&
        req.user!.branchId &&
        branchId !== req.user!.branchId
      ) {
        throw new ForbiddenError(
          'You can only view dashboards for your own branch',
        );
      }

      const userId = req.user!.userId;
      const result = await this.dashboardService.getStats(branchId, userId);
      res.status(200).json({ status: 'success', statusCode: 200, data: result });
    } catch (error) {
      next(error);
    }
  };
}

export default DashboardController;

import { Request, Response, NextFunction } from 'express';
import { DashboardService } from './dashboard.service';

export class DashboardController {
  private dashboardService: DashboardService;

  constructor() {
    this.dashboardService = new DashboardService();
  }

  getStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { branchId } = req.query as { branchId?: string };
      const result = await this.dashboardService.getStats(branchId);
      res.status(200).json({ status: 'success', statusCode: 200, data: result });
    } catch (error) {
      next(error);
    }
  };
}

export default DashboardController;

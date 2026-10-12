import { Request, Response, NextFunction } from "express";
import { DashboardService } from "./dashboard.service";
import { canAccessAllBranches } from "../../middleware/authorize";
import { ForbiddenError } from "../../shared/errors/appError";

export class DashboardController {
  private dashboardService: DashboardService;

  constructor() {
    this.dashboardService = new DashboardService();
  }

  getStats = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      let branchId = req.query.branchId as string | undefined;
      if (!canAccessAllBranches(req.user) && !req.user?.branchId) {
        throw new ForbiddenError("Your account is not assigned to a branch");
      }

      if (
        branchId &&
        !canAccessAllBranches(req.user) &&
        req.user!.branchId &&
        branchId !== req.user!.branchId
      ) {
        throw new ForbiddenError(
          "You can only view dashboards for your own branch",
        );
      }

      if (!canAccessAllBranches(req.user)) branchId = req.user!.branchId!;

      const userId = req.user!.userId;
      const result = await this.dashboardService.getStats(branchId, userId);
      res
        .status(200)
        .json({ status: "success", statusCode: 200, data: result });
    } catch (error) {
      next(error);
    }
  };
}

export default DashboardController;

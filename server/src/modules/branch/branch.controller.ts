import { Request, Response, NextFunction } from 'express';
import { BranchService } from './branch.service';

export class BranchController {
  private branchService: BranchService;

  constructor() {
    this.branchService = new BranchService();
  }

  getBranches = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;
      const search = req.query.search as string | undefined;

      const result = await this.branchService.listBranches({ page, limit, search });

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        data: {
          branches: result.branches,
          meta: result.meta,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  getBranch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.branchService.getBranch(id);

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        data: {
          branch: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  createBranch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.branchService.createBranch(req.body);

      res.status(201).json({
        status: 'success',
        statusCode: 201,
        message: 'Branch created successfully',
        data: {
          branch: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  updateBranch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.branchService.updateBranch(id, req.body);

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        message: 'Branch updated successfully',
        data: {
          branch: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  deleteBranch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.branchService.deleteBranch(id);

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        message: 'Branch deleted successfully',
        data: {
          branch: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}

export default BranchController;

import { Request, Response, NextFunction } from 'express';
import { EnquiryService } from './enquiry.service';
import { assertBranchOwnership } from '../../middleware/authorize';
import { ROLES } from '../../shared/constants/roles';

export class EnquiryController {
  private enquiryService: EnquiryService;

  constructor() {
    this.enquiryService = new EnquiryService();
  }

  // Public endpoint — no auth required
  createEnquiry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.enquiryService.createEnquiry(req.body);
      res.status(201).json({
        status: 'success',
        statusCode: 201,
        message: 'Enquiry submitted successfully. We will contact you shortly.',
        data: { enquiry: result },
      });
    } catch (error) {
      next(error);
    }
  };

  getEnquiry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.enquiryService.getEnquiry(id);
      assertBranchOwnership(req, result.branchId);
      res.status(200).json({ status: 'success', statusCode: 200, data: { enquiry: result } });
    } catch (error) {
      next(error);
    }
  };

  listEnquiries = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;
      const status = req.query.status as string | undefined;
      const search = req.query.search as string | undefined;
      let branchId = req.query.branchId as string | undefined;

      // Branch scoping for non-privileged roles
      if (req.user && req.user.role !== ROLES.SUPER_ADMIN && req.user.role !== ROLES.RECEPTION_MANAGER) {
        branchId = req.user.branchId ?? undefined;
      }

      const result = await this.enquiryService.listEnquiries({
        page,
        limit,
        status,
        branchId,
        search,
      });

      res.status(200).json({ status: 'success', statusCode: 200, data: result });
    } catch (error) {
      next(error);
    }
  };

  approveEnquiry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { reviewNotes } = req.body;
      const reviewerId = req.user!.userId;

      const existing = await this.enquiryService.getEnquiry(id);
      assertBranchOwnership(req, existing.branchId);

      const result = await this.enquiryService.approveEnquiry(id, reviewerId, reviewNotes);
      res.status(200).json({
        status: 'success',
        statusCode: 200,
        message: 'Enquiry approved successfully',
        data: { enquiry: result },
      });
    } catch (error) {
      next(error);
    }
  };

  rejectEnquiry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { reviewNotes } = req.body;
      const reviewerId = req.user!.userId;

      const existing = await this.enquiryService.getEnquiry(id);
      assertBranchOwnership(req, existing.branchId);

      const result = await this.enquiryService.rejectEnquiry(id, reviewerId, reviewNotes);
      res.status(200).json({
        status: 'success',
        statusCode: 200,
        message: 'Enquiry rejected',
        data: { enquiry: result },
      });
    } catch (error) {
      next(error);
    }
  };
}

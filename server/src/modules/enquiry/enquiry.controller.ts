import { Request, Response, NextFunction } from 'express';
import { EnquiryService } from './enquiry.service';
import { assertBranchOwnership } from '../../middleware/authorize';
import { ROLES } from '../../shared/constants/roles';
import { ForbiddenError } from '../../shared/errors/appError';

export class EnquiryController {
  private service = new EnquiryService();

  createEnquiry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const enquiry = await this.service.createEnquiry(req.body);
      res.status(201).json({
        status: 'success', statusCode: 201,
        message: 'Your enquiry has been received. We will get back to you shortly.',
        data: { enquiry: { id: enquiry.id, status: enquiry.status, createdAt: enquiry.createdAt } },
      });
    } catch (error) { next(error); }
  };

  listEnquiries = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page  = Number(req.query.page)  || 1;
      const limit = Number(req.query.limit) || 10;
      const search   = req.query.search   as string | undefined;
      const status   = req.query.status   as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo   = req.query.dateTo   as string | undefined;

      let branchId = req.query.branchId as string | undefined;
      if (req.user && req.user.role !== ROLES.SUPER_ADMIN && req.user.role !== ROLES.RECEPTION_MANAGER) {
        branchId = req.user.branchId ?? undefined;
      }

      const result = await this.service.listEnquiries({ page, limit, branchId, status, search, dateFrom, dateTo });
      res.status(200).json({ status: 'success', statusCode: 200, data: result });
    } catch (error) { next(error); }
  };

  getEnquiry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const enquiry = await this.service.getEnquiry(req.params.id);
      assertBranchOwnership(req, enquiry.branch?.id);
      res.status(200).json({ status: 'success', statusCode: 200, data: { enquiry } });
    } catch (error) { next(error); }
  };

  reviewEnquiry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const reviewedById = req.user!.userId;
      const { enquiry, appointment } = await this.service.reviewEnquiry(req.params.id, reviewedById, req.body);
      const action = req.body.action as 'approve' | 'reject';
      res.status(200).json({
        status: 'success', statusCode: 200,
        message: action === 'approve' ? 'Enquiry approved successfully' : 'Enquiry rejected',
        data: { enquiry, appointment },
      });
    } catch (error) { next(error); }
  };

  deleteEnquiry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== ROLES.SUPER_ADMIN && req.user?.role !== ROLES.ADMIN) {
        throw new ForbiddenError('Only SuperAdmin or Admin can delete enquiries');
      }
      await this.service.deleteEnquiry(req.params.id);
      res.status(200).json({ status: 'success', statusCode: 200, message: 'Enquiry deleted' });
    } catch (error) { next(error); }
  };
}

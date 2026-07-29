import { Request, Response, NextFunction } from 'express';
import { ServiceService } from './service.service';
import { assertBranchOwnership } from '../../middleware/authorize';
import { ROLES } from '../../shared/constants/roles';
import prisma from '../../prisma/client';
import { ForbiddenError } from '../../shared/errors/appError';

export class ServiceController {
  private serviceService: ServiceService;

  constructor() {
    this.serviceService = new ServiceService();
  }

  createAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Admin can only create appointments in their own branch
      if (req.user && req.user.role !== ROLES.SUPER_ADMIN && req.user.role !== ROLES.RECEPTION_MANAGER && req.user.branchId && req.body.branchName) {
        const userBranch = await prisma.branch.findUnique({ where: { id: req.user.branchId } });
        if (userBranch) {
          req.body.branchName = userBranch.name;
        }
      }

      const createdById = req.user?.userId;
      const result = await this.serviceService.createAppointment({ ...req.body, createdById });
      res.status(201).json({ status: 'success', statusCode: 201, message: 'Appointment booked successfully', data: { appointment: result } });
    } catch (error) {
      next(error);
    }
  };

  listAppointments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = zCoerceNumber(req.query.page, 1);
      const limit = zCoerceNumber(req.query.limit, 10);
      const search = req.query.search as string | undefined;
      const customerId = req.query.customerId as string | undefined;
      let branchId = req.query.branchId as string | undefined;
      const status = req.query.status as string | undefined;
      let createdById: string | undefined;

      // Only SuperAdmin and ReceptionManager can see all branches; others are locked to their branch
      if (req.user && req.user.role !== ROLES.SUPER_ADMIN && req.user.role !== ROLES.RECEPTION_MANAGER) {
        branchId = req.user.branchId ?? undefined;
      }

      // Receptionists can only see their own bookings
      if (req.user && req.user.role === ROLES.RECEPTIONIST) {
        createdById = req.user.userId;
      }

      const result = await this.serviceService.listAppointments({
        page,
        limit,
        search,
        branchId,
        status,
        createdById,
        customerId,
      });

      res.status(200).json({ status: 'success', statusCode: 200, data: result });
    } catch (error) {
      next(error);
    }
  };

  getAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.serviceService.getAppointment(id);
      res.status(200).json({ status: 'success', statusCode: 200, data: { appointment: result } });
    } catch (error) {
      next(error);
    }
  };

  updateAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const appointment = await this.serviceService.getAppointment(id);
      assertBranchOwnership(req, (appointment as any).branchId);
      const result = await this.serviceService.updateAppointment(id, req.body);
      res.status(200).json({ status: 'success', statusCode: 200, message: 'Appointment updated successfully', data: { appointment: result } });
    } catch (error) {
      next(error);
    }
  };

  deleteAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const appointment = await this.serviceService.getAppointment(id);
      assertBranchOwnership(req, (appointment as any).branchId);
      await this.serviceService.deleteAppointment(id);
      res.status(200).json({ status: 'success', statusCode: 200, message: 'Appointment deleted successfully' });
    } catch (error) {
      next(error);
    }
  };

  createJobCard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role === ROLES.RECEPTIONIST) {
        throw new ForbiddenError('Receptionists cannot create job cards');
      }
      const createdById = req.user?.userId;
      const result = await this.serviceService.createJobCard({ ...req.body, createdById });
      res.status(201).json({ status: 'success', statusCode: 201, message: 'Job card created successfully', data: { jobCard: result } });
    } catch (error) {
      next(error);
    }
  };

  listJobCards = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 50;
      const customerId = req.query.customerId as string | undefined;
      let branchId = req.query.branchId as string | undefined;

      if (req.user && req.user.role !== ROLES.SUPER_ADMIN && req.user.role !== ROLES.RECEPTION_MANAGER) {
        branchId = req.user.branchId ?? undefined;
      }

      const result = await this.serviceService.listJobCards({ page, limit, branchId, customerId });
      res.status(200).json({ status: 'success', statusCode: 200, data: result });
    } catch (error) {
      next(error);
    }
  };

  getJobCard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.serviceService.getJobCard(id);
      res.status(200).json({ status: 'success', statusCode: 200, data: { jobCard: result } });
    } catch (error) {
      next(error);
    }
  };

  updateJobCard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.serviceService.updateJobCard(id, req.body);
      res.status(200).json({ status: 'success', statusCode: 200, message: 'Job card updated successfully', data: { jobCard: result } });
    } catch (error) {
      next(error);
    }
  };

  addInspection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role === ROLES.RECEPTIONIST) {
        throw new ForbiddenError('Receptionists cannot add inspections');
      }
      const { id } = req.params;
      const result = await this.serviceService.addInspection(id, req.body);
      res.status(201).json({ status: 'success', statusCode: 201, message: 'Inspection added successfully', data: { inspection: result } });
    } catch (error) {
      next(error);
    }
  };

  addEstimate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role === ROLES.RECEPTIONIST) {
        throw new ForbiddenError('Receptionists cannot add estimates');
      }
      const { id } = req.params;
      const result = await this.serviceService.addEstimate(id, req.body);
      res.status(201).json({ status: 'success', statusCode: 201, message: 'Estimate created successfully', data: { estimate: result } });
    } catch (error) {
      next(error);
    }
  };

  addApproval = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.serviceService.addApproval(id, req.body);
      res.status(201).json({ status: 'success', statusCode: 201, message: 'Customer approval recorded successfully', data: { approval: result } });
    } catch (error) {
      next(error);
    }
  };

  getApprovals = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.serviceService.getApprovals(id);
      res.status(200).json({ status: 'success', statusCode: 200, data: { approvals: result } });
    } catch (error) {
      next(error);
    }
  };
}

function zCoerceNumber(val: any, fallback: number): number {
  if (val === undefined || val === null) return fallback;
  const num = Number(val);
  return isNaN(num) ? fallback : num;
}

export default ServiceController;

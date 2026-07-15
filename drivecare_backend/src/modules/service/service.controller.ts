import { Request, Response, NextFunction } from 'express';
import { ServiceService } from './service.service';

export class ServiceController {
  private serviceService: ServiceService;

  constructor() {
    this.serviceService = new ServiceService();
  }

  createAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.serviceService.createAppointment(req.body);
      res.status(201).json({ status: 'success', statusCode: 201, message: 'Appointment booked successfully', data: { appointment: result } });
    } catch (error) {
      next(error);
    }
  };

  listAppointments = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.serviceService.listAppointments();
      res.status(200).json({ status: 'success', statusCode: 200, data: { appointments: result } });
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
      const result = await this.serviceService.updateAppointment(id, req.body);
      res.status(200).json({ status: 'success', statusCode: 200, message: 'Appointment updated successfully', data: { appointment: result } });
    } catch (error) {
      next(error);
    }
  };

  createJobCard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.serviceService.createJobCard(req.body);
      res.status(201).json({ status: 'success', statusCode: 201, message: 'Job card created successfully', data: { jobCard: result } });
    } catch (error) {
      next(error);
    }
  };

  listJobCards = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.serviceService.listJobCards();
      res.status(200).json({ status: 'success', statusCode: 200, data: { jobCards: result } });
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
      const { id } = req.params;
      const result = await this.serviceService.addInspection(id, req.body);
      res.status(201).json({ status: 'success', statusCode: 201, message: 'Inspection added successfully', data: { inspection: result } });
    } catch (error) {
      next(error);
    }
  };

  addEstimate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
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

export default ServiceController;

import { Request, Response, NextFunction } from 'express';
import { WorkshopService } from './workshop.service';

export class WorkshopController {
  private workshopService: WorkshopService;

  constructor() {
    this.workshopService = new WorkshopService();
  }

  assignTechnician = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { technicianId, qualityInspectorId } = req.body;
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
      const result = await this.workshopService.updateProgress(id, progress, status);
      res.status(200).json({ status: 'success', statusCode: 200, message: 'Job progress updated successfully', data: { jobCard: result } });
    } catch (error) {
      next(error);
    }
  };

  updateQC = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { qcStatus, qcNotes } = req.body;
      const result = await this.workshopService.updateQC(id, qcStatus, qcNotes);
      res.status(200).json({ status: 'success', statusCode: 200, message: 'QC status updated successfully', data: { jobCard: result } });
    } catch (error) {
      next(error);
    }
  };
}

export default WorkshopController;

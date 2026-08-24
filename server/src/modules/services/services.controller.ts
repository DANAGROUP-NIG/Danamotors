import { Request, Response, NextFunction } from 'express';
import { ServicesService } from './services.service';

export class ServicesController {
  private servicesService: ServicesService;

  constructor() {
    this.servicesService = new ServicesService();
  }

  listServices = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;
      const search = req.query.search as string | undefined;
      const category = req.query.category as string | undefined;
      const isActive =
        req.query.isActive === undefined
          ? undefined
          : req.query.isActive === 'true';

      const result = await this.servicesService.listServices({
        page,
        limit,
        search,
        category,
        isActive,
      });

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        data: {
          services: result.services,
          meta: result.meta,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  getService = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.servicesService.getService(id);

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        data: {
          service: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  createService = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.servicesService.createService(req.body);

      res.status(201).json({
        status: 'success',
        statusCode: 201,
        message: 'Service created successfully',
        data: {
          service: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  updateService = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.servicesService.updateService(id, req.body);

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        message: 'Service updated successfully',
        data: {
          service: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  deleteService = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.servicesService.deleteService(id);

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        message: 'Service deleted successfully',
        data: {
          service: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}

export default ServicesController;

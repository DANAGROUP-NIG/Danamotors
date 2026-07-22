import { Request, Response, NextFunction } from 'express';
import { VehicleService } from './vehicle.service';

export class VehicleController {
  private vehicleService: VehicleService;

  constructor() {
    this.vehicleService = new VehicleService();
  }

  getVehicles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;
      const search = req.query.search as string | undefined;
      const branchId = req.query.branchId as string | undefined;

      const result = await this.vehicleService.listVehicles({ page, limit, search, branchId });

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        data: {
          vehicles: result.vehicles,
          meta: result.meta,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  getVehicle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.vehicleService.getVehicle(id);

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        data: {
          vehicle: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  createVehicle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.vehicleService.createVehicle(req.body);

      res.status(201).json({
        status: 'success',
        statusCode: 201,
        message: 'Vehicle registered successfully',
        data: {
          vehicle: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  updateVehicle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.vehicleService.updateVehicle(id, req.body);

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        message: 'Vehicle updated successfully',
        data: {
          vehicle: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  deleteVehicle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      await this.vehicleService.deleteVehicle(id);

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        message: 'Vehicle deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  addVehicleImage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.vehicleService.addVehicleImage(id, req.body);

      res.status(201).json({
        status: 'success',
        statusCode: 201,
        message: 'Vehicle image added successfully',
        data: {
          image: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  getVehicleImages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.vehicleService.getVehicleImages(id);

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        data: {
          images: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  addVehicleOwnership = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.vehicleService.addVehicleOwnership(id, req.body);

      res.status(201).json({
        status: 'success',
        statusCode: 201,
        message: 'Vehicle ownership record created successfully',
        data: {
          ownership: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  getVehicleOwnerships = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.vehicleService.getVehicleOwnerships(id);

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        data: {
          ownerships: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}

export default VehicleController;

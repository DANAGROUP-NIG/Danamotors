import { Request, Response, NextFunction } from "express";
import { PortalService } from "./portal.service";

export class PortalController {
  private portalService: PortalService;

  constructor() {
    this.portalService = new PortalService();
  }

  getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.portalService.getMe(req.customer!.customerId);
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { profile: result },
      });
    } catch (error) {
      next(error);
    }
  };

  updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.portalService.updateProfile(
        req.customer!.customerId,
        req.body,
      );
      res.status(200).json({
        status: "success",
        statusCode: 200,
        message: "Profile updated successfully",
        data: { profile: result },
      });
    } catch (error) {
      next(error);
    }
  };

  changePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.portalService.changePassword(req.customer!.customerId, req.body);
      res.status(200).json({
        status: "success",
        statusCode: 200,
        message: "Password changed successfully. Please sign in again.",
      });
    } catch (error) {
      next(error);
    }
  };

  getDashboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.portalService.getDashboard(req.customer!.customerId);
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { stats: result },
      });
    } catch (error) {
      next(error);
    }
  };

  getVehicles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const vehicles = await this.portalService.getVehicles(req.customer!.customerId);
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { vehicles },
      });
    } catch (error) {
      next(error);
    }
  };

  registerVehicle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const vehicle = await this.portalService.registerVehicle(
        req.customer!.customerId,
        req.body,
      );
      res.status(201).json({
        status: "success",
        statusCode: 201,
        message: "Vehicle registered successfully",
        data: { vehicle },
      });
    } catch (error) {
      next(error);
    }
  };

  getVehicle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const vehicle = await this.portalService.getVehicle(
        req.customer!.customerId,
        req.params.id,
      );
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { vehicle },
      });
    } catch (error) {
      next(error);
    }
  };

  getJobCards = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filters = {
        status: req.query.status as string | undefined,
        vehicleId: req.query.vehicleId as string | undefined,
      };
      const jobCards = await this.portalService.getJobCards(
        req.customer!.customerId,
        filters,
      );
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { jobCards },
      });
    } catch (error) {
      next(error);
    }
  };

  getJobCard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const jobCard = await this.portalService.getJobCard(
        req.customer!.customerId,
        req.params.id,
      );
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { jobCard },
      });
    } catch (error) {
      next(error);
    }
  };

  getAppointments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const appointments = await this.portalService.getAppointments(req.customer!.customerId);
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { appointments },
      });
    } catch (error) {
      next(error);
    }
  };

  getServices = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const services = await this.portalService.getServices();
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { services },
      });
    } catch (error) {
      next(error);
    }
  };

  bookAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const appointment = await this.portalService.bookAppointment(
        req.customer!.customerId,
        req.body,
      );
      res.status(201).json({
        status: "success",
        statusCode: 201,
        message: "Appointment booked successfully",
        data: { appointment },
      });
    } catch (error) {
      next(error);
    }
  };

  getInvoices = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const invoices = await this.portalService.getInvoices(req.customer!.customerId);
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { invoices },
      });
    } catch (error) {
      next(error);
    }
  };

  getInvoice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const invoice = await this.portalService.getInvoice(
        req.customer!.customerId,
        req.params.id,
      );
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { invoice },
      });
    } catch (error) {
      next(error);
    }
  };

  submitEstimateApproval = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.portalService.submitEstimateApproval(
        req.customer!.customerId,
        req.params.id,
        req.body,
      );
      res.status(200).json({
        status: "success",
        statusCode: 200,
        message: "Your decision has been recorded",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  getCredit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.portalService.getCredit(req.customer!.customerId);
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { credit: result },
      });
    } catch (error) {
      next(error);
    }
  };

  getCreditApplications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const applications = await this.portalService.getCreditApplications(req.customer!.customerId);
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { applications },
      });
    } catch (error) {
      next(error);
    }
  };

  decideCreditApplication = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.portalService.decideCreditApplication(
        req.customer!.customerId,
        req.params.id,
        req.body,
      );
      res.status(200).json({
        status: "success",
        statusCode: 200,
        message: "Your decision has been recorded",
        data: { application: result },
      });
    } catch (error) {
      next(error);
    }
  };
}

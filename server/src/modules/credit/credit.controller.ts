import { Request, Response, NextFunction } from "express";
import { CreditService } from "./credit.service";
import { assertBranchOwnership } from "../../middleware/authorize";
import { ROLES } from "../../shared/constants/roles";
import prisma from "../../prisma/client";

export class CreditController {
  private creditService: CreditService;

  constructor() {
    this.creditService = new CreditService();
  }

  getCustomerCredit = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: req.params.customerId },
        select: { branchId: true },
      });
      assertBranchOwnership(req, customer?.branchId);
      const result = await this.creditService.getCustomerCredit(
        req.params.customerId,
      );
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { credit: result },
      });
    } catch (error) {
      next(error);
    }
  };

  adjustCredit = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: req.params.customerId },
        select: { branchId: true },
      });
      assertBranchOwnership(req, customer?.branchId);
      const result = await this.creditService.adjustCredit({
        customerId: req.params.customerId,
        amount: req.body.amount,
        description: req.body.description,
        recordedById: req.user!.userId,
      });
      res.status(200).json({
        status: "success",
        statusCode: 200,
        message: "Customer credit updated successfully",
        data: { credit: result },
      });
    } catch (error) {
      next(error);
    }
  };

  listApplications = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      let branchId = req.query.branchId as string | undefined;
      if (req.user && req.user.role !== ROLES.SUPER_ADMIN) {
        branchId = req.user.branchId ?? undefined;
      }
      const result = await this.creditService.listApplications({
        status: req.query.status as string | undefined,
        branchId,
      });
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { applications: result },
      });
    } catch (error) {
      next(error);
    }
  };

  getApplication = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const application = await this.creditService.getApplication(
        req.params.id,
      );
      assertBranchOwnership(req, application.customer.branchId);
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { application },
      });
    } catch (error) {
      next(error);
    }
  };

  createApplication = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: req.body.customerId },
        select: { branchId: true },
      });
      assertBranchOwnership(req, customer?.branchId);
      const result = await this.creditService.createApplication({
        customerId: req.body.customerId,
        invoiceId: req.body.invoiceId,
        amount: req.body.amount,
        comments: req.body.comments,
        requestedById: req.user!.userId,
      });
      res.status(201).json({
        status: "success",
        statusCode: 201,
        message: "Credit application created. The customer will review it on the portal.",
        data: { application: result },
      });
    } catch (error) {
      next(error);
    }
  };
}

export default CreditController;

import { Request, Response, NextFunction } from 'express';
import { CustomerService } from './customer.service';

export class CustomerController {
  private customerService: CustomerService;

  constructor() {
    this.customerService = new CustomerService();
  }

  getCustomers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;
      const search = req.query.search as string | undefined;
      const branchId = req.query.branchId as string | undefined;

      const result = await this.customerService.listCustomers({ page, limit, search, branchId });

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        data: {
          customers: result.customers,
          meta: result.meta,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  getCustomer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.customerService.getCustomer(id);

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        data: {
          customer: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  createCustomer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.customerService.createCustomer(req.body);

      res.status(201).json({
        status: 'success',
        statusCode: 201,
        message: 'Customer registered successfully',
        data: {
          customer: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  updateCustomer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.customerService.updateCustomer(id, req.body);

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        message: 'Customer profile updated successfully',
        data: {
          customer: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  addCustomerDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.customerService.addCustomerDocument(id, req.body);

      res.status(201).json({
        status: 'success',
        statusCode: 201,
        message: 'Customer document uploaded successfully',
        data: {
          document: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  getCustomerDocuments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.customerService.getCustomerDocuments(id);

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        data: {
          documents: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  addServiceHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.customerService.addServiceHistory(id, req.body);

      res.status(201).json({
        status: 'success',
        statusCode: 201,
        message: 'Service history record created successfully',
        data: {
          serviceHistory: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  getServiceHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.customerService.getServiceHistory(id);

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        data: {
          serviceHistory: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}

export default CustomerController;

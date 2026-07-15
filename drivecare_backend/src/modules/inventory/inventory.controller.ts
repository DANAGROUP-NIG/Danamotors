import { Request, Response, NextFunction } from 'express';
import { InventoryService } from './inventory.service';

export class InventoryController {
  private inventoryService: InventoryService;

  constructor() {
    this.inventoryService = new InventoryService();
  }

  listSpareParts = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.inventoryService.listSpareParts();
      res.status(200).json({ status: 'success', statusCode: 200, data: { spareParts: result } });
    } catch (error) {
      next(error);
    }
  };

  getSparePart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.inventoryService.getSparePart(id);
      res.status(200).json({ status: 'success', statusCode: 200, data: { sparePart: result } });
    } catch (error) {
      next(error);
    }
  };

  createSparePart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.inventoryService.createSparePart(req.body);
      res.status(201).json({ status: 'success', statusCode: 201, message: 'Spare part created successfully', data: { sparePart: result } });
    } catch (error) {
      next(error);
    }
  };

  updateSparePart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.inventoryService.updateSparePart(id, req.body);
      res.status(200).json({ status: 'success', statusCode: 200, message: 'Spare part updated successfully', data: { sparePart: result } });
    } catch (error) {
      next(error);
    }
  };

  deleteSparePart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      await this.inventoryService.deleteSparePart(id);
      res.status(200).json({ status: 'success', statusCode: 200, message: 'Spare part deleted successfully' });
    } catch (error) {
      next(error);
    }
  };

  createPurchaseRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.inventoryService.createPurchaseRequest(req.body);
      res.status(201).json({ status: 'success', statusCode: 201, message: 'Purchase request created successfully', data: { purchaseRequest: result } });
    } catch (error) {
      next(error);
    }
  };

  listPurchaseRequests = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.inventoryService.listPurchaseRequests();
      res.status(200).json({ status: 'success', statusCode: 200, data: { purchaseRequests: result } });
    } catch (error) {
      next(error);
    }
  };

  getPurchaseRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.inventoryService.getPurchaseRequest(id);
      res.status(200).json({ status: 'success', statusCode: 200, data: { purchaseRequest: result } });
    } catch (error) {
      next(error);
    }
  };

  updatePurchaseRequestStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.inventoryService.updatePurchaseRequestStatus(id, req.body);
      res.status(200).json({ status: 'success', statusCode: 200, message: 'Purchase request status updated successfully', data: { purchaseRequest: result } });
    } catch (error) {
      next(error);
    }
  };

  createPartIssuance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.inventoryService.createPartIssuance(req.body);
      res.status(201).json({ status: 'success', statusCode: 201, message: 'Part issuance recorded successfully', data: { issuance: result } });
    } catch (error) {
      next(error);
    }
  };

  listPartIssuances = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.inventoryService.listPartIssuances();
      res.status(200).json({ status: 'success', statusCode: 200, data: { issuances: result } });
    } catch (error) {
      next(error);
    }
  };

  getPartIssuance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.inventoryService.getPartIssuance(id);
      res.status(200).json({ status: 'success', statusCode: 200, data: { issuance: result } });
    } catch (error) {
      next(error);
    }
  };

  createPartReturn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.inventoryService.createPartReturn(req.body);
      res.status(201).json({ status: 'success', statusCode: 201, message: 'Part return recorded successfully', data: { partReturn: result } });
    } catch (error) {
      next(error);
    }
  };

  listPartReturns = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.inventoryService.listPartReturns();
      res.status(200).json({ status: 'success', statusCode: 200, data: { returns: result } });
    } catch (error) {
      next(error);
    }
  };

  getPartReturn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.inventoryService.getPartReturn(id);
      res.status(200).json({ status: 'success', statusCode: 200, data: { partReturn: result } });
    } catch (error) {
      next(error);
    }
  };
}

export default InventoryController;

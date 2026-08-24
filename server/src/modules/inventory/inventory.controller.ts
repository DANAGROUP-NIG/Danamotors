import { Request, Response, NextFunction } from 'express';
import { InventoryService } from './inventory.service';
import { assertBranchOwnership } from '../../middleware/authorize';
import prisma from '../../prisma/client';
import { ForbiddenError } from '../../shared/errors/appError';
import { ROLES } from '../../shared/constants/roles';

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
      const { branchStock, ...partData } = req.body;

      // Only cross-branch managers can stock multiple branches at once
      if (branchStock && branchStock.length > 0) {
        const role = req.user?.role;
        if (role !== ROLES.SUPER_ADMIN && role !== ROLES.GENERAL_STORE_MANAGER) {
          throw new ForbiddenError('Only SuperAdmin and General Store Manager can stock multiple branches simultaneously');
        }
      }

      const result = await this.inventoryService.createSparePart({
        ...partData,
        branchStock,
        recordedById: req.user?.userId,
      });
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

  // ── Branch Stock ───────────────────────────────────────────────────────

  getBranchStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { branchId, partId } = req.params;
      assertBranchOwnership(req, branchId);
      const result = await this.inventoryService.getBranchStock(branchId, partId);
      res.status(200).json({ status: 'success', statusCode: 200, data: { stock: result } });
    } catch (error) {
      next(error);
    }
  };

  listBranchStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { branchId } = req.params;
      assertBranchOwnership(req, branchId);
      const result = await this.inventoryService.listBranchStock(branchId);
      res.status(200).json({ status: 'success', statusCode: 200, data: { stockItems: result } });
    } catch (error) {
      next(error);
    }
  };

  listAllStock = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.inventoryService.listAllStock();
      res.status(200).json({ status: 'success', statusCode: 200, data: { stockItems: result } });
    } catch (error) {
      next(error);
    }
  };

  adjustStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      assertBranchOwnership(req, req.body.branchId);
      const result = await this.inventoryService.adjustStock({
        ...req.body,
        recordedById: req.user?.userId,
      });
      res.status(200).json({ status: 'success', statusCode: 200, message: 'Stock adjusted successfully', data: { stock: result } });
    } catch (error) {
      next(error);
    }
  };

  listStockTransactions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { branchId, partId } = req.query as { branchId?: string; partId?: string };
      if (branchId) assertBranchOwnership(req, branchId);
      const result = await this.inventoryService.listStockTransactions(branchId, partId);
      res.status(200).json({ status: 'success', statusCode: 200, data: { transactions: result } });
    } catch (error) {
      next(error);
    }
  };

  // ── Purchase Requests ──────────────────────────────────────────────────

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
      const request = await prisma.purchaseRequest.findUnique({
        where: { id },
        select: { requestedBy: { select: { branchId: true } } },
      });
      assertBranchOwnership(req, request?.requestedBy?.branchId);
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

  // ── Part Issuances ─────────────────────────────────────────────────────

  createPartIssuance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      assertBranchOwnership(req, req.body.branchId);
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
      const issuance = await prisma.partIssuance.findUnique({
        where: { id },
        select: { jobCard: { select: { branchId: true } } },
      });
      assertBranchOwnership(req, issuance?.jobCard?.branchId);
      const result = await this.inventoryService.getPartIssuance(id);
      res.status(200).json({ status: 'success', statusCode: 200, data: { issuance: result } });
    } catch (error) {
      next(error);
    }
  };

  // ── Part Returns ───────────────────────────────────────────────────────

  createPartReturn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      assertBranchOwnership(req, req.body.branchId);
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
      const partReturn = await prisma.partReturn.findUnique({
        where: { id },
        select: {
          partIssuance: {
            select: { jobCard: { select: { branchId: true } } },
          },
        },
      });
      assertBranchOwnership(req, partReturn?.partIssuance?.jobCard?.branchId);
      const result = await this.inventoryService.getPartReturn(id);
      res.status(200).json({ status: 'success', statusCode: 200, data: { partReturn: result } });
    } catch (error) {
      next(error);
    }
  };

  // ── Inter-Branch Transfers ─────────────────────────────────────────────

  createTransfer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user && req.user.role !== ROLES.SUPER_ADMIN && req.user.role !== ROLES.GENERAL_STORE_MANAGER && req.user.branchId) {
        const { requestingBranchId, sourceBranchId } = req.body as {
          requestingBranchId?: string;
          sourceBranchId?: string;
        };
        if (
          requestingBranchId !== req.user.branchId &&
          sourceBranchId !== req.user.branchId
        ) {
          throw new ForbiddenError(
            'You can only create transfers involving your own branch',
          );
        }
      }
      const result = await this.inventoryService.createTransfer({
        ...req.body,
        requestedById: req.user?.userId,
      });
      res.status(201).json({ status: 'success', statusCode: 201, message: 'Transfer created successfully', data: { transfer: result } });
    } catch (error) {
      next(error);
    }
  };

  getTransfer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const transfer = await prisma.interBranchTransfer.findUnique({
        where: { id },
        select: { requestingBranchId: true, sourceBranchId: true },
      });
      if (req.user && req.user.role !== ROLES.SUPER_ADMIN && req.user.role !== ROLES.GENERAL_STORE_MANAGER && req.user.branchId) {
        if (
          transfer?.requestingBranchId !== req.user.branchId &&
          transfer?.sourceBranchId !== req.user.branchId
        ) {
          throw new ForbiddenError(
            'You can only view transfers involving your own branch',
          );
        }
      }
      const result = await this.inventoryService.getTransfer(id);
      res.status(200).json({ status: 'success', statusCode: 200, data: { transfer: result } });
    } catch (error) {
      next(error);
    }
  };

  listTransfers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { status, requestingBranchId, sourceBranchId } = req.query as {
        status?: string;
        requestingBranchId?: string;
        sourceBranchId?: string;
      };
      const result = await this.inventoryService.listTransfers({ status, requestingBranchId, sourceBranchId });
      res.status(200).json({ status: 'success', statusCode: 200, data: { transfers: result } });
    } catch (error) {
      next(error);
    }
  };

  approveTransfer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.inventoryService.approveTransfer(id, req.user!.userId);
      res.status(200).json({ status: 'success', statusCode: 200, message: 'Transfer approved successfully', data: { transfer: result } });
    } catch (error) {
      next(error);
    }
  };

  dispatchTransfer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.inventoryService.dispatchTransfer(id, req.user!.userId, req.body.items);
      res.status(200).json({ status: 'success', statusCode: 200, message: 'Transfer dispatched successfully', data: { transfer: result } });
    } catch (error) {
      next(error);
    }
  };

  receiveTransfer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const transfer = await prisma.interBranchTransfer.findUnique({
        where: { id },
        select: { requestingBranchId: true },
      });
      assertBranchOwnership(req, transfer?.requestingBranchId);
      const result = await this.inventoryService.receiveTransfer(id, req.user!.userId, req.body.items);
      res.status(200).json({ status: 'success', statusCode: 200, message: 'Transfer received successfully', data: { transfer: result } });
    } catch (error) {
      next(error);
    }
  };

  rejectTransfer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.inventoryService.rejectTransfer(id, req.user!.userId, req.body.notes);
      res.status(200).json({ status: 'success', statusCode: 200, message: 'Transfer rejected', data: { transfer: result } });
    } catch (error) {
      next(error);
    }
  };

  cancelTransfer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.inventoryService.cancelTransfer(id);
      res.status(200).json({ status: 'success', statusCode: 200, message: 'Transfer cancelled', data: { transfer: result } });
    } catch (error) {
      next(error);
    }
  };
}

export default InventoryController;

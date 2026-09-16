import { Request, Response, NextFunction } from "express";
import { InventoryService } from "./inventory.service";
import { assertInventoryBranchAccess } from "../../middleware/authorize";
import prisma from "../../prisma/client";
import { PERMISSIONS, ROLES } from "../../shared/constants/roles";

export class InventoryController {
  private inventoryService: InventoryService;

  private isCrossBranchUser(req: Request): boolean {
    return (
      req.user?.role === ROLES.SUPER_ADMIN ||
      req.user?.permissions.includes(PERMISSIONS.INVENTORY_CROSS_BRANCH) ===
        true
    );
  }

  constructor() {
    this.inventoryService = new InventoryService();
  }

  listSpareParts = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const branchId = this.isCrossBranchUser(req)
        ? undefined
        : req.user?.branchId;
      assertInventoryBranchAccess(req, [branchId]);
      const result = await this.inventoryService.listSpareParts(
        branchId ?? undefined,
      );
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { spareParts: result },
      });
    } catch (error) {
      next(error);
    }
  };

  getSparePart = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const branchId = this.isCrossBranchUser(req)
        ? undefined
        : req.user?.branchId;
      assertInventoryBranchAccess(req, [branchId]);
      const result = await this.inventoryService.getSparePart(
        id,
        branchId ?? undefined,
      );
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { sparePart: result },
      });
    } catch (error) {
      next(error);
    }
  };

  createSparePart = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { branchStock, ...partData } = req.body;

      // Only cross-branch managers can stock multiple branches at once
      if (branchStock && branchStock.length > 0) {
        assertInventoryBranchAccess(
          req,
          branchStock.map((stock: { branchId: string }) => stock.branchId),
        );
      }

      const result = await this.inventoryService.createSparePart({
        ...partData,
        branchStock,
        recordedById: req.user?.userId,
      });
      res.status(201).json({
        status: "success",
        statusCode: 201,
        message: "Spare part created successfully",
        data: { sparePart: result },
      });
    } catch (error) {
      next(error);
    }
  };

  updateSparePart = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const part = await prisma.sparePart.findUnique({
        where: { id },
        select: { inventoryStocks: { select: { branchId: true } } },
      });
      assertInventoryBranchAccess(
        req,
        part?.inventoryStocks.length
          ? part.inventoryStocks.map((stock) => stock.branchId)
          : [req.user?.branchId],
      );
      const result = await this.inventoryService.updateSparePart(id, req.body);
      res.status(200).json({
        status: "success",
        statusCode: 200,
        message: "Spare part updated successfully",
        data: { sparePart: result },
      });
    } catch (error) {
      next(error);
    }
  };

  deleteSparePart = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const part = await prisma.sparePart.findUnique({
        where: { id },
        select: { inventoryStocks: { select: { branchId: true } } },
      });
      assertInventoryBranchAccess(
        req,
        part?.inventoryStocks.length
          ? part.inventoryStocks.map((stock) => stock.branchId)
          : [req.user?.branchId],
      );
      await this.inventoryService.deleteSparePart(id);
      res.status(200).json({
        status: "success",
        statusCode: 200,
        message: "Spare part deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  };

  // ── Branch Stock ───────────────────────────────────────────────────────

  getBranchStock = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { branchId, partId } = req.params;
      assertInventoryBranchAccess(req, [branchId]);
      const result = await this.inventoryService.getBranchStock(
        branchId,
        partId,
      );
      res
        .status(200)
        .json({ status: "success", statusCode: 200, data: { stock: result } });
    } catch (error) {
      next(error);
    }
  };

  listBranchStock = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { branchId } = req.params;
      assertInventoryBranchAccess(req, [branchId]);
      const result = await this.inventoryService.listBranchStock(branchId);
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { stockItems: result },
      });
    } catch (error) {
      next(error);
    }
  };

  listAllStock = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { branchId, partId, search } = req.query as {
        branchId?: string;
        partId?: string;
        search?: string;
      };
      const scopedBranchId = this.isCrossBranchUser(req)
        ? branchId
        : (req.user?.branchId ?? undefined);
      assertInventoryBranchAccess(req, [scopedBranchId]);
      const result = await this.inventoryService.listAllStock({
        branchId: scopedBranchId,
        partId,
        search,
      });
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { stockItems: result },
      });
    } catch (error) {
      next(error);
    }
  };

  adjustStock = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      assertInventoryBranchAccess(req, [req.body.branchId]);
      const result = await this.inventoryService.adjustStock({
        ...req.body,
        recordedById: req.user?.userId,
      });
      res.status(200).json({
        status: "success",
        statusCode: 200,
        message: "Stock adjusted successfully",
        data: { stock: result },
      });
    } catch (error) {
      next(error);
    }
  };

  listStockTransactions = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { branchId, partId } = req.query as {
        branchId?: string;
        partId?: string;
      };
      const scopedBranchId = this.isCrossBranchUser(req)
        ? branchId
        : (branchId ?? req.user?.branchId);
      assertInventoryBranchAccess(req, [scopedBranchId]);
      const result = await this.inventoryService.listStockTransactions(
        scopedBranchId ?? undefined,
        partId,
      );
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { transactions: result },
      });
    } catch (error) {
      next(error);
    }
  };

  // ── Purchase Requests ──────────────────────────────────────────────────

  createPurchaseRequest = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.inventoryService.createPurchaseRequest({
        ...req.body,
        requestedById: req.user!.userId,
      });
      res.status(201).json({
        status: "success",
        statusCode: 201,
        message: "Purchase request created successfully",
        data: { purchaseRequest: result },
      });
    } catch (error) {
      next(error);
    }
  };

  listPurchaseRequests = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const branchId = this.isCrossBranchUser(req)
        ? undefined
        : req.user?.branchId;
      assertInventoryBranchAccess(req, [branchId]);
      const result = await this.inventoryService.listPurchaseRequests(
        branchId ?? undefined,
      );
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { purchaseRequests: result },
      });
    } catch (error) {
      next(error);
    }
  };

  getPurchaseRequest = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const request = await prisma.purchaseRequest.findUnique({
        where: { id },
        select: { requestedBy: { select: { branchId: true } } },
      });
      assertInventoryBranchAccess(req, [request?.requestedBy?.branchId]);
      const result = await this.inventoryService.getPurchaseRequest(id);
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { purchaseRequest: result },
      });
    } catch (error) {
      next(error);
    }
  };

  updatePurchaseRequestStatus = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const request = await prisma.purchaseRequest.findUnique({
        where: { id },
        select: { requestedBy: { select: { branchId: true } } },
      });
      assertInventoryBranchAccess(req, [request?.requestedBy?.branchId]);
      const result = await this.inventoryService.updatePurchaseRequestStatus(
        id,
        req.body,
      );
      res.status(200).json({
        status: "success",
        statusCode: 200,
        message: "Purchase request status updated successfully",
        data: { purchaseRequest: result },
      });
    } catch (error) {
      next(error);
    }
  };

  // ── Part Issuances ─────────────────────────────────────────────────────

  createPartIssuance = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      assertInventoryBranchAccess(req, [req.body.branchId]);
      const result = await this.inventoryService.createPartIssuance({
        ...req.body,
        issuedById: req.user!.userId,
      });
      res.status(201).json({
        status: "success",
        statusCode: 201,
        message: "Part issuance recorded successfully",
        data: { issuance: result },
      });
    } catch (error) {
      next(error);
    }
  };

  listPartIssuances = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const branchId = this.isCrossBranchUser(req)
        ? undefined
        : req.user?.branchId;
      assertInventoryBranchAccess(req, [branchId]);
      const result = await this.inventoryService.listPartIssuances(
        branchId ?? undefined,
      );
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { issuances: result },
      });
    } catch (error) {
      next(error);
    }
  };

  getPartIssuance = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const issuance = await prisma.partIssuance.findUnique({
        where: { id },
        select: { branchId: true },
      });
      assertInventoryBranchAccess(req, [issuance?.branchId]);
      const result = await this.inventoryService.getPartIssuance(id);
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { issuance: result },
      });
    } catch (error) {
      next(error);
    }
  };

  // ── Part Returns ───────────────────────────────────────────────────────

  createPartReturn = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const issuance = await prisma.partIssuance.findUnique({
        where: { id: req.body.partIssuanceId },
        select: { branchId: true },
      });
      assertInventoryBranchAccess(req, [issuance?.branchId]);
      const result = await this.inventoryService.createPartReturn({
        ...req.body,
        returnedById: req.user!.userId,
        branchId: issuance?.branchId,
      });
      res.status(201).json({
        status: "success",
        statusCode: 201,
        message: "Part return recorded successfully",
        data: { partReturn: result },
      });
    } catch (error) {
      next(error);
    }
  };

  listPartReturns = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const branchId = this.isCrossBranchUser(req)
        ? undefined
        : req.user?.branchId;
      assertInventoryBranchAccess(req, [branchId]);
      const result = await this.inventoryService.listPartReturns(
        branchId ?? undefined,
      );
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { returns: result },
      });
    } catch (error) {
      next(error);
    }
  };

  getPartReturn = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const partReturn = await prisma.partReturn.findUnique({
        where: { id },
        select: {
          partIssuance: {
            select: { branchId: true },
          },
        },
      });
      assertInventoryBranchAccess(req, [partReturn?.partIssuance?.branchId]);
      const result = await this.inventoryService.getPartReturn(id);
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { partReturn: result },
      });
    } catch (error) {
      next(error);
    }
  };

  // ── Inter-Branch Transfers ─────────────────────────────────────────────

  createTransfer = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      assertInventoryBranchAccess(req, [
        req.body.requestingBranchId,
        req.body.sourceBranchId,
      ]);
      const result = await this.inventoryService.createTransfer({
        ...req.body,
        requestedById: req.user!.userId,
      });
      res.status(201).json({
        status: "success",
        statusCode: 201,
        message: "Transfer created successfully",
        data: { transfer: result },
      });
    } catch (error) {
      next(error);
    }
  };

  getTransfer = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const transfer = await prisma.interBranchTransfer.findUnique({
        where: { id },
        select: { requestingBranchId: true, sourceBranchId: true },
      });
      assertInventoryBranchAccess(req, [
        transfer?.requestingBranchId,
        transfer?.sourceBranchId,
      ]);
      const result = await this.inventoryService.getTransfer(id);
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { transfer: result },
      });
    } catch (error) {
      next(error);
    }
  };

  listTransfers = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { status, requestingBranchId, sourceBranchId } = req.query as {
        status?: string;
        requestingBranchId?: string;
        sourceBranchId?: string;
      };
      const scopedRequestingBranchId = this.isCrossBranchUser(req)
        ? requestingBranchId
        : req.user?.branchId;
      const scopedSourceBranchId = this.isCrossBranchUser(req)
        ? sourceBranchId
        : req.user?.branchId;
      assertInventoryBranchAccess(req, [req.user?.branchId]);
      const result = await this.inventoryService.listTransfers({
        status,
        requestingBranchId: scopedRequestingBranchId ?? undefined,
        sourceBranchId: scopedSourceBranchId ?? undefined,
        branchId: this.isCrossBranchUser(req)
          ? undefined
          : (req.user?.branchId ?? undefined),
      });
      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: { transfers: result },
      });
    } catch (error) {
      next(error);
    }
  };

  approveTransfer = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const transfer = await prisma.interBranchTransfer.findUnique({
        where: { id },
        select: { requestingBranchId: true, sourceBranchId: true },
      });
      assertInventoryBranchAccess(req, [
        transfer?.requestingBranchId,
        transfer?.sourceBranchId,
      ]);
      const result = await this.inventoryService.approveTransfer(
        id,
        req.user!.userId,
      );
      res.status(200).json({
        status: "success",
        statusCode: 200,
        message: "Transfer approved successfully",
        data: { transfer: result },
      });
    } catch (error) {
      next(error);
    }
  };

  dispatchTransfer = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const transfer = await prisma.interBranchTransfer.findUnique({
        where: { id },
        select: { requestingBranchId: true, sourceBranchId: true },
      });
      assertInventoryBranchAccess(req, [
        transfer?.requestingBranchId,
        transfer?.sourceBranchId,
      ]);
      const result = await this.inventoryService.dispatchTransfer(
        id,
        req.user!.userId,
        req.body.items,
      );
      res.status(200).json({
        status: "success",
        statusCode: 200,
        message: "Transfer dispatched successfully",
        data: { transfer: result },
      });
    } catch (error) {
      next(error);
    }
  };

  receiveTransfer = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const transfer = await prisma.interBranchTransfer.findUnique({
        where: { id },
        select: { requestingBranchId: true },
      });
      assertInventoryBranchAccess(req, [transfer?.requestingBranchId]);
      const result = await this.inventoryService.receiveTransfer(
        id,
        req.user!.userId,
        req.body.items,
      );
      res.status(200).json({
        status: "success",
        statusCode: 200,
        message: "Transfer received successfully",
        data: { transfer: result },
      });
    } catch (error) {
      next(error);
    }
  };

  rejectTransfer = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const transfer = await prisma.interBranchTransfer.findUnique({
        where: { id },
        select: { requestingBranchId: true, sourceBranchId: true },
      });
      assertInventoryBranchAccess(req, [
        transfer?.requestingBranchId,
        transfer?.sourceBranchId,
      ]);
      const result = await this.inventoryService.rejectTransfer(
        id,
        req.user!.userId,
        req.body.notes,
      );
      res.status(200).json({
        status: "success",
        statusCode: 200,
        message: "Transfer rejected",
        data: { transfer: result },
      });
    } catch (error) {
      next(error);
    }
  };

  cancelTransfer = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const transfer = await prisma.interBranchTransfer.findUnique({
        where: { id },
        select: { requestingBranchId: true, sourceBranchId: true },
      });
      assertInventoryBranchAccess(req, [
        transfer?.requestingBranchId,
        transfer?.sourceBranchId,
      ]);
      const result = await this.inventoryService.cancelTransfer(id);
      res.status(200).json({
        status: "success",
        statusCode: 200,
        message: "Transfer cancelled",
        data: { transfer: result },
      });
    } catch (error) {
      next(error);
    }
  };
}

export default InventoryController;

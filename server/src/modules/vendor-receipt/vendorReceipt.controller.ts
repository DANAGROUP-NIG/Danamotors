import { Request, Response, NextFunction, RequestHandler } from "express";
import { assertInventoryBranchAccess } from "../../middleware/authorize";
import { PERMISSIONS, ROLES } from "../../shared/constants/roles";
import { VendorReceiptService } from "./vendorReceipt.service";

const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  async (req, res, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (error) {
      next(error);
    }
  };

const ok = (res: Response, data: unknown, message?: string, statusCode = 200) =>
  res.status(statusCode).json({ status: "success", statusCode, ...(message && { message }), data });

function scope(req: Request): string | undefined {
  const cross =
    req.user?.role === ROLES.SUPER_ADMIN || req.user?.permissions.includes(PERMISSIONS.INVENTORY_CROSS_BRANCH) === true;
  if (cross) return undefined;
  assertInventoryBranchAccess(req, [req.user?.branchId]);
  return req.user!.branchId ?? undefined;
}

export class VendorReceiptController {
  private service = new VendorReceiptService();

  searchVendors = handle(async (req, res) => {
    ok(res, { vendors: await this.service.searchVendors(req.query.search as string | undefined) });
  });

  searchParts = handle(async (req, res) => {
    const branchId = req.query.branchId as string;
    assertInventoryBranchAccess(req, [branchId]);
    ok(res, { parts: await this.service.searchParts(branchId, req.query.search as string) });
  });

  createReceipt = handle(async (req, res) => {
    assertInventoryBranchAccess(req, [req.body.receivingBranchId]);
    const receipt = await this.service.createReceipt(req.body, req.user!.userId);
    ok(res, { receipt }, `MRN ${receipt.mrnNumber} posted to stock`, 201);
  });

  listReceipts = handle(async (req, res) => {
    ok(res, { receipts: await this.service.listReceipts({ branchId: scope(req), search: req.query.search as string | undefined }) });
  });

  getReceipt = handle(async (req, res) => {
    const receipt = await this.service.getReceipt(req.params.id);
    assertInventoryBranchAccess(req, [receipt.receivingBranchId]);
    ok(res, { receipt });
  });
}

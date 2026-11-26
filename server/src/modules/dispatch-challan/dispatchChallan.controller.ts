import { Request, Response, NextFunction, RequestHandler } from "express";
import { assertInventoryBranchAccess } from "../../middleware/authorize";
import { PERMISSIONS, ROLES } from "../../shared/constants/roles";
import { DispatchChallanService, type ListChallansInput } from "./dispatchChallan.service";
import { PartSaleService } from "../part-sale/partSale.service";

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

/** Branch filter for lists: the one asked for (if allowed), else all branches for cross-branch users, else the user's own. */
function scope(req: Request): string | undefined {
  const asked = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
  const cross =
    req.user?.role === ROLES.SUPER_ADMIN || req.user?.permissions.includes(PERMISSIONS.INVENTORY_CROSS_BRANCH) === true;
  if (asked) {
    assertInventoryBranchAccess(req, [asked]);
    return asked;
  }
  if (cross) return undefined;
  assertInventoryBranchAccess(req, [req.user?.branchId]);
  return req.user!.branchId ?? undefined;
}

const listInput = (req: Request): ListChallansInput => ({
  branchId: scope(req),
  customerId: req.query.customerId as string | undefined,
  search: req.query.search as string | undefined,
  from: req.query.from as string | undefined,
  to: req.query.to as string | undefined,
});

export class DispatchChallanController {
  private service = new DispatchChallanService();
  private sales = new PartSaleService();

  /** Cost centres are parties: the same search as the counter sale's customer. */
  searchCostCentres = handle(async (req, res) => {
    ok(res, { customers: await this.sales.searchCustomers(String(req.query.search)) });
  });

  /** Parts with free stock at the issuing branch and their retail rate. */
  searchParts = handle(async (req, res) => {
    const branchId = String(req.query.branchId);
    assertInventoryBranchAccess(req, [branchId]);
    ok(res, { parts: await this.sales.searchParts(String(req.query.search), branchId) });
  });

  list = handle(async (req, res) => {
    ok(res, { challans: await this.service.listChallans(listInput(req)) });
  });

  listReturns = handle(async (req, res) => {
    ok(res, { returns: await this.service.listReturns(listInput(req)) });
  });

  get = handle(async (req, res) => {
    const challan = await this.service.getChallan(req.params.id);
    assertInventoryBranchAccess(req, [challan.branchId]);
    ok(res, { challan });
  });

  create = handle(async (req, res) => {
    assertInventoryBranchAccess(req, [req.body.branchId]);
    const challan = await this.service.createChallan(req.body, req.user!.userId);
    ok(res, { challan }, `Challan ${challan.challanNumber} issued`, 201);
  });

  createReturn = handle(async (req, res) => {
    assertInventoryBranchAccess(req, [await this.service.branchOf(req.params.id)]);
    const challan = await this.service.createReturn(req.params.id, req.body, req.user!.userId);
    ok(res, { challan }, "Challan return recorded", 201);
  });
}

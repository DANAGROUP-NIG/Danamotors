import { Request, Response, NextFunction, RequestHandler } from "express";
import { assertInventoryBranchAccess } from "../../middleware/authorize";
import { PERMISSIONS, ROLES } from "../../shared/constants/roles";
import { MobisPurchaseService } from "./mobisPurchase.service";

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

export class MobisPurchaseController {
  private service = new MobisPurchaseService();

  matchParts = handle(async (req, res) => {
    ok(res, { matches: await this.service.matchParts(req.body.partNumbers) });
  });

  importMit = handle(async (req, res) => {
    assertInventoryBranchAccess(req, [req.body.destinationBranchId]);
    const mit = await this.service.importMit(req.body, req.user!.userId);
    ok(res, { mit }, `MIT ${mit.mitNumber} created from Mobis invoice ${mit.invoiceNumber}`, 201);
  });

  listMits = handle(async (req, res) => {
    const q = req.query as { status?: never; search?: string };
    ok(res, { mits: await this.service.listMobisMits({ status: q.status, search: q.search, branchId: scope(req) }) });
  });

  getMit = handle(async (req, res) => {
    const mit = await this.service.getMobisMit(req.params.id);
    assertInventoryBranchAccess(req, [mit.destinationBranchId]);
    ok(res, { mit });
  });

  createMrn = handle(async (req, res) => {
    const current = await this.service.getMobisMit(req.params.id);
    assertInventoryBranchAccess(req, [current.destinationBranchId]);
    const mit = await this.service.createMrn(req.params.id, req.user!.userId, req.body);
    ok(res, { mit }, `MRN ${mit.mrn?.mrnNumber} posted to stock`, 201);
  });

  cancelMit = handle(async (req, res) => {
    const current = await this.service.getMobisMit(req.params.id);
    assertInventoryBranchAccess(req, [current.destinationBranchId]);
    ok(res, { mit: await this.service.cancelMit(req.params.id, req.user!.userId, req.body?.reason) }, "MIT cancelled");
  });

  listMrns = handle(async (req, res) => {
    ok(res, { mrns: await this.service.listMrns(scope(req)) });
  });

  getMrn = handle(async (req, res) => {
    const mrn = await this.service.getMrn(req.params.id);
    assertInventoryBranchAccess(req, [mrn.receivingBranchId]);
    ok(res, { mrn });
  });
}

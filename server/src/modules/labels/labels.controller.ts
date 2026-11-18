import { NextFunction, Request, RequestHandler, Response } from "express";
import { assertInventoryBranchAccess } from "../../middleware/authorize";
import { BadRequestError } from "../../shared/errors/appError";
import { PERMISSIONS, ROLES } from "../../shared/constants/roles";
import { LabelService } from "./labels.service";

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

const crossBranch = (req: Request) => req.user?.role === ROLES.SUPER_ADMIN || (req.user?.permissions ?? []).includes(PERMISSIONS.INVENTORY_CROSS_BRANCH);

/** The branch whose labels and printer are used: the user's own, or the one chosen by a cross-branch user. */
function branchOf(req: Request, branchId?: string): string {
  if (crossBranch(req)) {
    const id = branchId || req.user?.branchId;
    if (!id) throw new BadRequestError("Choose a branch");
    return id;
  }
  assertInventoryBranchAccess(req, [req.user?.branchId]);
  return req.user!.branchId!;
}

export class LabelController {
  private service = new LabelService();

  searchParts = handle(async (req, res) => {
    const q = req.query as { search: string; branchId?: string };
    ok(res, { parts: await this.service.searchParts(q.search, branchOf(req, q.branchId)) });
  });

  printers = handle(async (req, res) => {
    ok(res, { printers: await this.service.printers(branchOf(req, req.query.branchId as string | undefined)) });
  });

  list = handle(async (req, res) => {
    ok(res, { jobs: await this.service.list(branchOf(req, req.query.branchId as string | undefined)) });
  });

  create = handle(async (req, res) => {
    const body = req.body as { branchId?: string; labels: { partId: string; copies: number }[] };
    const result = await this.service.create({ branchId: branchOf(req, body.branchId), labels: body.labels }, req.user!.userId);
    ok(res, result, "Labels sent to the printer", 201);
  });

  retry = handle(async (req, res) => {
    assertInventoryBranchAccess(req, [await this.service.branchOf(req.params.id)]);
    ok(res, { job: await this.service.retry(req.params.id) });
  });

  cancel = handle(async (req, res) => {
    assertInventoryBranchAccess(req, [await this.service.branchOf(req.params.id)]);
    ok(res, { job: await this.service.cancel(req.params.id) });
  });
}

import { NextFunction, Request, RequestHandler, Response } from "express";
import prisma from "../../prisma/client";
import { assertBranchOwnership } from "../../middleware/authorize";
import { NotFoundError } from "../../shared/errors/appError";
import { PERMISSIONS, ROLES } from "../../shared/constants/roles";
import { JobCardLineService } from "./jobCardLine.service";

type Handler = (req: Request, res: Response) => Promise<unknown>;

const handle =
  (fn: Handler): RequestHandler =>
  async (req, res, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (error) {
      next(error);
    }
  };

const ok = (res: Response, data: unknown, message?: string, statusCode = 200) =>
  res.status(statusCode).json({ status: "success", statusCode, ...(message && { message }), data });

async function assertJobCardBranch(req: Request, jobCardId: string) {
  const card = await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: { branchId: true } });
  if (!card) throw new NotFoundError("Job card not found");
  assertBranchOwnership(req, card.branchId);
}

function actor(req: Request) {
  const canChargeGoodwill = req.user!.role === ROLES.SUPER_ADMIN || req.user!.permissions.includes(PERMISSIONS.WARRANTY_UPDATE);
  return { userId: req.user!.userId, canChargeGoodwill };
}

export class JobCardLineController {
  private service = new JobCardLineService();

  list = handle(async (req, res) => {
    await assertJobCardBranch(req, req.params.id);
    ok(res, await this.service.list(req.params.id));
  });

  update = handle(async (req, res) => {
    await assertJobCardBranch(req, req.params.id);
    ok(res, { line: await this.service.updateLine(req.params.id, req.params.lineId, req.body, actor(req)) }, "Line updated");
  });
}

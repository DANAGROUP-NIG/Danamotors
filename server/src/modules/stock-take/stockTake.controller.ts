import { Request, Response, NextFunction, RequestHandler } from "express";
import { StockTakeStatus, StockTakeType } from "@prisma/client";
import { assertInventoryBranchAccess } from "../../middleware/authorize";
import { ForbiddenError } from "../../shared/errors/appError";
import { PERMISSIONS, ROLES } from "../../shared/constants/roles";
import { Kind, kindOf } from "./stockTake.logic";
import { LineFilters, StockTakeService } from "./stockTake.service";

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

/** Branch filter for lists: none for cross-branch users, otherwise the user's own branch. */
function scope(req: Request): string | undefined {
  const cross =
    req.user?.role === ROLES.SUPER_ADMIN || req.user?.permissions.includes(PERMISSIONS.INVENTORY_CROSS_BRANCH) === true;
  if (cross) return undefined;
  assertInventoryBranchAccess(req, [req.user?.branchId]);
  return req.user!.branchId ?? undefined;
}

const KIND_PERMISSIONS = {
  COUNT: { read: PERMISSIONS.STOCK_TAKE_READ, manage: PERMISSIONS.STOCK_TAKE_MANAGE, name: "physical stock taking" },
  AUDIT: { read: PERMISSIONS.STOCK_AUDIT_READ, manage: PERMISSIONS.STOCK_AUDIT_MANAGE, name: "stock audits" },
} as const;

/** Physical counts need stocktake:*, stock audits stockaudit:*. */
function allow(req: Request, kind: Kind, level: "read" | "manage") {
  if (req.user?.role === ROLES.SUPER_ADMIN) return;
  const p = KIND_PERMISSIONS[kind];
  if (!req.user?.permissions.includes(p[level])) {
    throw new ForbiddenError(`You do not have permission to ${level === "read" ? "view" : "manage"} ${p.name}`);
  }
}

export class StockTakeController {
  private service = new StockTakeService();

  searchParts = handle(async (req, res) => {
    const branchId = String(req.query.branchId);
    assertInventoryBranchAccess(req, [branchId]);
    ok(res, { parts: await this.service.searchParts(String(req.query.search), branchId) });
  });

  listCheckers = handle(async (req, res) => {
    const branchId = String(req.query.branchId);
    assertInventoryBranchAccess(req, [branchId]);
    ok(res, { checkers: await this.service.listCheckers(branchId) });
  });

  previewParts = handle(async (req, res) => {
    const kind: Kind = req.body.kind ?? "COUNT";
    allow(req, kind, "manage");
    assertInventoryBranchAccess(req, [req.body.branchId]);
    ok(res, { parts: await this.service.previewParts(req.body.branchId, req.body.selection, kind) });
  });

  // ── Batches ──

  createStockTake = handle(async (req, res) => {
    const kind = kindOf(req.body.type);
    allow(req, kind, "manage");
    assertInventoryBranchAccess(req, [req.body.branchId]);
    const { stockTake, skipped } = await this.service.createStockTake(req.body, req.user!.userId);
    const note = skipped ? ` (${skipped} part(s) already in another open count were left out)` : "";
    const what = kind === "AUDIT" ? "Stock audit" : "Stock taking";
    ok(res, { stockTake, skipped }, `${what} ${stockTake.batchNumber} created with ${stockTake.summary.lines} part(s)${note}`, 201);
  });

  listStockTakes = handle(async (req, res) => {
    const q = req.query as { kind?: Kind; status?: StockTakeStatus; type?: StockTakeType; search?: string };
    allow(req, q.kind ?? "COUNT", "read");
    ok(res, { stockTakes: await this.service.listStockTakes({ branchId: scope(req), ...q }) });
  });

  getStockTake = handle(async (req, res) => {
    await this.access(req, "read");
    ok(res, { stockTake: await this.service.getStockTake(req.params.id) });
  });

  listLines = handle(async (req, res) => {
    await this.access(req, "read");
    ok(res, await this.service.listLines(req.params.id, req.query as LineFilters));
  });

  listMovements = handle(async (req, res) => {
    await this.access(req, "read");
    ok(res, { movements: await this.service.listMovements(req.params.id) });
  });

  cancelStockTake = handle(async (req, res) => {
    await this.access(req);
    ok(res, { stockTake: await this.service.cancelStockTake(req.params.id, req.body.remark, req.user!.userId) }, "Stock taking cancelled");
  });

  // ── Count sheets ──

  createSheet = handle(async (req, res) => {
    await this.access(req);
    const sheet = await this.service.createSheet(req.params.id, req.body, req.user!.userId);
    ok(res, { sheet }, `Count sheet ${sheet.sheetNumber} issued with ${sheet.lineCount} part(s)`, 201);
  });

  getSheet = handle(async (req, res) => {
    await this.access(req, "read");
    ok(res, { sheet: await this.service.getSheet(req.params.id, req.params.sheetId) });
  });

  uploadSheet = handle(async (req, res) => {
    await this.access(req);
    ok(res, { stockTake: await this.service.uploadSheet(req.params.id, req.params.sheetId, req.body, req.user!.userId) }, "Counts uploaded");
  });

  cancelSheet = handle(async (req, res) => {
    await this.access(req);
    ok(res, { stockTake: await this.service.cancelSheet(req.params.id, req.params.sheetId, req.body.remark) }, "Count sheet cancelled");
  });

  // ── Counts ──

  recordCounts = handle(async (req, res) => {
    await this.access(req);
    ok(res, { stockTake: await this.service.recordCounts(req.params.id, req.body.entries, req.user!.userId) }, "Count recorded", 201);
  });

  correctLine = handle(async (req, res) => {
    await this.access(req);
    ok(res, { stockTake: await this.service.correctLine(req.params.id, req.params.lineId, req.body, req.user!.userId) }, "Count corrected");
  });

  setNotRequired = handle(async (req, res) => {
    await this.access(req);
    ok(res, { stockTake: await this.service.setNotRequired(req.params.id, req.params.lineId, req.body.notRequired) });
  });

  // ── Complete, confirm, bins ──

  completeStockTake = handle(async (req, res) => {
    await this.access(req);
    ok(res, { stockTake: await this.service.completeStockTake(req.params.id, req.body, req.user!.userId) }, "Stock taking completed");
  });

  confirmStockTake = handle(async (req, res) => {
    await this.access(req);
    ok(res, { stockTake: await this.service.confirmStockTake(req.params.id, req.user!.userId) }, "Shortage and excess confirmed; stock adjusted");
  });

  binProposals = handle(async (req, res) => {
    await this.access(req, "read");
    ok(res, { bins: await this.service.binProposals(req.params.id) });
  });

  updateBins = handle(async (req, res) => {
    await this.access(req);
    const result = await this.service.updateBins(req.params.id, req.body.lines, req.user!.userId);
    ok(res, result, `${result.updated} bin location(s) updated`);
  });

  /** The user's branch and permission for this count's kind (manage unless said otherwise). */
  private async access(req: Request, level: "read" | "manage" = "manage") {
    const take = await this.service.accessOf(req.params.id);
    allow(req, kindOf(take.type), level);
    assertInventoryBranchAccess(req, [take.branchId]);
  }
}

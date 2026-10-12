import { Request, Response, NextFunction, RequestHandler } from "express";
import { assertInventoryBranchAccess } from "../../middleware/authorize";
import { ForbiddenError } from "../../shared/errors/appError";
import { PERMISSIONS, ROLES } from "../../shared/constants/roles";
import { PendingLineFilters, StockTransferService } from "./stockTransfer.service";

type Handler = (req: Request, res: Response) => Promise<unknown>;

/** Wraps a handler so thrown errors reach the global error handler. */
const handle =
  (fn: Handler): RequestHandler =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (error) {
      next(error);
    }
  };

const ok = (res: Response, data: unknown, message?: string, statusCode = 200) =>
  res.status(statusCode).json({ status: "success", statusCode, ...(message && { message }), data });

function isCrossBranch(req: Request): boolean {
  return (
    req.user?.role === ROLES.SUPER_ADMIN ||
    req.user?.permissions.includes(PERMISSIONS.INVENTORY_CROSS_BRANCH) === true
  );
}

/** Branch filter for list endpoints: cross-branch users see everything. */
function listScope(req: Request): string | undefined {
  if (isCrossBranch(req)) return undefined;
  assertInventoryBranchAccess(req, [req.user?.branchId]);
  return req.user!.branchId ?? undefined;
}

/** Passes when the user may act for either of the two branches. */
function assertEitherBranch(req: Request, a?: string | null, b?: string | null) {
  if (isCrossBranch(req)) return;
  const branchId = req.user?.branchId;
  if (!branchId || (branchId !== a && branchId !== b)) {
    throw new ForbiddenError("You can only access transfers that involve your own branch");
  }
}

export class StockTransferController {
  private service = new StockTransferService();

  // ── Indents ────────────────────────────────────────────────────────────────

  lookupPart = handle(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const result = await this.service.lookupPart({
      partId: q.partId,
      partNumber: q.partNumber,
      requestingBranchId: q.requestingBranchId,
      sourceBranchId: q.sourceBranchId,
    });
    ok(res, result);
  });

  searchParts = handle(async (req, res) => {
    const q = req.query as unknown as { search: string; requestingBranchId?: string; sourceBranchId?: string; limit?: number };
    ok(res, { parts: await this.service.searchParts(q) });
  });

  createIndent = handle(async (req, res) => {
    assertInventoryBranchAccess(req, [req.body.requestingBranchId]);
    const indent = await this.service.createIndent(req.body, req.user!.userId);
    const message = indent.status === "DRAFT" ? "Indent saved as draft" : "Indent submitted";
    ok(res, { indent }, message, 201);
  });

  listIndents = handle(async (req, res) => {
    const q = req.query as Record<string, string | number | undefined>;
    const result = await this.service.listIndents({
      status: q.status as never,
      requestingBranchId: q.requestingBranchId as string | undefined,
      sourceBranchId: q.sourceBranchId as string | undefined,
      search: q.search as string | undefined,
      page: q.page as number | undefined,
      limit: q.limit as number | undefined,
      scopeBranchId: listScope(req),
    });
    ok(res, result);
  });

  getIndent = handle(async (req, res) => {
    const branches = await this.service.getIndentBranches(req.params.id);
    assertEitherBranch(req, branches.requestingBranchId, branches.sourceBranchId);
    ok(res, { indent: await this.service.getIndent(req.params.id) });
  });

  submitIndent = handle(async (req, res) => {
    const branches = await this.service.getIndentBranches(req.params.id);
    assertInventoryBranchAccess(req, [branches.requestingBranchId]);
    ok(res, { indent: await this.service.submitIndent(req.params.id, req.user!.userId) }, "Indent submitted");
  });

  approveIndent = handle(async (req, res) => {
    const branches = await this.service.getIndentBranches(req.params.id);
    assertInventoryBranchAccess(req, [branches.sourceBranchId]);
    const indent = await this.service.approveIndent(req.params.id, req.user!.userId, req.body);
    ok(res, { indent }, "Indent approved and picked");
  });

  pickIndent = handle(async (req, res) => {
    const branches = await this.service.getIndentBranches(req.params.id);
    assertInventoryBranchAccess(req, [branches.sourceBranchId]);
    const indent = await this.service.pickIndent(req.params.id, req.user!.userId, req.body);
    ok(res, { indent }, "Picking list created");
  });

  rejectIndent = handle(async (req, res) => {
    const branches = await this.service.getIndentBranches(req.params.id);
    assertInventoryBranchAccess(req, [branches.sourceBranchId]);
    const indent = await this.service.rejectIndent(req.params.id, req.user!.userId, req.body.reason);
    ok(res, { indent }, "Indent rejected");
  });

  cancelIndent = handle(async (req, res) => {
    const branches = await this.service.getIndentBranches(req.params.id);
    assertEitherBranch(req, branches.requestingBranchId, branches.sourceBranchId);
    const indent = await this.service.cancelIndent(req.params.id, req.user!.userId, req.body?.reason);
    ok(res, { indent }, "Indent cancelled");
  });

  /** Legacy Branch Indent From / To Other Branch Cancellation: what is still to supply. */
  listPendingLines = handle(async (req, res) => {
    const q = req.query as unknown as PendingLineFilters;
    assertInventoryBranchAccess(req, [q.branchId]);
    ok(res, { orders: await this.service.listPendingLines(q) });
  });

  cancelPendingLines = handle(async (req, res) => {
    for (const indent of await this.service.getLineIndents(req.body.lineIds)) {
      assertEitherBranch(req, indent.requestingBranchId, indent.sourceBranchId);
    }
    const result = await this.service.cancelPendingLines(req.body.lineIds, req.user!.userId, req.body.reason);
    ok(res, result, `${result.units} unit(s) cancelled on ${result.indents.length} indent(s)`);
  });

  dispatchIndent = handle(async (req, res) => {
    const branches = await this.service.getIndentBranches(req.params.id);
    assertInventoryBranchAccess(req, [branches.sourceBranchId]);
    const indent = await this.service.dispatchIndent(req.params.id, req.user!.userId, req.body);
    ok(res, { indent }, "Dispatched: STN, cases and packing list cum gate pass created");
  });

  closeIndent = handle(async (req, res) => {
    const branches = await this.service.getIndentBranches(req.params.id);
    assertInventoryBranchAccess(req, [branches.sourceBranchId]);
    const indent = await this.service.closeBackOrder(req.params.id, req.user!.userId, req.body.reason);
    ok(res, { indent }, "Back order closed");
  });

  dispatchStn = handle(async (req, res) => {
    const branches = await this.service.getDispatchBranches(req.body.indentIds);
    assertInventoryBranchAccess(req, [branches.sourceBranchId]);
    const stn = await this.service.dispatchIndents(req.body, req.user!.userId);
    ok(res, { stn }, `STN ${stn.stnNumber} dispatched`, 201);
  });

  createDirectStn = handle(async (req, res) => {
    assertInventoryBranchAccess(req, [req.body.sourceBranchId]);
    const stn = await this.service.createDirectStn(req.body, req.user!.userId);
    ok(res, { stn }, `Direct STN ${stn.stnNumber} dispatched`, 201);
  });

  receiveStn = handle(async (req, res) => {
    const branches = await this.service.getStnBranches(req.params.id);
    assertInventoryBranchAccess(req, [branches.destinationBranchId]);
    const stn = await this.service.receiveStn(req.params.id, req.user!.userId, req.body);
    ok(res, { stn }, "Receipt posted: MRN generated and stock updated", 201);
  });

  receiveIndent = handle(async (req, res) => {
    const branches = await this.service.getIndentBranches(req.params.id);
    assertInventoryBranchAccess(req, [branches.requestingBranchId]);
    const indent = await this.service.receiveIndent(req.params.id, req.user!.userId, req.body);
    ok(res, { indent }, "Receipt posted: MRN generated and stock updated");
  });

  // ── Documents (read-only; they are produced by the indent actions) ────────

  listPickingLists = handle(async (req, res) => {
    const docs = await this.service.listPickingLists(listScope(req), (req.query as { status?: never }).status);
    ok(res, { pickingLists: docs });
  });

  getPickingList = handle(async (req, res) => {
    const doc = await this.service.getPickingList(req.params.id);
    assertEitherBranch(req, doc.indent.requestingBranchId, doc.indent.sourceBranchId);
    ok(res, { pickingList: doc });
  });

  listStns = handle(async (req, res) => {
    const docs = await this.service.listStns(listScope(req), (req.query as { status?: never }).status);
    ok(res, { stns: docs });
  });

  getStn = handle(async (req, res) => {
    const doc = await this.service.getStn(req.params.id);
    assertEitherBranch(req, doc.sourceBranchId, doc.destinationBranchId);
    ok(res, { stn: doc });
  });

  getCase = handle(async (req, res) => {
    const doc = await this.service.getCase(req.params.id);
    assertEitherBranch(req, doc.stn.sourceBranchId, doc.stn.destinationBranchId);
    ok(res, { case: doc });
  });

  getPackingList = handle(async (req, res) => {
    const doc = await this.service.getPackingList(req.params.id);
    assertEitherBranch(req, doc.stn.sourceBranchId, doc.stn.destinationBranchId);
    ok(res, { packingList: doc });
  });

  listTransferMrns = handle(async (req, res) => {
    ok(res, { mrns: await this.service.listTransferMrns(listScope(req)) });
  });

  getTransferMrn = handle(async (req, res) => {
    const doc = await this.service.getTransferMrn(req.params.id);
    assertEitherBranch(req, doc.receivingBranchId, doc.sourceBranchId);
    ok(res, { mrn: doc });
  });
}

export default StockTransferController;

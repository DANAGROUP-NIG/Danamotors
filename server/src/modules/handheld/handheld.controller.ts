import { Request, Response, NextFunction, RequestHandler } from "express";
import { HandheldDocumentStatus, HandheldDocumentType } from "@prisma/client";
import { assertInventoryBranchAccess } from "../../middleware/authorize";
import { ForbiddenError } from "../../shared/errors/appError";
import { PERMISSIONS, ROLES } from "../../shared/constants/roles";
import { HandheldService } from "./handheld.service";

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

// Each document type uses the permissions of the web screen it stands in for (user decision 2026-10-27):
// indent picking -> transfers, CPO picking -> part sale, MIT receiving -> stock.
const TYPE_PERMISSIONS: Record<HandheldDocumentType, { read: string; write: string }> = {
  INDENT_PICK: { read: PERMISSIONS.TRANSFER_READ, write: PERMISSIONS.TRANSFER_DISPATCH },
  CPO_PICK: { read: PERMISSIONS.PART_SALE_READ, write: PERMISSIONS.PART_SALE_ORDER },
  MIT_RECEIVE: { read: PERMISSIONS.STOCK_READ, write: PERMISSIONS.STOCK_UPDATE },
};

const ALL_TYPES = Object.keys(TYPE_PERMISSIONS) as HandheldDocumentType[];

function can(req: Request, type: HandheldDocumentType, access: "read" | "write"): boolean {
  if (req.user?.role === ROLES.SUPER_ADMIN) return true;
  const perms = req.user?.permissions ?? [];
  // Write implies read, as on the web screens.
  return perms.includes(TYPE_PERMISSIONS[type][access]) || (access === "read" && perms.includes(TYPE_PERMISSIONS[type].write));
}

function assertCan(req: Request, type: HandheldDocumentType, access: "read" | "write") {
  if (!can(req, type, access)) throw new ForbiddenError("You do not have the required permissions to access this resource");
}

/** Branch filter for lists: none for cross-branch users, otherwise the user's own branch. */
function scope(req: Request, branchId?: string): string | undefined {
  const cross =
    req.user?.role === ROLES.SUPER_ADMIN || req.user?.permissions.includes(PERMISSIONS.INVENTORY_CROSS_BRANCH) === true;
  if (cross) return branchId;
  assertInventoryBranchAccess(req, [req.user?.branchId]);
  return req.user!.branchId ?? undefined;
}

export class HandheldController {
  private service = new HandheldService();

  listSources = handle(async (req, res) => {
    const q = req.query as { type: HandheldDocumentType; branchId?: string };
    assertCan(req, q.type, "write");
    ok(res, { sources: await this.service.listSources(q.type, scope(req, q.branchId)) });
  });

  listPickers = handle(async (req, res) => {
    if (!ALL_TYPES.some((t) => can(req, t, "write"))) throw new ForbiddenError("You do not have the required permissions to access this resource");
    ok(res, { pickers: await this.service.listPickers(scope(req, req.query.branchId as string | undefined)) });
  });

  listDocuments = handle(async (req, res) => {
    const q = req.query as { type?: HandheldDocumentType; status?: HandheldDocumentStatus; branchId?: string; sourceId?: string; indentId?: string };
    const types = (q.type ? [q.type] : ALL_TYPES).filter((t) => can(req, t, "read"));
    if (!types.length) throw new ForbiddenError("You do not have the required permissions to access this resource");
    ok(res, { documents: await this.service.listDocuments({ types, status: q.status, branchId: scope(req, q.branchId), sourceId: q.sourceId, indentId: q.indentId }) });
  });

  getDocument = handle(async (req, res) => {
    const document = await this.service.getDocument(req.params.id);
    assertCan(req, document.type, "read");
    assertInventoryBranchAccess(req, [document.branchId]);
    ok(res, { document });
  });

  createDocument = handle(async (req, res) => {
    assertCan(req, req.body.type, "write");
    assertInventoryBranchAccess(req, [await this.service.sourceBranchId(req.body.type, req.body.sourceId)]);
    const document = await this.service.createDocument(req.body, req.user!.userId);
    ok(res, { document }, `Handheld document ${document.documentNumber} ready for ${document.pickerName}`, 201);
  });

  upload = handle(async (req, res) => {
    const existing = await this.service.getDocument(req.params.id);
    assertCan(req, existing.type, "write");
    assertInventoryBranchAccess(req, [existing.branchId]);
    const result = await this.service.upload(req.params.id, req.body, req.user!.userId);
    ok(res, result, `Handheld document ${existing.documentNumber} uploaded`);
  });

  cancel = handle(async (req, res) => {
    const existing = await this.service.getDocument(req.params.id);
    assertCan(req, existing.type, "write");
    assertInventoryBranchAccess(req, [existing.branchId]);
    const document = await this.service.cancel(req.params.id, req.body.remark, req.user!.userId);
    ok(res, { document }, `Handheld document ${document.documentNumber} cancelled`);
  });
}

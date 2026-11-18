import { Request, Response, NextFunction, RequestHandler } from "express";
import { HandheldDocumentStatus, HandheldDocumentType, StockTakeType } from "@prisma/client";
import { assertInventoryBranchAccess } from "../../middleware/authorize";
import { ForbiddenError } from "../../shared/errors/appError";
import { PERMISSIONS, ROLES } from "../../shared/constants/roles";
import { permissionsOf } from "./handheld.logic";
import { HandheldService } from "./handheld.service";
import { AuthedStation, HandheldStationService } from "./handheld.station.service";
import { LabelService } from "../labels/labels.service";

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

const ALL_TYPES = Object.values(HandheldDocumentType);

function has(req: Request, permission: string) {
  return req.user?.role === ROLES.SUPER_ADMIN || (req.user?.permissions ?? []).includes(permission);
}

// A count sheet of a stock audit uses stockaudit:*; any sheet is listed for either kind's readers.
function can(req: Request, type: HandheldDocumentType, access: "read" | "write", audit?: boolean): boolean {
  const kinds = type === HandheldDocumentType.COUNT_SHEET && audit === undefined ? [false, true] : [!!audit];
  return kinds.some((a) => {
    const p = permissionsOf(type, a);
    // Write implies read, as on the web screens.
    return has(req, p[access]) || (access === "read" && has(req, p.write));
  });
}

function assertCan(req: Request, type: HandheldDocumentType, access: "read" | "write", audit?: boolean) {
  if (!can(req, type, access, audit)) throw new ForbiddenError("You do not have the required permissions to access this resource");
}

const isAudit = (doc: { stockTakeSheet?: { stockTake: { type: StockTakeType } } | null }) => doc.stockTakeSheet?.stockTake.type === StockTakeType.AUDIT;

/** Branch filter for lists: none for cross-branch users, otherwise the user's own branch. */
function scope(req: Request, branchId?: string): string | undefined {
  if (has(req, PERMISSIONS.INVENTORY_CROSS_BRANCH)) return branchId;
  assertInventoryBranchAccess(req, [req.user?.branchId]);
  return req.user!.branchId ?? undefined;
}

export class HandheldController {
  private service = new HandheldService();
  private stations = new HandheldStationService();

  listSources = handle(async (req, res) => {
    const q = req.query as { type: HandheldDocumentType; branchId?: string };
    assertCan(req, q.type, "write");
    const sources = await this.service.listSources(q.type, scope(req, q.branchId));
    // Count sheets of both kinds come back together: keep those of the kind the user may send.
    ok(res, { sources: sources.filter((s) => !("audit" in s) || can(req, q.type, "write", !!s.audit)) });
  });

  listPickers = handle(async (req, res) => {
    if (!ALL_TYPES.some((t) => can(req, t, "write"))) throw new ForbiddenError("You do not have the required permissions to access this resource");
    ok(res, { pickers: await this.service.listPickers(scope(req, req.query.branchId as string | undefined)) });
  });

  listDocuments = handle(async (req, res) => {
    const q = req.query as { type?: HandheldDocumentType; status?: HandheldDocumentStatus; branchId?: string; sourceId?: string; indentId?: string; stockTakeId?: string };
    const types = (q.type ? [q.type] : ALL_TYPES).filter((t) => can(req, t, "read"));
    if (!types.length) throw new ForbiddenError("You do not have the required permissions to access this resource");
    const documents = await this.service.listDocuments({ types, status: q.status, branchId: scope(req, q.branchId), sourceId: q.sourceId, indentId: q.indentId, stockTakeId: q.stockTakeId });
    ok(res, { documents: documents.filter((d) => can(req, d.type, "read", isAudit(d))) });
  });

  getDocument = handle(async (req, res) => {
    const document = await this.service.getDocument(req.params.id);
    assertCan(req, document.type, "read", isAudit(document));
    assertInventoryBranchAccess(req, [document.branchId]);
    ok(res, { document });
  });

  createDocument = handle(async (req, res) => {
    const source = await this.service.sourceInfo(req.body.type, req.body.sourceId);
    assertCan(req, req.body.type, "write", source.audit);
    assertInventoryBranchAccess(req, [source.branchId]);
    const document = await this.service.createDocument(req.body, req.user!.userId);
    const message =
      document.status === HandheldDocumentStatus.QUEUED
        ? `Job ${document.documentNumber} is waiting for the next handheld docked at ${document.branch.name}`
        : `Handheld document ${document.documentNumber} ready for ${document.pickerName}`;
    ok(res, { document }, message, 201);
  });

  post = handle(async (req, res) => {
    const existing = await this.service.getDocument(req.params.id);
    assertCan(req, existing.type, "write", isAudit(existing));
    assertInventoryBranchAccess(req, [existing.branchId]);
    const result = await this.service.post(req.params.id, req.body, req.user!.userId);
    ok(res, result, `Handheld result ${existing.documentNumber} posted`);
  });

  upload = handle(async (req, res) => {
    const existing = await this.service.getDocument(req.params.id);
    assertCan(req, existing.type, "write", isAudit(existing));
    assertInventoryBranchAccess(req, [existing.branchId]);
    const result = await this.service.upload(req.params.id, req.body, req.user!.userId);
    ok(res, result, `Handheld document ${existing.documentNumber} uploaded`);
  });

  cancel = handle(async (req, res) => {
    const existing = await this.service.getDocument(req.params.id);
    assertCan(req, existing.type, "write", isAudit(existing));
    assertInventoryBranchAccess(req, [existing.branchId]);
    const document = await this.service.cancel(req.params.id, req.body.remark, req.user!.userId);
    ok(res, { document }, `Handheld job ${document.documentNumber} cancelled`);
  });

  // ── Stations (web) ──

  stationState = handle(async (req, res) => {
    if (!ALL_TYPES.some((t) => can(req, t, "read"))) throw new ForbiddenError("You do not have the required permissions to access this resource");
    const branchId = scope(req, req.query.branchId as string | undefined) ?? req.user!.branchId;
    if (!branchId) throw new ForbiddenError("Choose a branch");
    ok(res, await this.service.stationState(branchId));
  });

  overview = handle(async (req, res) => {
    if (!has(req, PERMISSIONS.HANDHELD_STATIONS) && !ALL_TYPES.some((t) => can(req, t, "read"))) {
      throw new ForbiddenError("You do not have the required permissions to access this resource");
    }
    ok(res, { ...(await this.stations.overview(scope(req, req.query.branchId as string | undefined))), canManage: has(req, PERMISSIONS.HANDHELD_STATIONS) });
  });

  createStation = handle(async (req, res) => {
    assertInventoryBranchAccess(req, [req.body.branchId]);
    const { station, key } = await this.stations.createStation(req.body, req.user!.userId);
    ok(res, { station, key }, `Station ${station.name} registered. Enter the key in HHDC Link on that PC now: it is shown only once.`, 201);
  });

  rotateKey = handle(async (req, res) => {
    assertInventoryBranchAccess(req, [await this.stations.stationBranchId(req.params.id)]);
    const { station, key } = await this.stations.rotateKey(req.params.id);
    ok(res, { station, key }, `New key for ${station.name}. The old key no longer works.`);
  });

  revokeStation = handle(async (req, res) => {
    assertInventoryBranchAccess(req, [await this.stations.stationBranchId(req.params.id)]);
    ok(res, { station: await this.stations.revoke(req.params.id) }, "Station revoked");
  });

  renameDevice = handle(async (req, res) => {
    assertInventoryBranchAccess(req, [await this.stations.deviceBranchId(req.params.id)]);
    ok(res, { device: await this.stations.renameDevice(req.params.id, req.body.name) }, "Handheld renamed");
  });
}

/** Station endpoints: the station set by `stationAuth` is the only identity. */
export class HandheldStationController {
  private stations = new HandheldStationService();
  private labels = new LabelService();

  private station(res: Response): AuthedStation {
    return res.locals.station as AuthedStation;
  }

  authenticate: RequestHandler = async (req, res, next) => {
    try {
      res.locals.station = await this.stations.authenticate(req.headers.authorization);
      next();
    } catch (error) {
      next(error);
    }
  };

  heartbeat = handle(async (req, res) => ok(res, await this.stations.heartbeat(this.station(res), req.body)));
  claim = handle(async (req, res) => ok(res, await this.stations.claim(this.station(res), req.body.deviceId)));
  confirm = handle(async (req, res) => ok(res, await this.stations.confirm(this.station(res), req.params.id, req.body.deviceId)));
  release = handle(async (req, res) => ok(res, await this.stations.release(this.station(res), req.params.id, req.body.reason)));
  result = handle(async (req, res) => ok(res, await this.stations.submitResult(this.station(res), req.body)));
  cleared = handle(async (req, res) => ok(res, await this.stations.cleared(this.station(res), req.params.deviceId, req.body)));
  claimPrints = handle(async (req, res) => ok(res, await this.labels.claim(this.station(res), req.body.printer)));
  printDone = handle(async (req, res) => ok(res, await this.labels.done(this.station(res), req.params.id, req.body)));
}

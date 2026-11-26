import { NextFunction, Request, RequestHandler, Response } from "express";
import {
  assertScopedResource,
  ownBranchScope,
} from "../../middleware/authorize";
import { PERMISSIONS, ROLES } from "../../shared/constants/roles";
import { contentDisposition } from "./campaign-download.logic";
import { CampaignDownloadService } from "./campaign-download.service";
import { CampaignService } from "./campaign.service";

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
  res
    .status(statusCode)
    .json({ status: "success", statusCode, ...(message && { message }), data });

const hasPermission = (req: Request, permission: string) =>
  req.user?.role === ROLES.SUPER_ADMIN || req.user?.permissions.includes(permission) === true;

export class CampaignController {
  private service = new CampaignService();
  private downloads = new CampaignDownloadService();

  summary = handle(async (req, res) =>
    ok(res, await this.service.summary(ownBranchScope(req.user))),
  );

  list = handle(async (req, res) =>
    ok(
      res,
      await this.service.list(req.query as never, ownBranchScope(req.user)),
    ),
  );

  get = handle(async (req, res) =>
    ok(res, {
      campaign: await this.service.get(req.params.id, ownBranchScope(req.user)),
    }),
  );

  create = handle(async (req, res) =>
    ok(
      res,
      { campaign: await this.service.create(req.body, req.user!.userId) },
      "Campaign created",
      201,
    ),
  );

  update = handle(async (req, res) =>
    ok(
      res,
      { campaign: await this.service.update(req.params.id, req.body) },
      "Campaign updated",
    ),
  );

  activate = handle(async (req, res) =>
    ok(
      res,
      { campaign: await this.service.activate(req.params.id) },
      "Campaign activated",
    ),
  );

  close = handle(async (req, res) =>
    ok(
      res,
      { campaign: await this.service.close(req.params.id) },
      "Campaign closed",
    ),
  );

  addVehicles = handle(async (req, res) => {
    const result = await this.service.addVehicles(req.params.id, req.body);
    const message = req.body.dryRun
      ? undefined
      : `Added ${result.added} vehicle(s)`;
    ok(res, result, message, req.body.dryRun ? 200 : 201);
  });

  addVinRanges = handle(async (req, res) => {
    const result = await this.service.addVinRanges(
      req.params.id,
      req.body,
      req.user!.userId,
    );
    const message = req.body.dryRun
      ? undefined
      : `Saved ${result.saved} range(s) and added ${result.added} vehicle(s)`;
    ok(res, result, message, req.body.dryRun ? 200 : 201);
  });

  removeVinRange = handle(async (req, res) =>
    ok(
      res,
      {
        campaign: await this.service.removeVinRange(
          req.params.id,
          req.params.rangeId,
        ),
      },
      "VIN range removed",
    ),
  );

  recordPrintedContacts = handle(async (req, res) => {
    const result = await this.service.recordPrintedContacts(
      req.body,
      req.user!.userId,
      ownBranchScope(req.user),
    );
    ok(res, result, `Recorded ${result.recorded} contact(s)`, 201);
  });

  listVehicles = handle(async (req, res) =>
    ok(
      res,
      await this.service.listVehicles(req.params.id, {
        ...req.query,
        branchId:
          ownBranchScope(req.user) ??
          (req.query.branchId as string | undefined),
      }),
    ),
  );

  getVehicle = handle(async (req, res) =>
    ok(res, {
      vehicle: await this.service.getVehicle(
        req.params.id,
        req.params.vehicleId,
        ownBranchScope(req.user),
      ),
    }),
  );

  updateVehicle = handle(async (req, res) => {
    const branchId = ownBranchScope(req.user);
    await this.service.updateVehicleStatus(
      req.params.id,
      [req.params.vehicleId],
      req.body,
      branchId,
    );
    ok(
      res,
      {
        vehicle: await this.service.getVehicle(
          req.params.id,
          req.params.vehicleId,
          branchId,
        ),
      },
      "Vehicle updated",
    );
  });

  bulkUpdateVehicles = handle(async (req, res) => {
    const { campaignVehicleIds, ...input } = req.body;
    const result = await this.service.updateVehicleStatus(
      req.params.id,
      campaignVehicleIds,
      input,
      ownBranchScope(req.user),
    );
    ok(res, result, `Updated ${result.updated} vehicle(s)`);
  });

  addContact = handle(async (req, res) =>
    ok(
      res,
      {
        vehicle: await this.service.addContact(
          req.params.id,
          req.params.vehicleId,
          req.body,
          req.user!.userId,
          ownBranchScope(req.user),
        ),
      },
      "Contact recorded",
      201,
    ),
  );

  schedule = handle(async (req, res) => {
    assertScopedResource(req, req.body.branchId);
    ok(
      res,
      await this.service.schedule(
        req.params.id,
        req.params.vehicleId,
        req.body,
        req.user!.userId,
        ownBranchScope(req.user),
      ),
      "Appointment booked",
      201,
    );
  });

  // ── Manuals, affected VIN download, open-campaign alert ───────────────────

  listDocuments = handle(async (req, res) =>
    ok(res, { documents: await this.downloads.listDocuments(req.params.id) }),
  );

  downloadDocument = handle(async (req, res) => {
    const doc = await this.downloads.getDocumentFile(req.params.id, req.params.documentId);
    res.setHeader("Content-Type", doc.contentType);
    res.setHeader("Content-Length", String(doc.sizeBytes));
    res.setHeader("Content-Disposition", contentDisposition(doc.fileName, req.query.disposition === "inline"));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    res.end(Buffer.from(doc.data));
  });

  uploadDocument = handle(async (req, res) =>
    ok(
      res,
      { document: await this.downloads.uploadDocument(req.params.id, req.body, req.user!.userId) },
      "Campaign manual uploaded",
      201,
    ),
  );

  deleteDocument = handle(async (req, res) => {
    await this.downloads.deleteDocument(req.params.id, req.params.documentId);
    ok(res, null, "Campaign manual removed");
  });

  /** Every affected VIN as CSV. Customer contacts are added for outreach roles only, within their branch. */
  downloadAffectedVins = handle(async (req, res) => {
    const file = await this.downloads.affectedVinsCsv(req.params.id, {
      includeContacts: hasPermission(req, PERMISSIONS.CAMPAIGN_VEHICLE_UPDATE),
      contactBranchId: ownBranchScope(req.user),
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", contentDisposition(file.fileName, false));
    res.setHeader("X-Total-Count", String(file.count));
    res.setHeader("Cache-Control", "private, no-store");
    res.send(file.csv);
  });

  openForVehicle = handle(async (req, res) =>
    ok(res, await this.downloads.openForVehicle(req.query as { vehicleId?: string; vin?: string })),
  );
}

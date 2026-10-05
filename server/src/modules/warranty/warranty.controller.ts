import { NextFunction, Request, RequestHandler, Response } from "express";
import { assertBranchOwnership } from "../../middleware/authorize";
import { ForbiddenError } from "../../shared/errors/appError";
import { PERMISSIONS, ROLES } from "../../shared/constants/roles";
import { checkVehicleWarranty } from "./warranty.coverage";
import { CaseListFilters, WarrantyCaseService } from "./warrantyCase.service";
import { CodeType, WarrantySettingsService } from "./warrantySettings.service";

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

const has = (req: Request, permission: string) =>
  req.user?.role === ROLES.SUPER_ADMIN || req.user?.permissions.includes(permission) === true;

/** Users assigned to a branch see that branch's cases; SuperAdmin and central (branchless) officers see all. */
function caseScope(req: Request): string | undefined {
  if (req.user?.role === ROLES.SUPER_ADMIN) return undefined;
  return req.user?.branchId ?? undefined;
}

export class WarrantyController {
  private cases = new WarrantyCaseService();
  private settings = new WarrantySettingsService();

  // ── Vehicle coverage ─────────────────────────────────────────────────────

  checkVehicle = handle(async (req, res) => {
    const mileage = req.query.mileage as unknown as number | undefined;
    ok(res, await checkVehicleWarranty(req.params.id, mileage));
  });

  updateVehicleWarranty = handle(async (req, res) => {
    const body = req.body as { vehicleModelId?: string | null; saleDate?: Date | null; override?: unknown };
    if ((body.vehicleModelId !== undefined || body.saleDate !== undefined) && !has(req, PERMISSIONS.WARRANTY_UPDATE)) {
      throw new ForbiddenError("Changing a vehicle's model or warranty start date needs warranty:update");
    }
    if (body.override !== undefined && !has(req, PERMISSIONS.WARRANTY_SETTINGS)) {
      throw new ForbiddenError("Extended warranty and goodwill need warranty:settings");
    }
    ok(res, await this.settings.updateVehicleWarranty(req.params.id, req.body), "Vehicle warranty updated");
  });

  // ── Models ───────────────────────────────────────────────────────────────

  listModels = handle(async (req, res) => {
    ok(res, {
      models: await this.settings.listModels({
        search: req.query.search as string | undefined,
        includeInactive: req.query.includeInactive === "true",
      }),
    });
  });

  createModel = handle(async (req, res) => ok(res, { model: await this.settings.createModel(req.body) }, "Model created", 201));

  updateModel = handle(async (req, res) =>
    ok(res, { model: await this.settings.updateModel(req.params.id, req.body) }, "Model updated"),
  );

  // ── Codes ────────────────────────────────────────────────────────────────

  listCodes = handle(async (req, res) => ok(res, await this.settings.listCodes(req.query.includeInactive === "true")));

  createCode = handle(async (req, res) =>
    ok(res, { code: await this.settings.createCode(req.params.type as CodeType, req.body) }, "Code created", 201),
  );

  updateCode = handle(async (req, res) =>
    ok(res, { code: await this.settings.updateCode(req.params.type as CodeType, req.params.id, req.body) }, "Code updated"),
  );

  searchParts = handle(async (req, res) =>
    ok(res, { parts: await this.settings.searchParts(req.query.search as string, req.query.applicableOnly === "true") }),
  );

  // ── Cases ────────────────────────────────────────────────────────────────

  summary = handle(async (req, res) => ok(res, await this.cases.summary(caseScope(req))));

  listCases = handle(async (req, res) => {
    const q = req.query as unknown as Omit<CaseListFilters, "scopeBranchId">;
    ok(res, await this.cases.list({ ...q, scopeBranchId: caseScope(req) }));
  });

  getCase = handle(async (req, res) => {
    const found = await this.cases.get(req.params.id);
    assertBranchOwnership(req, found.branchId);
    ok(res, { case: found });
  });

  openCase = handle(async (req, res) => {
    const created = await this.cases.openManually(req.body.jobCardId, req.user!.userId, req.body.complaint);
    assertBranchOwnership(req, created.branchId);
    ok(res, { case: created }, "Warranty case opened", 201);
  });

  updateCase = handle(async (req, res) => {
    assertBranchOwnership(req, await this.cases.branchOf(req.params.id));
    ok(res, { case: await this.cases.updateHeader(req.params.id, req.body) }, "Warranty case updated");
  });

  addLine = handle(async (req, res) => {
    assertBranchOwnership(req, await this.cases.branchOf(req.params.id));
    ok(res, { case: await this.cases.addLine(req.params.id, req.body) }, "Claim line added", 201);
  });

  updateLine = handle(async (req, res) => {
    assertBranchOwnership(req, await this.cases.branchOf(req.params.id));
    ok(res, { case: await this.cases.updateLine(req.params.id, req.params.lineId, req.body) }, "Claim line updated");
  });

  deleteLine = handle(async (req, res) => {
    assertBranchOwnership(req, await this.cases.branchOf(req.params.id));
    ok(res, { case: await this.cases.deleteLine(req.params.id, req.params.lineId) }, "Claim line removed");
  });

  importLines = handle(async (req, res) => {
    assertBranchOwnership(req, await this.cases.branchOf(req.params.id));
    const result = await this.cases.importFromJobCard(req.params.id);
    const message = result.imported === 0 ? "No new warranty lines to import" : `Imported ${result.imported} line(s) from the job card`;
    ok(res, result, message);
  });

  transition = handle(async (req, res) => {
    assertBranchOwnership(req, await this.cases.branchOf(req.params.id));
    const { action, ...input } = req.body;
    ok(res, { case: await this.cases.transition(req.params.id, action, input, req.user!.userId) }, "Warranty case updated");
  });
}
